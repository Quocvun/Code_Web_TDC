import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, CLOUDFLARE_STATIC_EXPORT: "1", NEXT_PUBLIC_DEMO_MODE: "true", NODE_ENV: "production" };
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [path.join(root, "apps", "api", "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.build.json"], path.join(root, "apps", "api"));
run(process.execPath, [path.join(root, "apps", "web", "node_modules", "next", "dist", "bin", "next"), "build"], path.join(root, "apps", "web"));
