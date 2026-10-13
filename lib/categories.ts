export type CategoryKind = "income" | "expense" | "transfer";
export type NewCategory = { name: string; kind: CategoryKind };
const kinds = ["income", "expense", "transfer"];
// Words or signs people use for a type in a spreadsheet column.
const aliases: Record<string, CategoryKind> = {
  income: "income", in: "income", "+": "income", credit: "income",
  expense: "expense", out: "expense", "-": "expense", "−": "expense", "–": "expense", debit: "expense",
  transfer: "transfer", xfer: "transfer",
};
const clean = (s: string) => s.trim().replace(/\s+/g, " ");

/**
 * Parses a pasted list, one category per line. A line is "Name" or "Name, income|expense|transfer" (or + for income, - for expense)
 * (a comma or tab between them, so a two-column paste from a spreadsheet works). Lines without a
 * type get `defaultKind`. Skips blanks, repeats (ignoring capitals) and names already in `existing`.
 */
export function parseCategoryList(
  text: string,
  defaultKind: CategoryKind,
  existing: string[] = [],
): NewCategory[] {
  const seen = new Set(existing.map((n) => clean(n).toLowerCase()));
  const out: NewCategory[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[,\t]/).map(clean);
    let kind = defaultKind;
    const last = parts[parts.length - 1]?.toLowerCase();
    if (parts.length > 1 && last in aliases) {
      kind = aliases[last];
      parts.pop();
    }
    const name = clean(parts.join(", "));
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, kind });
  }
  return out;
}

/** Categories already used on imported transactions (not Uncategorized), with their most common kind. */
export function fromTransactions(
  txns: { category: string; kind: string }[],
  existing: string[] = [],
): NewCategory[] {
  const seen = new Set(existing.map((n) => clean(n).toLowerCase()));
  const tally = new Map<string, { name: string; counts: Record<string, number> }>();
  for (const t of txns) {
    const name = clean(t.category || "");
    const key = name.toLowerCase();
    if (!name || key === "uncategorized" || seen.has(key) || !kinds.includes(t.kind)) continue;
    const entry = tally.get(key) ?? { name, counts: {} };
    entry.counts[t.kind] = (entry.counts[t.kind] ?? 0) + 1;
    tally.set(key, entry);
  }
  return [...tally.values()]
    .map(({ name, counts }) => ({
      name,
      kind: Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as CategoryKind,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
