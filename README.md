# BGP StudioOS · FinanceOS v0.2 + Marketing

Next.js + TypeScript frontend, Supabase/Postgres backend. GitHub destination: https://github.com/superproducer64/StudioOS. Supabase project: igioxmzxvtisweesgnxw.

## Run locally

Use Node.js 22 LTS or a newer supported LTS. Run npm ci, copy .env.example to .env.local, insert your Supabase publishable key, then run npm run dev. Open http://localhost:3000/login. The working copy prepared in this chat already has .env.local configured; credentials are excluded from GitHub and ZIPs.

Create your StudioOS account using your own email and password, confirm the email if required, then sign in. Supabase Auth redirect URLs must include your local or deployed login page. Open Accounts to create a finance account; open Rules and click Add missing default rules. Import samples/demo-bank.csv with a USD account, Bank source and Date / Description / Amount / Currency / Transaction ID mapping. Review and approve records; Dashboard summarizes approved USD activity.

## Implemented

- Supabase email/password signup, sign-in, session display and sign-out.
- Finance screens hidden unless signed in; data requests use authenticated sessions and owner-only database RLS.
- Accounts creation and listing; stable account UUIDs used for imports.
- Mapped CSV imports for Venmo, Square, banks, cards and PayPal.
- Atomic database import batches, duplicate identity skipping, raw-row retention and review queue.
- Saved category/kind decisions and immutable client-facing audit history.
- Import history with reversible exclusion and restoration; records are retained.
- Editable per-user merchant rules and idempotent default rule seeding.
- Date-filtered reviewed income/expenses/net activity, excluding transfers and non-USD currencies; refunds reduce expenses.
- v0.2 finance: business/personal/mixed classification (required to approve non-transfers), an owner-set "flag for tax review" note for expenses, project tagging, and a Reports page (monthly totals, business/personal split, project income/expense/invoiced/paid, recurring spend, tax-flag CSV for an accountant).
- Clients, projects, invoices (line items drive the total; draft, sent, partial payments, paid, void; overdue derived from the due date), subscriptions and assets workflows.
- Saved CSV mapping templates per account on the Import page.
- Search and analytics: Search Console CSV import and optional read-only Google pulls become evidence-backed Marketing tasks you approve (docs/INSIGHTS.md). Live pulls are untested against real Google until credentials are added.
- Marketing module (migration 004): per-client brand profiles, an action plan, and a draft review queue. Approval is a recorded human decision enforced by database triggers; editing approved content withdraws approval; published content is locked; changes are written to an append-only audit table. Nothing is posted anywhere and no AI or analytics integration is connected yet. An export of the old browser-only marketing page can be imported (approvals are not carried over).

The former browser-local demo is no longer loaded or silently migrated. Only the auth session is stored by the Supabase client; finance rows are fetched from the database. The route gate is a UI convenience; RLS enforces data access regardless of which page or API is used.

## Database setup

Migrations 001 and 002 were applied to the StudioOS project earlier. **Migrations 003_finance_v02.sql and 004_marketing.sql are NOT applied yet.** Apply them in order (SQL editor or `supabase db push`) after reviewing; each runs in one transaction. Do not rerun earlier migrations. For another empty project, apply them in order. Functions commit_import, review_transaction, set_import_reversed and seed_finance_rules run with invoker privileges; the isolated audit trigger uses a restricted definer function. Owners cannot write audit records directly.

Default rules are initialized from the Rules page for the signed-in user; no privileged key is required. The legacy seed.sql is an optional admin seed for a new project after inserting an existing Auth user UUID. Use the Rules page for this project instead.

## CSV conventions

See docs/IMPORT_GUIDE.md. First row must contain headers; exports with preambles require cleanup. Map ISO or US dates, a signed amount OR debit/credit columns, optional currency and provider ID. Negative is money out. Positive expense values are refunds; negative income values reverse revenue. Card positive-is-expense mapping reverses issuer signs. Amounts use integer cents. Currency must match the account; currency conversion is not implemented.

Imports accept up to 5 MB / 5,000 rows; preview shows the first 100. Stable provider IDs are recommended. Without IDs, identical same-day description/amount/currency records may collide. Importing again skips existing identities without replacing approved records. Reversing an import retains identities; restore it rather than reimporting it. PayPal fees must be represented explicitly; no automatic fee splitting. Provider-specific certified adapters require actual sample exports and are not included.

Rules are editable suggestions; all rows require review. Square Banking can refer to transfers or purchases. Apple and Gemini names can be ambiguous. The dashboard is an unreconciled transaction summary, not formal P&L, cash flow or tax advice. No automatic bank connection, accounting reconciliation, receipt OCR, multi-user organizations, subscription reporting, or deployment is included.

## Validation

`npm test` (16 unit tests), `npm run typecheck`, `npm run build` and `npm run test:db` pass. `test:db` applies every migration to an in-process Postgres (PGlite) with Supabase-style roles and `auth.uid()` and runs the SQL suites in `supabase/tests`: RLS isolation, grants, triggers, report math and the marketing approval workflow. It is a faithful local check, not the live database; run the same SQL suites against Supabase after applying 003/004. Signup/email confirmation and a full browser walkthrough still need to be exercised by you. See VALIDATION.md.

## References

https://nextjs.org/docs/app/getting-started/installation
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/database/functions
