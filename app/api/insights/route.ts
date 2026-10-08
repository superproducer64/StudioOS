import { createClient } from "@supabase/supabase-js";
import { accessToken, fetchPages, fetchSearch, readConfig } from "@/lib/google";
import { analyticsSuggestions, defaultRange, searchSuggestions } from "@/lib/insights";

// Reads measured data for one brand profile's website and returns suggested tasks. It does not
// write anything: the signed-in owner reviews the suggestions and adds the ones they want.
const json = (body: unknown, status = 200) => Response.json(body, { status });
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

async function signedIn(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return false;
  const { data, error } = await createClient(url, key).auth.getUser(token);
  return !error && !!data.user;
}

export async function GET() {
  // Lets the page know whether live pulls are set up, without exposing any secret.
  try {
    return json({ configured: !!readConfig() });
  } catch {
    return json({ configured: false });
  }
}

export async function POST(request: Request) {
  if (!(await signedIn(request))) return json({ error: "Sign in required." }, 401);
  let website = "";
  try {
    const body = (await request.json()) as { website?: unknown };
    website = typeof body.website === "string" ? body.website : "";
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  try {
    const config = readConfig();
    if (!config) return json({ error: "Live pulls are not set up yet. See docs/INSIGHTS.md." }, 501);
    const site = config.sites.find((s) => host(s.profileWebsite) && host(s.profileWebsite) === host(website));
    if (!site) return json({ error: "This website is not in INSIGHTS_SITES, so it cannot be pulled." }, 404);
    const range = defaultRange();
    const token = await accessToken(config.account);
    const [search, pages] = await Promise.all([
      site.searchConsole ? fetchSearch(token, site.searchConsole, range) : Promise.resolve(null),
      site.ga4 ? fetchPages(token, site.ga4, range) : Promise.resolve(null),
    ]);
    return json({
      range,
      searchConsole: search ? { rows: search.length, suggestions: searchSuggestions(search, range) } : null,
      analytics: pages ? { rows: pages.length, suggestions: analyticsSuggestions(pages, range) } : null,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}
