import Papa from "papaparse";
import { categorize } from "./rules";
export const sources = ["Venmo", "Square", "Bank", "Card", "PayPal"] as const;
export type Source = (typeof sources)[number];
export type Transaction = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  currency: string;
  category: string;
  kind: string;
  matchedRule: string | null;
  reviewed: boolean;
  source: Source;
  account: string;
  raw: Record<string, string>;
  // Set during review; new imports start unclassified and unflagged.
  classification?: string;
  taxDeductible?: boolean;
  projectId?: string | null;
  // The invoice this deposit was matched to, if any.
  invoiceId?: string | null;
  // True when the import it came from was reversed.
  voided?: boolean;
};
export type Mapping = {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  currency?: string;
  id?: string;
  // Used when the Description column is blank on a row (Venmo leaves Note empty on transfers).
  descriptionFallback?: string;
  positiveIsExpense?: boolean;
};
export function money(value: string): number {
  const clean = value
    .trim()
    .replace(/[$,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(clean))
    throw new Error("Invalid amount: " + value);
  const sign = clean.startsWith("-") ? -1 : 1;
  const [whole, fraction = ""] = clean.replace(/^[+-]/, "").split(".");
  const cents = sign * (Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
  if (!Number.isSafeInteger(cents))
    throw new Error("Amount outside supported range");
  return cents;
}
export function parseCsv(text: string) {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    header: false,
    skipEmptyLines: "greedy",
  });
  if (result.errors.length)
    throw new Error(result.errors.map((e) => e.message).join("; "));
  const filled = (r: string[]) => r.filter((c) => c.trim() !== "").length;
  const grid = result.data;
  const widest = Math.max(0, ...grid.map(filled));
  // Bank/app exports often start with note lines (e.g. Venmo). The header row
  // is the first row that is nearly as wide as the widest row in the file.
  const headerAt = grid.findIndex(
    (r) => filled(r) >= 2 && filled(r) >= widest * 0.6,
  );
  if (headerAt < 0) throw new Error("CSV must include a header row");
  const headers = grid[headerAt].map((h) => h.trim());
  if (!headers.some(Boolean)) throw new Error("CSV must include a header row");
  const rows = grid
    .slice(headerAt + 1)
    .filter((r) => filled(r) >= 2) // drops footer/disclaimer lines
    .map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (h) o[h] = r[i] ?? "";
      });
      return o;
    });
  return { headers: headers.filter(Boolean), rows };
}
function dateISO(input: string) {
  const v = input.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(v);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: .*)?$/.exec(v);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [y, m, d] = [Number(us[3]), Number(us[1]), Number(us[2])];
  else throw new Error("Use YYYY-MM-DD or US MM/DD/YYYY dates");
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    throw new Error("Invalid date");
  return date.toISOString().slice(0, 10);
}
export function normalize(
  rows: Record<string, string>[],
  mapping: Mapping,
  source: Source,
  account: string,
) {
  if (!account.trim()) throw new Error("Account name is required");
  const out: Transaction[] = [];
  rows.forEach((raw, index) => {
    try {
      const description =
        (raw[mapping.description] || "").trim() ||
        (raw[mapping.descriptionFallback || ""] || "").trim();
      // Statement summary rows (totals, balances, legal footers) have no
      // description and no usable date. Skip those; real rows still error.
      if (!description && !looksLikeDate(raw[mapping.date] || "")) return;
      const date = dateISO(raw[mapping.date] || "");
      if (!description)
        throw new Error(
          mapping.descriptionFallback
            ? "Missing description (the fallback column is blank too)"
            : "Missing description. Pick a fallback column, or fill in the blank cell",
        );
      const amountCents = mapping.amount
        ? money(raw[mapping.amount] || "") *
          (mapping.positiveIsExpense ? -1 : 1)
        : Math.abs(money(raw[mapping.credit || ""] || "0")) -
          Math.abs(money(raw[mapping.debit || ""] || "0"));
      const currency = (raw[mapping.currency || ""] || "USD")
        .trim()
        .toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency))
        throw new Error("Invalid currency code");
      const external = raw[mapping.id || ""];
      // Conservative identity: same-day identical purchases without a provider ID may collide. Review before saving.
      const id = JSON.stringify([
        source,
        account.trim(),
        external || [date, description, amountCents, currency],
      ]);
      out.push({
        id,
        date,
        description,
        amountCents,
        currency,
        ...categorize(description, amountCents),
        reviewed: false,
        source,
        account: account.trim(),
        raw,
      });
    } catch (error) {
      throw new Error("Row " + (index + 2) + ": " + (error as Error).message);
    }
  });
  return out;
}
function looksLikeDate(input: string) {
  return /^\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/.test(input);
}
