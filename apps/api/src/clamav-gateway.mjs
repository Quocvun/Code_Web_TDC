import { createServer } from "node:http";
import { createConnection } from "node:net";
import { timingSafeEqual } from "node:crypto";

const token = process.env.CLAMAV_GATEWAY_TOKEN || "";
const clamavHost = process.env.CLAMAV_HOST || "clamav";
const clamavPort = Number(process.env.CLAMAV_PORT || 3310);
const maxBytes = 10 * 1024 * 1024;

if (token.length < 32) throw new Error("CLAMAV_GATEWAY_TOKEN must contain at least 32 characters.");

function authorized(req) {
  const supplied = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function send(res, status, message) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(message);
}

function clamavCommand(command, file) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: clamavHost, port: clamavPort });
    let response = "";
    let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      socket.destroy();
      error ? reject(error) : resolve(result);
    };
    socket.setTimeout(25_000, () => finish(new Error("ClamAV timed out")));
    socket.once("error", () => finish(new Error("ClamAV unavailable")));
    socket.once("connect", () => {
      socket.write(Buffer.from(command, "ascii"));
      if (!file) return;
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < file.length; offset += chunkSize) {
        const chunk = file.subarray(offset, Math.min(offset + chunkSize, file.length));
        const size = Buffer.allocUnsafe(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.length > 4096) return finish(new Error("Unexpected ClamAV response"));
      if (/\bFOUND\b/.test(response)) return finish(null, "found");
      if (/\bERROR\b/.test(response)) return finish(new Error("ClamAV scan failed"));
      if (/\bOK\0?$/.test(response)) finish(null, "clean");
      if (response.includes("PONG")) finish(null, "pong");
    });
    socket.once("end", () => {
      if (!done) finish(new Error("ClamAV closed without a result"));
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 404, "Not found");
  if (!authorized(req)) return send(res, 401, "Unauthorized");
  if (req.method === "GET" && req.url === "/health") {
    try {
      await clamavCommand("zPING\0");
      return send(res, 200, "ok");
    } catch {
      return send(res, 503, "scanner unavailable");
    }
  }
  if (req.method !== "POST" || req.url !== "/scan") return send(res, 404, "Not found");
  const length = Number(req.headers["content-length"] || 0);
  if (length > maxBytes) return send(res, 413, "File too large");
  const chunks = [];
  let total = 0;
  req.on("data", (chunk) => {
    total += chunk.length;
    if (total > maxBytes) {
      send(res, 413, "File too large");
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", async () => {
    try {
      const result = await clamavCommand("zINSTREAM\0", Buffer.concat(chunks, total));
      if (result === "found") return send(res, 422, "Malware detected");
      return send(res, 200, "clean");
    } catch {
      return send(res, 503, "Scanner unavailable");
    }
  });
});

server.listen(8080, "0.0.0.0");
