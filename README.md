# BGP StudioOS starter · v0.1

Reconstructed from the StudioOS conversation and requested scope. FinanceOS is Module 1; clients, projects, invoices and subscriptions follow. No original ZIP was available in the retrieved conversation.

## Quick start in Work / Codex
1. Extract the ZIP and open the bgp-studioos-starter directory.
2. Use Node.js 22 LTS or newer supported LTS. Run npm ci (lockfile included after validation), then npm run dev.
3. Open http://localhost:3000. The local demo works without credentials.
4. Import samples/demo-bank.csv; select Bank, enter an account name, map Date / Description / Amount / Currency / Transaction ID, preview, and save.
5. Review suggestions at /review; approve records to populate the dashboard.
6. Give Work the contents of BUILD_PROMPT.md to continue implementation.

## Included and working
Next.js App Router + TypeScript UI, CSV column mapping for Venmo/Square/banks/cards/PayPal exports, integer-cent normalization, quoted CSV parsing, duplicate identity filtering, merchant suggestions, editable review queue, and reviewed USD dashboard. All sources use a common mapped importer, not certified provider-specific adapters. The local ledger uses browser localStorage; it is device/browser-specific and suitable for synthetic demo data. No remote upload occurs.

## Supabase setup (prepared, not connected)
Copy .env.example to .env.local and fill the project URL and browser-safe anon/publishable key. Create a Supabase project and apply supabase/migrations/001_initial_schema.sql once. Create a user through Supabase Auth; replace target_user in supabase/seed.sql with their UUID and run seed once. Seed is intentionally not idempotent. The client factory is in lib/supabase.ts. Authentication screens, session handling, account CRUD and persisted imports are next implementation tasks, not working features in this ZIP.

Every business table has owner-only RLS; composite foreign keys prevent cross-owner links. Future multi-user organizations require a separate membership model. No service-role key belongs in NEXT_PUBLIC variables. Database schema has not been applied or tested against a live project.

## CSV conventions and limits
Remove statement preambles so the first row contains unique headers. Dates accept YYYY-MM-DD or US MM/DD/YYYY, optionally with a trailing timestamp. Amounts accept a decimal point, optional dollar sign, comma thousands separators, and parentheses for negatives. Use signed amount OR separate debit/credit columns; money out is negative. Toggle positive-is-expense for applicable card exports. Currency defaults to USD; no conversion occurs. Map stable provider IDs whenever possible. Without them, identical date/description/amount/currency records within an account collide and are skipped; validate legitimate repeats before use. Provider refunds and fees need manual review. PayPal gross/net/fee columns must be deliberately selected; fees are not split automatically. Venmo payment direction must already be represented by signed amounts. Square Banking matches suggest transfers, but purchases from the account need correction. Gemini and Apple labels are broad suggestions. No rule is tax advice.

All imports enter review, including matched vendors. Unknown descriptions remain Uncategorized. Raw rows are preserved in the local demo and schema. CSV limits: 5 MB; preview displays first 100 rows but saves the full parsed batch. The demo does not implement reconciliation, audit history, receipt storage, bank connections, multi-currency totals, or formal accounting reports. Review edits persist immediately and reset approval; changing kind does not change amount signs. Correct signs by fixing and reimporting the source.

## Development and validation
npm run typecheck · npm test · npm run build. See VALIDATION.md for the actual checks performed while packaging. No AI calls or OpenAI credentials are needed for this deterministic starter. No deployment or GitHub repository has been created.

## References
Framework setup: https://nextjs.org/docs/app/getting-started/installation
Database isolation: https://supabase.com/docs/guides/database/postgres/row-level-security
