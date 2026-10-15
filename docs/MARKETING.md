# Marketing module

Route: /marketing (sign-in required). Backend: migration 004, tables brand_profiles, marketing_actions, marketing_drafts, marketing_audit.

- One brand profile per client, plus at most one with no client (your own brand). Mars Roofing can be created as a client, then a profile linked to it.
- Action plan: "Add starter tasks" inserts three generic planning tasks (idempotent). Tasks claiming a Search Console, Analytics or AI source must carry a date and evidence object; the database refuses them otherwise.
- Drafts: draft -> approved -> published (recorded by you after posting yourself) -> archived. Approval records who and when from the signed-in session and cannot be set directly. Editing approved content returns it to draft. Published drafts are locked and cannot be deleted.
- Every change is written to an append-only audit table that owners can read but not alter.
- Import: accepts the JSON backup from the earlier browser-only page. Everything is validated first; approvals are not carried over (re-approve here). On failure the partial import is removed. Export downloads one brand as JSON.
- Not built: AI drafting, Search Console/Analytics pulls, posting to any channel. When added they must run server-side with the user's own session (not a service key) and create unapproved drafts only.

## AI first drafts (optional)

Each open task gets a **Draft with AI** button once an AI key is configured. It writes a first draft for the channel you pick (website, blog, Google Business, Facebook, Instagram, email).

How it stays safe:
- The server route reads your brand profile and the task **as you** (row-level security applies), calls the AI provider, and returns text. It does not save anything and uses no service-role key.
- The page saves the result as an **unapproved draft** marked "AI-generated". The database still requires your own approval before it can be marked approved, and editing wipes an approval.
- The prompt forbids invented reviews, licenses, prices, years, guarantees and ranking promises. Missing facts come back as `[CONFIRM: ...]` gaps for you to fill in.
- Nothing is ever posted for you.

Setup (server-only, in `.env.local`, never committed):
```
ANTHROPIC_API_KEY=your-key
# optional: LLM_MODEL=claude-sonnet-5-5
```
OpenAI instead: `LLM_PROVIDER=openai`, `OPENAI_API_KEY=...`, and set `LLM_MODEL`. Restart `npm run dev` after editing.

Cost control: set a monthly spend limit in the provider's console. The app also allows at most one request per 3 seconds and 30 per hour per user per server instance (best effort, not a billing cap).

Not tested live: calls to the real AI provider (tests use a fake). Try one draft and read it before relying on it.

The screen will not let you approve a draft that still contains a `[CONFIRM: ...]` placeholder, and AI drafting is not offered on the generic starter checklist tasks. This guard is in the app, not the database: it keeps you from approving by accident, but it is not a security boundary.
