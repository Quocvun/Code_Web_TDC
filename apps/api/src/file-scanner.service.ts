import { BadRequestException, Injectable, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { createConnection, type Socket } from "node:net";

@Injectable()
export class FileScannerService implements OnModuleInit {
  private readonly host = process.env.CLAMAV_HOST?.trim() || "";
  private readonly port = Number(process.env.CLAMAV_PORT || 3310);
  private readonly required = process.env.FILE_SCAN_REQUIRED === "true";

  onModuleInit() {
    if (process.env.NODE_ENV === "production" && !this.required) throw new Error("FILE_SCAN_REQUIRED=true là bắt buộc khi NODE_ENV=production.");
    if (this.required && (!this.host || !Number.isInteger(this.port) || this.port < 1 || this.port > 65535)) throw new Error("Cấu hình CLAMAV_HOST/CLAMAV_PORT không hợp lệ.");
  }

  async scan(buffer: Buffer) {
    if (!this.host) {
      if (this.required) throw new ServiceUnavailableException("Dịch vụ quét mã độc chưa được cấu hình.");
      return "skipped-local-demo";
    }
    await this.scanWithClamAv(buffer);
    return "clean";
  }

  health() { return this.host ? "clamav-required" : "local-demo-scan-disabled"; }

  private scanWithClamAv(buffer: Buffer) {
    return new Promise<void>((resolve, reject) => {
      let response = "";
      let settled = false;
      const socket: Socket = createConnection({ host: this.host, port: this.port });
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error); else resolve();
      };
      socket.setTimeout(20_000, () => finish(new ServiceUnavailableException("Quá thời gian chờ dịch vụ quét tệp.")));
      socket.once("error", () => finish(new ServiceUnavailableException("Không kết nối được dịch vụ quét mã độc.")));
      socket.once("connect", () => {
        socket.write(Buffer.from("zINSTREAM\0", "ascii"));
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
          const size = Buffer.allocUnsafe(4);
          size.writeUInt32BE(chunk.length, 0);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", (chunk) => {
        response += chunk.toString("utf8");
        if (response.includes("FOUND")) finish(new BadRequestException("Tệp bị chặn vì bộ quét phát hiện nội dung độc hại."));
        else if (response.includes("ERROR")) finish(new ServiceUnavailableException("Bộ quét mã độc không xử lý được tệp."));
        else if (/\bOK\0?$/.test(response)) finish();
      });
      socket.once("end", () => {
        if (!settled) finish(new ServiceUnavailableException("Bộ quét mã độc đóng kết nối mà không trả kết quả."));
      });
    });
  }
}
