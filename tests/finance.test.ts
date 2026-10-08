import test from "node:test";
import assert from "node:assert/strict";
import { money, parseCsv, normalize } from "../lib/imports";
import { categorize } from "../lib/rules";
test("currency parsing uses integer cents and rejects malformed values", () => {
  assert.equal(money("($1,234.50)"), -123450);
  assert.equal(money("0.29"), 29);
  assert.throws(() => money("12abc"));
});
test("quoted CSV and normalization preserve raw fields", () => {
  const p = parseCsv(
    'Date,Description,Amount,ID\n2026-10-01,"OpenAI, subscription",-20.00,a1',
  );
  const t = normalize(
    p.rows,
    { date: "Date", description: "Description", amount: "Amount", id: "ID" },
    "Card",
    "Business",
  )[0];
  assert.equal(t.amountCents, -2000);
  assert.equal(t.category, "AI tools");
  assert.equal(t.reviewed, false);
  assert.equal(t.raw.ID, "a1");
});
test("invalid dates fail with row context", () => {
  assert.throws(
    () =>
      normalize(
        [{ d: "2026-02-30", memo: "x", a: "1" }],
        { date: "d", description: "memo", amount: "a" },
        "Bank",
        "A",
      ),
    /Row 2/,
  );
});
test("debit-credit and card sign conventions", () => {
  assert.equal(
    normalize(
      [{ d: "10/01/2026", memo: "x", out: "12.00", in: "" }],
      { date: "d", description: "memo", debit: "out", credit: "in" },
      "Bank",
      "A",
    )[0].amountCents,
    -1200,
  );
  assert.equal(
    normalize(
      [{ d: "2026-10-01", memo: "x", a: "10" }],
      { date: "d", description: "memo", amount: "a", positiveIsExpense: true },
      "Card",
      "A",
    )[0].amountCents,
    -1000,
  );
});
test("unknown vendors and Square transfers stay distinguishable", () => {
  assert.equal(categorize("unknown", -100).category, "Uncategorized");
  assert.equal(categorize("Square Banking payout", 100).kind, "transfer");
  assert.equal(categorize("Apple refund", 100).kind, "expense");
});
test("provider IDs distinguish otherwise identical transactions", () => {
  const rows = ["1", "2"].map((id) => ({
    d: "2026-10-01",
    memo: "Coffee",
    a: "-5",
    id,
  }));
  assert.notEqual(
    ...(normalize(
      rows,
      { date: "d", description: "memo", amount: "a", id: "id" },
      "Card",
      "A",
    ).map((t) => t.id) as [string, string]),
  );
});

import { summarize } from "../lib/dashboard";
test("dashboard expenses are reduced by refunds and exclude transfers and foreign currencies", () => {
  const base = normalize(
    [
      { d: "2026-10-01", memo: "Apple", a: "-100" },
      { d: "2026-10-02", memo: "Apple refund", a: "20" },
      { d: "2026-10-03", memo: "Square Banking", a: "900" },
    ],
    { date: "d", description: "memo", amount: "a" },
    "Bank",
    "A",
  ).map((t) => ({ ...t, reviewed: true }));
  assert.equal(summarize(base).expenses, 8000);
  assert.equal(summarize(base).net, -8000);
  assert.equal(summarize(base, "2026-10-02", "2026-10-02").expenses, -2000);
  assert.equal(
    summarize(base.map((t) => ({ ...t, currency: "EUR" }))).expenses,
    0,
  );
});
