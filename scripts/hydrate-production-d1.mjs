import { readFile, writeFile } from "node:fs/promises";

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
const endpoint = new URL(
  `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database`,
);
endpoint.searchParams.set("name", databaseName);
endpoint.searchParams.set("per_page", "10");

const response = await fetch(endpoint, {
  headers: {
    Authorization: `Bearer ${apiToken}`,
    Accept: "application/json",
  },
});

if (!response.ok) {
  throw new Error(`Cloudflare D1 lookup failed with HTTP ${response.status}.`);
}

const payload = await response.json();
if (!payload?.success || !Array.isArray(payload.result)) {
  throw new Error("Cloudflare D1 lookup returned an unexpected response.");
}

const matches = payload.result.filter(
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
console.log("Resolved production D1 binding from Cloudflare without exposing its identifier in source control.");
