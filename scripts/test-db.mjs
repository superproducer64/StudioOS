// Local database test runner. Applies every migration to an in-process Postgres (PGlite) that
// emulates the Supabase pieces the schema relies on (auth.users, auth.uid(), the anon and
// authenticated roles, and Supabase's default privileges), then runs supabase/tests/*.sql.
// No network, credentials or real data. Run with: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase");
const sqlFiles = (dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

const db = new PGlite();

// Supabase platform emulation.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

let failed = false;
for (const file of sqlFiles("migrations")) {
  try {
    await db.exec(readFileSync(join(root, "migrations", file), "utf8"));
    console.log("applied  " + file);
  } catch (error) {
    failed = true;
    console.error("FAILED   migrations/" + file + "\n  " + error.message);
    break;
  }
}

if (!failed) {
  for (const file of sqlFiles("tests")) {
    try {
      const results = await db.exec(readFileSync(join(root, "tests", file), "utf8"));
      const verdict = results
        .flatMap((r) => r.rows)
        .map((row) => row.verification)
        .filter(Boolean)
        .at(-1);
      if (!verdict) throw new Error("test file did not report a verification line");
      console.log("passed   tests/" + file + "\n  " + verdict);
    } catch (error) {
      failed = true;
      console.error("FAILED   tests/" + file + "\n  " + error.message);
    }
  }
}

await db.close();
process.exit(failed ? 1 : 0);
