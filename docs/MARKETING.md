# Marketing module

Route: /marketing (sign-in required). Backend: migration 004, tables brand_profiles, marketing_actions, marketing_drafts, marketing_audit.

- One brand profile per client, plus at most one with no client (your own brand). Mars Roofing can be created as a client, then a profile linked to it.
- Action plan: "Add starter tasks" inserts three generic planning tasks (idempotent). Tasks claiming a Search Console, Analytics or AI source must carry a date and evidence object; the database refuses them otherwise.
- Drafts: draft -> approved -> published (recorded by you after posting yourself) -> archived. Approval records who and when from the signed-in session and cannot be set directly. Editing approved content returns it to draft. Published drafts are locked and cannot be deleted.
- Every change is written to an append-only audit table that owners can read but not alter.
- Import: accepts the JSON backup from the earlier browser-only page. Everything is validated first; approvals are not carried over (re-approve here). On failure the partial import is removed. Export downloads one brand as JSON.
- Not built: AI drafting, Search Console/Analytics pulls, posting to any channel. When added they must run server-side with the user's own session (not a service key) and create unapproved drafts only.
