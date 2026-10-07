# Work / Codex build prompt

Build BGP StudioOS v0.1 from this starter using Next.js, TypeScript, Supabase/Postgres and a GitHub-first workflow. Read README.md, ROADMAP.md, VALIDATION.md and the source before changing code. Preserve FinanceOS as Module 1.

First run npm ci, npm test, npm run typecheck and npm run build. Inspect current dependencies and update responsibly. Implement Supabase Auth and session handling, authenticated account management and owner-isolated persistence. Replace localStorage demo data with database-backed import batches, transactions and review. Do not migrate browser data silently. Apply migrations only to the explicitly selected Supabase project. Keep all privileged credentials server-side.

Support actual sample exports from Venmo, Square Banking, bank accounts, cards and PayPal using explicit column mapping and tested adapters where appropriate. Use integer cents, validated dates/currencies, signed inflow/outflow, durable provider IDs, atomic import commits and import rollback/history. Preserve raw source records and explain skipped duplicates. Handle PayPal fees and card refunds explicitly. Unknown or ambiguous records require review. Square Banking transfers must be distinguished from operating purchases and excluded from income/expense totals only after review.

Include editable category rules for Square Banking, OpenAI, Anthropic, Gemini, Apple, Replit, Supabase, GitHub, Vercel and FedEx Office. Save user corrections as optional future rules; do not retroactively overwrite approved records. Add an audit trail. Dashboard: date filters, reviewed income/expenses, transfer-excluded net activity, recurring spend and review counts. Do not label unreconciled transaction sums as formal P&L or cash flow.

Keep clients/projects/invoices/subscriptions foundations aligned with the schema; ship their workflows in v0.2. Test cross-user RLS including foreign-key ownership, duplicate/repeated imports, quoted CSV, malformed rows, date formats, refunds, transfers, mixed currencies, fee handling and partial failures. Use synthetic records until storage/security behavior is verified.

Prepare a clean Git repository and reviewable changes. Ask for required account/project details only when implementation needs them; do not publish, deploy, send financial data to models or create external resources without authorization. Report what works, what is prepared, validation performed and remaining gaps.
