// Server-only. Reads Search Console and GA4 with a Google service account that was added as a
// read-only user on the property. Never import this from a client component: it reads secrets
// from the server environment. Nothing here writes to Google.
import { createSign } from "node:crypto";
import type { DateRange, PageRow, SearchRow } from "./insights";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
].join(" ");
type Fetch = typeof fetch;

export type ServiceAccount = { client_email: string; private_key: string };
export type SiteConfig = { profileWebsite: string; searchConsole?: string; ga4?: string };

export function readConfig(env: Record<string, string | undefined> = process.env): {
  account: ServiceAccount;
  sites: SiteConfig[];
} | null {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sitesRaw = env.INSIGHTS_SITES;
  if (!raw || !sitesRaw) return null;
  const account = JSON.parse(raw) as ServiceAccount;
  const sites = JSON.parse(sitesRaw) as SiteConfig[];
  if (!account.client_email || !account.private_key || !Array.isArray(sites))
    throw new Error("Insights environment variables are malformed.");
  return { account, sites };
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");
export function signAssertion(account: ServiceAccount, now = Math.floor(Date.now() / 1000)) {
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPES,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3000,
    }),
  );
  const sig = createSign("RSA-SHA256").update(head + "." + claims).sign(account.private_key);
  return head + "." + claims + "." + b64(sig);
}

export async function accessToken(account: ServiceAccount, f: Fetch = fetch) {
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signAssertion(account),
    }),
  });
  if (!res.ok) throw new Error("Google sign-in failed (" + res.status + "). Check the service account key.");
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function fetchSearch(token: string, site: string, range: DateRange, f: Fetch = fetch): Promise<SearchRow[]> {
  const res = await f(
    "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(site) + "/searchAnalytics/query",
    {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        startDate: range.start,
        endDate: range.end,
        dimensions: ["query", "page"],
        rowLimit: 250,
      }),
    },
  );
  if (!res.ok)
    throw new Error(
      res.status === 403
        ? "Search Console says this service account has no access to " + site + ". Add its email as a user on the property."
        : "Search Console request failed (" + res.status + ").",
    );
  const data = (await res.json()) as {
    rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
  };
  return (data.rows ?? []).map((r) => ({
    query: r.keys[0] ?? "",
    page: r.keys[1] ?? null,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

export async function fetchPages(token: string, property: string, range: DateRange, f: Fetch = fetch): Promise<PageRow[]> {
  if (!/^\d{3,20}$/.test(property)) throw new Error("GA4 property id must be numeric.");
  const res = await f("https://analyticsdata.googleapis.com/v1beta/properties/" + property + ":runReport", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: range.start, endDate: range.end }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }, { name: "engagementRate" }],
      limit: 250,
    }),
  });
  if (!res.ok)
    throw new Error(
      res.status === 403
        ? "Analytics says this service account has no access to property " + property + ". Add its email as a Viewer."
        : "Analytics request failed (" + res.status + ").",
    );
  const data = (await res.json()) as {
    rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  };
  return (data.rows ?? []).map((r) => ({
    page: r.dimensionValues[0]?.value ?? "",
    sessions: Number(r.metricValues[0]?.value ?? 0),
    engagementRate: Number(r.metricValues[1]?.value ?? 0),
  }));
}
