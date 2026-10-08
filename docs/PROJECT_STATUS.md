# StudioOS project status

Repository: https://github.com/superproducer64/StudioOS
Supabase project: igioxmzxvtisweesgnxw

Live: migrations 001 and 002 (FinanceOS v0.1).
On branch `feature/finance-v02-and-marketing-backend`, awaiting review: migrations 003 (finance v0.2) and 004 (marketing), the new screens, and the local database test harness. They have not been applied to the live database, and no deploy has happened.

Verified locally: unit tests, typecheck, production build, and the SQL suites against in-process Postgres. Not verified: the live Supabase project, browser walkthrough, and any external integration (none are connected).

Next steps for the owner: review the PR, apply 003 then 004, sign in and try the flows (classify and approve a transaction, create a project and invoice, create a Mars Roofing brand profile and run a draft through approval). Decide whether to connect AI drafting and Search Console/Analytics; those need your credentials and are not started.
