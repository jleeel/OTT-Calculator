/**
 * Print the leaderboard migration to stdout for pasting into the Supabase
 * SQL editor. There is no local Supabase CLI in this project — the dashboard
 * is the only place migrations get applied.
 *
 *   npm run migration:print
 *   npm run migration:print > /tmp/leaderboard.sql
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("No migrations found in supabase/migrations/");
  process.exit(1);
}

const banner = (text) => `-- ${"=".repeat(74)}\n-- ${text}\n-- ${"=".repeat(74)}`;

for (const file of files) {
  process.stdout.write(`${banner(`supabase/migrations/${file}`)}\n\n`);
  process.stdout.write(readFileSync(join(dir, file), "utf8").trimEnd());
  process.stdout.write("\n\n");
}
