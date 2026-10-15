import Papa from "papaparse";
import type { Transaction } from "./imports";

export const classifications = [
  "business",
  "personal",
  "mixed",
  "unclassified",
] as const;
export type Classification = (typeof classifications)[number];

// Row shape of the monthly_report view (reviewed USD activity, transfers excluded).
export type MonthlyRow = {
  month: string;
  classification: string;
  income_cents: number;
  expense_cents: number;
  tax_flagged_cents: number;
  transaction_count: number;
};
export type MonthSummary = {
  month: string;
  income: number;
  expenses: number;
  net: number;
  taxFlagged: number;
  count: number;
  byClassification: Record<Classification, { income: number; expenses: number }>;
};
const emptySplit = () =>
  Object.fromEntries(
    classifications.map((c) => [c, { income: 0, expenses: 0 }]),
  ) as MonthSummary["byClassification"];

/** Folds monthly_report rows into one summary per month, newest first. */
export function groupMonthly(rows: MonthlyRow[]): MonthSummary[] {
  const months = new Map<string, MonthSummary>();
  for (const r of rows) {
    const cls = (classifications as readonly string[]).includes(r.classification)
      ? (r.classification as Classification)
      : "unclassified";
    const m = months.get(r.month) ?? {
      month: r.month,
      income: 0,
      expenses: 0,
      net: 0,
      taxFlagged: 0,
      count: 0,
      byClassification: emptySplit(),
    };
    m.income += r.income_cents;
    m.expenses += r.expense_cents;
    m.net = m.income - m.expenses;
    m.taxFlagged += r.tax_flagged_cents;
    m.count += r.transaction_count;
    m.byClassification[cls].income += r.income_cents;
    m.byClassification[cls].expenses += r.expense_cents;
    months.set(r.month, m);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export function totalMonths(months: MonthSummary[]): Omit<MonthSummary, "month"> {
  const total = {
    income: 0,
    expenses: 0,
    net: 0,
    taxFlagged: 0,
    count: 0,
    byClassification: emptySplit(),
  };
  for (const m of months) {
    total.income += m.income;
    total.expenses += m.expenses;
    total.taxFlagged += m.taxFlagged;
    total.count += m.count;
    for (const c of classifications) {
      total.byClassification[c].income += m.byClassification[c].income;
      total.byClassification[c].expenses += m.byClassification[c].expenses;
    }
  }
  total.net = total.income - total.expenses;
  return total;
}

export function usd(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}

/** Monthly cost of a subscription in cents, or null when the cadence cannot be normalized. */
export function subscriptionMonthlyCents(s: {
  amount_cents: number;
  cadence: string;
}): number | null {
  if (s.cadence === "monthly") return s.amount_cents;
  if (s.cadence === "annual") return Math.round(s.amount_cents / 12);
  return null;
}
export function recurringSummary(
  subs: { amount_cents: number; cadence: string; active: boolean; currency: string }[],
) {
  let monthlyCents = 0;
  let unnormalized = 0;
  let otherCurrency = 0;
  for (const s of subs.filter((x) => x.active)) {
    if (s.currency !== "USD") {
      otherCurrency += 1;
      continue;
    }
    const m = subscriptionMonthlyCents(s);
    if (m === null) unnormalized += 1;
    else monthlyCents += m;
  }
  return { monthlyCents, unnormalized, otherCurrency };
}

type InvoiceLike = {
  status: string;
  total_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
};
export const invoiceBalanceCents = (i: InvoiceLike) =>
  Math.max(i.total_cents - i.amount_paid_cents, 0);
/** "Overdue" is derived from the due date; it is never stored. `today` is YYYY-MM-DD. */
export function invoiceDisplayStatus(i: InvoiceLike, today: string) {
  const open = i.status === "sent" || i.status === "partially_paid";
  if (open && i.due_date && i.due_date < today && invoiceBalanceCents(i) > 0)
    return "overdue";
  return i.status;
}

// Spreadsheet programs run text that begins with these characters as formulas.
const safeText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? "'" + v : v);
/**
 * CSV of reviewed USD expenses the owner flagged as potentially deductible, for an
 * accountant. These are the owner's flags, not tax determinations. Expenses are positive;
 * a refund appears as a negative amount.
 */
export function taxFlaggedCsv(
  rows: Transaction[],
  projectNames: Record<string, string> = {},
  from = "",
  to = "",
) {
  const picked = rows
    .filter(
      (t) =>
        t.reviewed &&
        t.taxDeductible &&
        t.kind === "expense" &&
        t.currency === "USD" &&
        (!from || t.date >= from) &&
        (!to || t.date <= to),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return Papa.unparse(
    {
      fields: [
        "Date",
        "Description",
        "Account",
        "Category",
        "Classification",
        "Amount (USD)",
        "Project",
      ],
      data: picked.map((t) => [
        t.date,
        safeText(t.description),
        safeText(t.account),
        safeText(t.category),
        t.classification ?? "unclassified",
        (-t.amountCents / 100).toFixed(2),
        safeText(projectNames[t.projectId ?? ""] ?? ""),
      ]),
    },
    { newline: "\r\n" },
  );
}

/** Parses a typed dollar amount ("1,250.5") into integer cents, or null when it is not a valid amount. */
export function parseCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [d, c = ""] = s.split(".");
  const cents = Number(d) * 100 + Number(c.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Like parseCents, but allows a leading minus (a card balance that is owed). */
export function parseSignedCents(input: string): number | null {
  const t = input.trim();
  if (t.startsWith("-")) {
    const v = parseCents(t.slice(1).trim());
    return v === null || v === 0 ? v : -v;
  }
  return parseCents(t);
}
