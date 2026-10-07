# Validation · October 6, 2026

- npm ci succeeded using the lockfile.
- npm run typecheck passed.
- npm test passed: 7 tests cover integer cents, malformed amounts, quoted CSV, raw preservation, dates, debit/credit/card signs, merchant rules, transfers, provider IDs, refunds, date ranges and currency exclusions.
- npm run build passed with Next.js 16.4.0; Dashboard, Accounts, Import, Review, Rules, Import history, Login and Foundations routes generated.
- Supabase migrations 001 and 002 applied successfully to igioxmzxvtisweesgnxw through the authenticated SQL Editor.
- Read-only public API probe returned permission denied for accounts without a user session, as intended.
- supabase/tests/finance_rls.sql passed against the live database: atomic imports, repeated imports, invalid-batch rollback, review approval, reversal/restoration, audit capture, idempotent rule seeding, cross-user read isolation, foreign-key ownership, cross-owner writes and audit-write denial. Fixtures had no passwords/emails and were rolled back.

Remaining verification: user signup and email confirmation, authenticated browser import/edit/reload/sign-out, provider-specific exports, recovery flows, production hosting and sustained load. The project is not deployed. No real financial data was used in validation.

The local browser preview was checked: signed-out finance routes display the sign-in gate, and /login displays the account form. Exact localhost and 127.0.0.1 login redirect URLs were saved and verified in Supabase. GitHub upload remains blocked by integration/browser file access; no remote commit was created.
