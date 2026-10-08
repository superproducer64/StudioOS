// Turns measured search and analytics rows into suggested marketing tasks. Nothing here talks to
// Google or the database. Every suggestion carries the numbers it came from, because the
// database refuses measured tasks without a date and evidence. Thresholds are simple heuristics
// for the owner to judge, not predictions.
import Papa from "papaparse";

export type SearchRow = {
  query: string;
  page: string | null;
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number;
};
export type PageRow = {
  page: string;
  sessions: number;
  engagementRate: number; // 0..1
};
export type Suggestion = {
  key: string; // stable id used to avoid adding the same task twice
  source: "search_console" | "analytics";
  title: string;
  reason: string;
  evidence: Record<string, unknown>;
};
export type DateRange = { start: string; end: string };

const LIMITS = { title: 200, reason: 2000, perRule: 5, rows: 1000 };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const pct = (v: number) => (v * 100).toFixed(1) + "%";
const pos = (v: number) => v.toFixed(1);
const short = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** Search Console suggestions: low click-through, page-two rankings, and unclicked demand. */
export function searchSuggestions(rows: SearchRow[], range: DateRange): Suggestion[] {
  const clean = rows
    .slice(0, LIMITS.rows)
    .map((r) => ({
      query: String(r.query ?? "").trim(),
      page: r.page ? String(r.page) : null,
      clicks: num(r.clicks),
      impressions: num(r.impressions),
      ctr: Math.min(num(r.ctr), 1),
      position: num(r.position),
    }))
    .filter((r) => r.query && r.impressions > 0);
  const base = (r: (typeof clean)[number]) => ({
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: Number(r.ctr.toFixed(4)),
    position: Number(r.position.toFixed(1)),
    query: r.query,
    page: r.page,
    range,
  });
  const out: Suggestion[] = [];

  // Showing up near the top but rarely clicked: the title and description may be the issue.
  clean
    .filter((r) => r.impressions >= 100 && r.position <= 10 && r.ctr < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, LIMITS.perRule)
    .forEach((r) =>
      out.push({
        key: "sc-lowctr:" + r.query + "|" + (r.page ?? ""),
        source: "search_console",
        title: clip(
          'Rework the title and description for "' + r.query + '"' + (r.page ? " (" + short(r.page) + ")" : ""),
          LIMITS.title,
        ),
        reason: clip(
          r.impressions + " impressions at average position " + pos(r.position) + " but only " + pct(r.ctr) +
            " clicked (" + r.clicks + "). A clearer title or description may earn more clicks. Check the page before changing it.",
          LIMITS.reason,
        ),
        evidence: { rule: "low_ctr", ...base(r) },
      }),
    );

  // Just off page one: a nudge from better content or internal links could matter.
  clean
    .filter((r) => r.impressions >= 50 && r.position > 10 && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, LIMITS.perRule)
    .forEach((r) =>
      out.push({
        key: "sc-page2:" + r.query + "|" + (r.page ?? ""),
        source: "search_console",
        title: clip('Strengthen content for "' + r.query + '", which ranks on page two', LIMITS.title),
        reason: clip(
          r.impressions + " impressions at average position " + pos(r.position) +
            (r.page ? " on " + short(r.page) : "") +
            ". Expanding the page or linking to it from related pages may help. Rankings move for many reasons, so treat this as a lead.",
          LIMITS.reason,
        ),
        evidence: { rule: "page_two", ...base(r) },
      }),
    );

  // Searched for repeatedly on page one with zero clicks.
  clean
    .filter((r) => r.impressions >= 30 && r.clicks === 0 && r.position <= 10 && !(r.impressions >= 100 && r.ctr < 0.02))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, LIMITS.perRule)
    .forEach((r) =>
      out.push({
        key: "sc-noclicks:" + r.query + "|" + (r.page ?? ""),
        source: "search_console",
        title: clip('Check what searchers expect for "' + r.query + '"', LIMITS.title),
        reason: clip(
          r.impressions + " impressions at position " + pos(r.position) + " and no clicks. The page may not match what people are looking for.",
          LIMITS.reason,
        ),
        evidence: { rule: "no_clicks", ...base(r) },
      }),
    );
  return out;
}

/** Analytics suggestions: busy pages that visitors barely engage with. */
export function analyticsSuggestions(rows: PageRow[], range: DateRange): Suggestion[] {
  return rows
    .slice(0, LIMITS.rows)
    .filter((r) => r.page && num(r.sessions) >= 50 && num(r.engagementRate) < 0.4)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, LIMITS.perRule)
    .map((r) => ({
      key: "ga-lowengage:" + r.page,
      source: "analytics" as const,
      title: clip("Review " + short(r.page) + ": many visits, low engagement", LIMITS.title),
      reason: clip(
        r.sessions + " sessions but only " + pct(r.engagementRate) +
          " were engaged. Check that the page loads fast, answers the question and has a clear next step (call, quote form).",
        LIMITS.reason,
      ),
      evidence: {
        rule: "low_engagement",
        page: r.page,
        sessions: num(r.sessions),
        engagementRate: Number(num(r.engagementRate).toFixed(4)),
        range,
      },
    }));
}

/**
 * Reads a Search Console export (Queries.csv or Pages.csv from the Performance report).
 * Columns are matched by name, tolerant of the "Top queries" / "Top pages" first column.
 */
export function parseSearchConsoleCsv(text: string): SearchRow[] {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
  });
  const headers = parsed.meta.fields ?? [];
  const find = (...names: string[]) =>
    headers.find((h) => names.some((n) => h.trim().toLowerCase() === n));
  const queryCol = find("top queries", "query", "queries");
  const pageCol = find("top pages", "page", "pages");
  const clicksCol = find("clicks");
  const imprCol = find("impressions");
  const ctrCol = find("ctr");
  const posCol = find("position");
  if (!(queryCol || pageCol) || !clicksCol || !imprCol || !posCol)
    throw new Error(
      "That does not look like a Search Console export. It needs a Top queries (or Top pages) column plus Clicks, Impressions and Position.",
    );
  if (parsed.data.length > 5000) throw new Error("Use an export with 5,000 rows or fewer.");
  const n = (v: string | undefined) => {
    const x = Number(String(v ?? "").replace(/[,%\s]/g, ""));
    return Number.isFinite(x) && x >= 0 ? x : NaN;
  };
  return parsed.data.map((r, i) => {
    const clicks = n(r[clicksCol]);
    const impressions = n(r[imprCol]);
    const position = n(r[posCol]);
    if ([clicks, impressions, position].some(Number.isNaN))
      throw new Error("Row " + (i + 2) + " has a number that cannot be read.");
    const ctrRaw = ctrCol ? n(r[ctrCol]) : NaN;
    const ctr = Number.isNaN(ctrRaw) ? (impressions ? clicks / impressions : 0) : String(r[ctrCol!]).includes("%") ? ctrRaw / 100 : ctrRaw;
    const label = (queryCol ? r[queryCol] : r[pageCol!]) ?? "";
    return {
      query: queryCol ? label : short(label),
      page: !queryCol ? label : null,
      clicks,
      impressions,
      ctr,
      position,
    };
  });
}

/** Drops suggestions the plan already has (matched by evidence key). */
export function newSuggestions(
  suggestions: Suggestion[],
  existing: { evidence: Record<string, unknown> | null }[],
): Suggestion[] {
  const have = new Set(existing.map((a) => (a.evidence as { key?: string } | null)?.key).filter(Boolean));
  return suggestions.filter((s) => !have.has(s.key));
}

/** The date window used for pulls. Search Console data lags a couple of days. */
export function defaultRange(today = new Date(), days = 28, lagDays = 3): DateRange {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - lagDays));
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { start: iso(start), end: iso(end) };
}
