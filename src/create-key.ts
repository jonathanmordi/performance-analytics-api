// Mint an API key for the write endpoints. The plaintext key is printed once
// and never stored — only its hash goes in the database.
//
//   npm run create-key -- "my laptop"

import dotenv from "dotenv";

dotenv.config({ quiet: true });

import { createKey } from "./auth";
import { pool } from "./db";

async function main() {
  const label = process.argv.slice(2).join(" ").trim();
  if (!label) {
    console.error('usage: npm run create-key -- "<label>"');
    process.exit(1);
  }
  const { id, key } = await createKey(label);
  console.log(`key ${id} (${label}):\n\n  ${key}\n\nSave it now — it can't be shown again.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
