import { readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../wrangler.jsonc", import.meta.url);
const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!accountId || !apiToken) {
  throw new Error("Cloudflare deployment credentials are required to resolve the production D1 binding.");
}

const config = await readFile(CONFIG_PATH, "utf8");
const workerNameMatch = config.match(/"name"\s*:\s*"([^"]+)"/);
const bindingMatch = config.match(/"binding"\s*:\s*"([^"]+)"\s*,\s*\n\s*"database_name"/);

if (!workerNameMatch?.[1]) {
  throw new Error("wrangler.jsonc does not declare a Worker name.");
}

if (!bindingMatch?.[1]) {
  throw new Error("wrangler.jsonc does not declare a D1 binding name.");
}

if (!config.includes(`"database_id": "${PLACEHOLDER_DATABASE_ID}"`)) {
  throw new Error("wrangler.jsonc must contain the non-production D1 placeholder before deployment hydration.");
}

const workerName = workerNameMatch[1];
const bindingName = bindingMatch[1];
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/settings`;

let payload;
try {
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  payload = await response.json();
} catch {
  throw new Error(
    "Cloudflare could not return the currently deployed Worker bindings. Verify the deployment token has Workers Scripts access and the configured account is correct.",
  );
}

const bindings = payload?.result?.bindings;
if (!payload?.success || !Array.isArray(bindings)) {
  throw new Error("Cloudflare Worker settings returned an unexpected response.");
}

const matches = bindings.filter(
  (binding) =>
    binding?.type === "d1"
    && binding?.name === bindingName
    && typeof (binding?.database_id ?? binding?.id) === "string",
);

if (matches.length !== 1) {
  throw new Error(`Expected exactly one deployed D1 binding named ${bindingName}; found ${matches.length}.`);
}

const databaseId = matches[0].database_id ?? matches[0].id;
const hydrated = config.replace(
  `"database_id": "${PLACEHOLDER_DATABASE_ID}"`,
  `"database_id": "${databaseId}"`,
);

if (hydrated === config) {
  throw new Error("Production D1 binding could not be hydrated.");
}

await writeFile(CONFIG_PATH, hydrated, "utf8");
console.log("Resolved production D1 binding from the deployed Worker without exposing its identifier in source control.");
