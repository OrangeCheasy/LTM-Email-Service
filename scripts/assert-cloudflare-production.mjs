const isWorkersBuild = process.env.WORKERS_CI === "1";
const branch = process.env.WORKERS_CI_BRANCH?.trim();

if (!isWorkersBuild || branch !== "main") {
  throw new Error("Production deployment is allowed only from the main branch in Cloudflare Workers Builds.");
}

console.log("Cloudflare production deployment target verified: main.");
