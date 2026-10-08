import test from "node:test";
import assert from "node:assert/strict";
import {
  analyticsSuggestions,
  defaultRange,
  newSuggestions,
  parseSearchConsoleCsv,
  searchSuggestions,
  type SearchRow,
} from "../lib/insights";

const range = { start: "2026-09-10", end: "2026-10-07" };
const row = (o: Partial<SearchRow>): SearchRow => ({
  query: "q", page: null, clicks: 0, impressions: 0, ctr: 0, position: 5, ...o,
});

test("search suggestions follow simple rules and carry their numbers as evidence", () => {
  const s = searchSuggestions(
    [
      row({ query: "roof repair houston", clicks: 3, impressions: 400, ctr: 0.0075, position: 4.2, page: "https://marsroofing.com/repair" }),
      row({ query: "roof inspection cost", clicks: 5, impressions: 120, ctr: 0.04, position: 14.8 }),
      row({ query: "storm damage claim help", clicks: 0, impressions: 45, ctr: 0, position: 7 }),
      row({ query: "healthy query", clicks: 80, impressions: 500, ctr: 0.16, position: 2 }),
    ],
    range,
  );
  assert.deepEqual(s.map((x) => x.evidence.rule).sort(), ["low_ctr", "no_clicks", "page_two"]);
  const low = s.find((x) => x.evidence.rule === "low_ctr")!;
  assert.equal(low.source, "search_console");
  assert.equal(low.evidence.impressions, 400);
  assert.deepEqual(low.evidence.range, range);
  assert.match(low.reason, /400 impressions/);
  assert.ok(!/guarantee|will rank|will increase/i.test(low.reason));
});

test("bad or empty rows never produce suggestions", () => {
  assert.deepEqual(searchSuggestions([row({ query: "  ", impressions: 900, position: 3 })], range), []);
  assert.deepEqual(searchSuggestions([row({ query: "x", impressions: NaN as number, position: 3 })], range), []);
});

test("analytics flags busy pages with low engagement only", () => {
  const s = analyticsSuggestions(
    [
      { page: "/pricing", sessions: 200, engagementRate: 0.25 },
      { page: "/", sessions: 900, engagementRate: 0.7 },
      { page: "/tiny", sessions: 10, engagementRate: 0.1 },
    ],
    range,
  );
  assert.equal(s.length, 1);
  assert.equal(s[0].source, "analytics");
  assert.equal(s[0].evidence.sessions, 200);
});

test("a Search Console CSV export is parsed and rejects the wrong file", () => {
  const rows = parseSearchConsoleCsv(
    "﻿Top queries,Clicks,Impressions,CTR,Position\nroof repair,5,300,1.7%,6.1\n\"leak, fix\",0,40,0%,9\n",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ctr, 0.017);
  assert.equal(rows[1].query, "leak, fix");
  assert.throws(() => parseSearchConsoleCsv("name,amount\nfoo,1\n"), /Search Console export/);
  assert.throws(() => parseSearchConsoleCsv("Top queries,Clicks,Impressions,CTR,Position\nx,abc,1,1%,2\n"), /Row 2/);
});

test("already-added suggestions are skipped, and the date window lags three days", () => {
  const s = searchSuggestions([row({ query: "a", impressions: 200, position: 3, ctr: 0.001, clicks: 0 })], range);
  assert.equal(newSuggestions(s, [{ evidence: { key: s[0].key } }]).length, 0);
  assert.equal(newSuggestions(s, [{ evidence: null }]).length, 1);
  assert.deepEqual(defaultRange(new Date("2026-10-10T12:00:00Z")), { start: "2026-09-10", end: "2026-10-07" });
});
