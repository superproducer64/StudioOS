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
test("a blank description falls back to the chosen column instead of failing the import", () => {
  // Synthetic Venmo-style export: a leading blank header cell, quoted amounts with commas,
  // and a bank transfer whose Note is empty.
  const csv = [
    ",ID,Datetime,Type,Status,Note,From,To,Amount (total),Funding Source,",
    ',1001,2026-04-02T10:15:00,Payment,Complete,Synthetic lunch,Test Person,Other Person,- $25.00,Venmo balance,',
    ',1002,2026-04-03T09:00:00,Standard Transfer,Issued,,,,"- $2,000.00",Venmo balance,',
    ',1003,2026-04-04T18:30:00,Payment,Complete,Synthetic invoice,Client,Test Person,"+ $1,250.50",,',
  ].join("\n");
  const p = parseCsv(csv);
  assert.ok(p.headers.includes("Amount (total)") && p.headers.includes("Note"));
  const base = { date: "Datetime", description: "Note", amount: "Amount (total)", id: "ID" };
  assert.throws(() => normalize(p.rows, base, "Venmo", "V"), /Row 3: Missing description/);
  const t = normalize(p.rows, { ...base, descriptionFallback: "Type" }, "Venmo", "V");
  assert.deepEqual(t.map((x) => x.description), ["Synthetic lunch", "Standard Transfer", "Synthetic invoice"]);
  assert.deepEqual(t.map((x) => x.amountCents), [-2500, -200000, 125050]);
  assert.equal(t[0].date, "2026-04-02");
  // A row blank in both columns still fails, and says so.
  assert.throws(
    () => normalize([{ ...p.rows[1], Type: "" }], { ...base, descriptionFallback: "Type" }, "Venmo", "V"),
    /fallback column is blank too/,
  );
});
test("parseCsv skips note lines above the header and footer lines", () => {
  const p = parseCsv(
    'Account Statement - @someone\n"Account Activity"\n,ID,Datetime,Note,Amount (total)\n,1,2026-09-02T10:00:00,Coffee,- $5.00\n,2,2026-09-03T10:00:00,,+ $20.00\n"Disclaimer text"\n',
  );
  assert.deepEqual(p.headers, ["ID", "Datetime", "Note", "Amount (total)"]);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].Note, "Coffee");
});
test("normalize skips statement summary rows but still errors on real bad rows", () => {
  const m = { date: "d", description: "n", amount: "a" };
  const ok = normalize(
    [
      { d: "2026-09-02", n: "Coffee", a: "-5.00" },
      { d: "", n: "", a: "$31.61" },
    ],
    m,
    "Venmo",
    "V",
  );
  assert.equal(ok.length, 1);
  assert.throws(
    () => normalize([{ d: "garbage", n: "Real", a: "1" }], m, "Venmo", "V"),
    /Row 2/,
  );
});
