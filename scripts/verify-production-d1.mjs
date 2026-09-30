import { readFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../dist/ltm_email_service/wrangler.json", import.meta.url);
const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";

const config = await readFile(CONFIG_PATH, "utf8");

if (config.includes(PLACEHOLDER_DATABASE_ID)) {
  throw new Error("Generated Wrangler config still contains the placeholder D1 database ID.");
}

console.log("Generated Wrangler config contains the resolved production D1 binding.");
