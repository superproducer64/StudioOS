import test from "node:test";
import assert from "node:assert/strict";
import {
  groupMonthly,
  totalMonths,
  subscriptionMonthlyCents,
  recurringSummary,
  invoiceDisplayStatus,
  invoiceBalanceCents,
  taxFlaggedCsv,
} from "../lib/reports";
import type { Transaction } from "../lib/imports";

const row = (
  month: string,
  classification: string,
  income: number,
  expense: number,
  tax = 0,
  count = 1,
) => ({
  month,
  classification,
  income_cents: income,
  expense_cents: expense,
  tax_flagged_cents: tax,
  transaction_count: count,
});

test("monthly report rows fold into newest-first months with a business/personal split", () => {
  const months = groupMonthly([
    row("2026-09-01", "business", 50000, 10000, 10000),
    row("2026-10-01", "business", 100000, 20000, 20000, 2),
    row("2026-10-01", "personal", 0, 5000),
    row("2026-10-01", "something-new", 0, 100),
  ]);
  assert.deepEqual(
    months.map((m) => m.month),
    ["2026-10-01", "2026-09-01"],
  );
  const oct = months[0];
  assert.equal(oct.income, 100000);
  assert.equal(oct.expenses, 25100);
  assert.equal(oct.net, 74900);
  assert.equal(oct.count, 4);
  assert.equal(oct.byClassification.personal.expenses, 5000);
  // An unrecognized classification is counted as unclassified rather than dropped.
  assert.equal(oct.byClassification.unclassified.expenses, 100);
  const all = totalMonths(months);
  assert.equal(all.income, 150000);
  assert.equal(all.expenses, 35100);
  assert.equal(all.net, 114900);
  assert.equal(all.taxFlagged, 30000);
});

test("subscriptions normalize to monthly cost and say what they could not", () => {
  assert.equal(subscriptionMonthlyCents({ amount_cents: 2500, cadence: "monthly" }), 2500);
  assert.equal(subscriptionMonthlyCents({ amount_cents: 12000, cadence: "annual" }), 1000);
  assert.equal(subscriptionMonthlyCents({ amount_cents: 12001, cadence: "annual" }), 1000);
  assert.equal(subscriptionMonthlyCents({ amount_cents: 5000, cadence: "other" }), null);
  const s = recurringSummary([
    { amount_cents: 2500, cadence: "monthly", active: true, currency: "USD" },
    { amount_cents: 12000, cadence: "annual", active: true, currency: "USD" },
    { amount_cents: 999, cadence: "monthly", active: false, currency: "USD" },
    { amount_cents: 5000, cadence: "other", active: true, currency: "USD" },
    { amount_cents: 700, cadence: "monthly", active: true, currency: "EUR" },
  ]);
  assert.deepEqual(s, { monthlyCents: 3500, unnormalized: 1, otherCurrency: 1 });
});

test("overdue is derived from the due date and the open balance", () => {
  const base = { total_cents: 10000, amount_paid_cents: 0, due_date: "2026-10-01" };
  assert.equal(invoiceDisplayStatus({ ...base, status: "sent" }, "2026-10-08"), "overdue");
  assert.equal(invoiceDisplayStatus({ ...base, status: "partially_paid", amount_paid_cents: 4000 }, "2026-10-08"), "overdue");
  assert.equal(invoiceDisplayStatus({ ...base, status: "sent" }, "2026-10-01"), "sent");
  assert.equal(invoiceDisplayStatus({ ...base, status: "paid", amount_paid_cents: 10000 }, "2026-10-08"), "paid");
  assert.equal(invoiceDisplayStatus({ ...base, status: "draft" }, "2026-10-08"), "draft");
  assert.equal(invoiceDisplayStatus({ ...base, status: "void" }, "2026-10-08"), "void");
  assert.equal(invoiceDisplayStatus({ ...base, status: "sent", due_date: null }, "2026-10-08"), "sent");
  assert.equal(invoiceBalanceCents({ ...base, status: "sent", amount_paid_cents: 12000 }), 0);
});

const tx = (over: Partial<Transaction>): Transaction => ({
  id: "x",
  date: "2026-10-04",
  description: "Synthetic software",
  amountCents: -20000,
  currency: "USD",
  category: "Software",
  kind: "expense",
  matchedRule: null,
  reviewed: true,
  source: "Bank",
  account: "Business checking",
  raw: {},
  classification: "business",
  taxDeductible: true,
  projectId: "p1",
  ...over,
});

test("tax-flagged CSV lists only reviewed, flagged USD expenses and neutralizes spreadsheet formulas", () => {
  const csv = taxFlaggedCsv(
    [
      tx({ id: "a" }),
      tx({ id: "b", reviewed: false }),
      tx({ id: "c", taxDeductible: false }),
      tx({ id: "d", currency: "EUR" }),
      tx({ id: "e", kind: "income", amountCents: 500 }),
      tx({ id: "f", date: "2026-09-01", description: "=HYPERLINK(\"http://example.test\")" }),
      tx({ id: "g", date: "2026-12-31" }),
    ],
    { p1: "Project One" },
    "2026-09-01",
    "2026-10-31",
  );
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Date,Description,Account,Category,Classification,Amount (USD),Project");
  assert.equal(lines.length, 3); // header plus rows f and a, sorted by date
  assert.ok(lines[1].startsWith("2026-09-01,"));
  assert.ok(lines[1].includes("\"'=HYPERLINK("), "formula text must be neutralized");
  assert.equal(lines[2], "2026-10-04,Synthetic software,Business checking,Software,business,200.00,Project One");
});

import { parseCents } from "../lib/reports";
test("typed dollar amounts become exact integer cents", () => {
  assert.equal(parseCents("1,250.5"), 125050);
  assert.equal(parseCents("$19"), 1900);
  assert.equal(parseCents("0.07"), 7);
  assert.equal(parseCents("-5"), null);
  assert.equal(parseCents("1.234"), null);
  assert.equal(parseCents(""), null);
  assert.equal(parseCents("abc"), null);
});
