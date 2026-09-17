import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const CONFIG_PATH = new URL("../wrangler.jsonc", import.meta.url);
const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!accountId || !apiToken) {
  throw new Error("Cloudflare deployment credentials are required to resolve the production D1 binding.");
}

const config = await readFile(CONFIG_PATH, "utf8");
const databaseNameMatch = config.match(/"database_name"\s*:\s*"([^"]+)"/);

if (!databaseNameMatch?.[1]) {
  throw new Error("wrangler.jsonc does not declare a D1 database_name.");
}

if (!config.includes(`"database_id": "${PLACEHOLDER_DATABASE_ID}"`)) {
  throw new Error("wrangler.jsonc must contain the non-production D1 placeholder before deployment hydration.");
}

const databaseName = databaseNameMatch[1];

let databases;
try {
  const { stdout } = await execFileAsync(
    "npx",
    ["--no-install", "wrangler", "d1", "list", "--json"],
    {
      env: {
        ...process.env,
        CI: "true",
        NO_COLOR: "1",
      },
      maxBuffer: 1024 * 1024,
    },
  );

  databases = JSON.parse(stdout);
} catch {
  throw new Error(
    "Wrangler could not list production D1 databases. Verify the deployment token has D1 access and the configured Cloudflare account is correct.",
  );
}

if (!Array.isArray(databases)) {
  throw new Error("Wrangler D1 lookup returned an unexpected response.");
}

const matches = databases.filter(
  (database) => database?.name === databaseName && typeof database?.uuid === "string",
);

if (matches.length !== 1) {
  throw new Error(`Expected exactly one production D1 database named ${databaseName}; found ${matches.length}.`);
}

const databaseId = matches[0].uuid;
const hydrated = config.replace(
  `"database_id": "${PLACEHOLDER_DATABASE_ID}"`,
  `"database_id": "${databaseId}"`,
);

if (hydrated === config) {
  throw new Error("Production D1 binding could not be hydrated.");
}

await writeFile(CONFIG_PATH, hydrated, "utf8");
console.log("Resolved production D1 binding through Wrangler without exposing its identifier in source control.");
