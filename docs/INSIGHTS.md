# Search and analytics (Marketing)

Turns real Search Console and Google Analytics 4 numbers into suggested Marketing tasks. Each task keeps its source, the date range and the raw numbers (the database refuses measured tasks without them). Suggestions are leads to check, not predictions. Nothing is changed on Google or on the website: access is read-only, and you choose which suggestions to add.

## Option A: CSV import (no setup)

1. In Search Console open Performance, set the date range, and Export -> Download CSV.
2. On /marketing, in "Search and analytics", enter the dates the export covers, choose the Queries.csv (or Pages.csv) file, tick the suggestions you want and click Add selected to plan.

## Option B: Pull from Google (one-time setup)

1. Google Cloud console: create a project (free). Enable the **Google Search Console API** and the **Google Analytics Data API**.
2. IAM & Admin -> Service accounts -> create one (no roles needed). Keys -> Add key -> JSON. Keep the file private.
3. Search Console -> Settings -> Users and permissions -> Add user: the service account's email, permission **Restricted** (read-only).
4. GA4 -> Admin -> Property access management -> add the same email as **Viewer**. Note the numeric Property ID (Admin -> Property details).
5. In `.env.local` (server-only, never commit, never prefix with NEXT_PUBLIC_):

```
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}
INSIGHTS_SITES=[{"profileWebsite":"https://marsroofing.com","searchConsole":"sc-domain:marsroofing.com","ga4":"123456789"}]
```

Both values must be single lines of JSON. Use `sc-domain:marsroofing.com` for a Domain property, or the exact URL (e.g. `https://marsroofing.com/`) for a URL-prefix property. Restart `npm run dev`.

6. On /marketing, make sure the brand profile's website is `https://marsroofing.com`, then click **Pull from Google**.

Only websites listed in INSIGHTS_SITES can be pulled. The route requires a signed-in StudioOS session, uses the last 28 days ending 3 days ago (data lags), and returns at most 15 suggestions.

## Rules used (simple, editable in `lib/insights.ts`)

- Low click-through: 100+ impressions, position 10 or better, under 2% clicked.
- Page two: 50+ impressions at positions 11-20.
- No clicks: 30+ impressions, position 10 or better, zero clicks.
- Low engagement (Analytics): 50+ sessions and under 40% engagement.

## Deploying

Server environment variables must be set in your host's settings. If you deploy as a static export, the API route will not run; CSV import still works.
