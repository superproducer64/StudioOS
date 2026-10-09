import { createClient } from "@supabase/supabase-js";
import { buildPrompt, parseDraft, confirmItems } from "@/lib/drafting";
import { complete, readLlmConfig } from "@/lib/llm";
import { channels, type BrandProfile, type Channel, type MarketingAction } from "@/lib/marketing";

// Asks the AI provider for a first draft of one task. It reads the brand profile and task as
// the signed-in user (row-level security applies), and it does NOT save anything: the page
// saves the result as an unapproved draft that a person must review and approve.
const json = (body: unknown, status = 200) => Response.json(body, { status });

// Best-effort guard against runaway clicks (per server instance). The real spending cap is the
// monthly limit you set in the AI provider's console.
const recent = new Map<string, number[]>();
function allowed(user: string, now = Date.now()) {
  const hits = (recent.get(user) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= 30 || (hits.length && now - hits[hits.length - 1] < 3_000)) {
    recent.set(user, hits);
    return false;
  }
  recent.set(user, [...hits, now]);
  return true;
}

export async function GET() {
  try {
    return json({ configured: !!readLlmConfig() });
  } catch {
    return json({ configured: false });
  }
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return json({ error: "Sign in required." }, 401);
  // A client that carries the user's own token, so every read below is limited by RLS.
  const sb = createClient(url, key, { global: { headers: { Authorization: "Bearer " + token } } });
  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Sign in required." }, 401);

  let body: { profileId?: unknown; actionId?: unknown; channel?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const { profileId, actionId, channel } = body;
  if (typeof profileId !== "string" || typeof actionId !== "string" || !channels.includes(channel as Channel))
    return json({ error: "Invalid request." }, 400);

  let config;
  try {
    config = readLlmConfig();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (!config) return json({ error: "AI drafting is not set up yet. See docs/MARKETING.md." }, 501);
  if (!allowed(auth.user.id)) return json({ error: "Slow down a little and try again in a few seconds." }, 429);

  const profile = await sb.from("brand_profiles").select("*").eq("id", profileId).maybeSingle();
  const action = await sb
    .from("marketing_actions")
    .select("*")
    .eq("id", actionId)
    .eq("brand_profile_id", profileId)
    .maybeSingle();
  if (profile.error || action.error || !profile.data || !action.data)
    return json({ error: "Brand profile or task not found." }, 404);

  try {
    const prompt = buildPrompt(profile.data as BrandProfile, action.data as MarketingAction, channel as Channel);
    const draft = parseDraft(await complete(config, prompt));
    return json({ ...draft, confirm: confirmItems(draft.body) });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}
