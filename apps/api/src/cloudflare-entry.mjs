import { httpServerHandler } from "cloudflare:node";
import { configureCloudflareDatabase } from "../dist/cloudflare-runtime.js";

let handlerPromise;

export default {
  async fetch(request, env, context) {
    if (!new URL(request.url).pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    configureCloudflareDatabase(env.DB);
    if (!handlerPromise) {
      handlerPromise = (async () => {
        const { startCloudflareApiServer } = await import("../dist/main.js");
        const server = await startCloudflareApiServer();
        return httpServerHandler(server);
      })();
    }
    const response = await (await handlerPromise).fetch(request, env, context);
    if (!(response instanceof Response)) throw new Error("Cloudflare Node HTTP adapter did not return a Response.");
    return response;
  },
};
