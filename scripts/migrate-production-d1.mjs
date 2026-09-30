import { spawnSync } from "node:child_process";

const isWorkersBuild = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH?.trim();

if (!isWorkersBuild || branch !== "main") {
  console.log("Skipping production D1 migrations outside a Cloudflare Workers Build on main.");
  process.exit(0);
}

const result = spawnSync("npm", ["run", "db:migrate:remote"], { stdio: "inherit" });

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("Applied production D1 migrations before the Cloudflare deploy command.");
