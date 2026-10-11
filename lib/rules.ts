export type Rule = {
  vendor: string;
  pattern: string;
  category: string;
  kind: "income" | "expense" | "transfer";
  priority: number;
};
export const defaultRules: Rule[] = [
  {
    vendor: "Square Banking",
    pattern: "square banking",
    category: "Transfers",
    kind: "transfer",
    priority: 100,
  },
  ...["OpenAI", "Anthropic", "Gemini"].map((vendor) => ({
    vendor,
    pattern: vendor.toLowerCase(),
    category: "AI tools",
    kind: "expense" as const,
    priority: 50,
  })),
  ...["Replit", "Supabase", "GitHub", "Vercel"].map((vendor) => ({
    vendor,
    pattern: vendor.toLowerCase(),
    category: "Software & hosting",
    kind: "expense" as const,
    priority: 50,
  })),
  {
    vendor: "Apple",
    pattern: "apple",
    category: "Software & devices",
    kind: "expense",
    priority: 40,
  },
  {
    vendor: "FedEx Office",
    pattern: "fedex office",
    category: "Printing & office",
    kind: "expense",
    priority: 60,
  },
];
// Rules are suggestions. All imports require review; merchant names alone cannot establish tax treatment.
export function categorize(
  description: string,
  amountCents: number,
  rules = defaultRules,
) {
  const text = description.toLowerCase();
  const rule = [...rules]
    .sort((a, b) => b.priority - a.priority)
    .find(
      (r) =>
        text.includes(r.pattern.toLowerCase()) &&
        // Income rules only apply to money coming in. A payment going out that happens to
        // match stays with the other rules (refunds on expense rules stay expenses).
        (r.kind !== "income" || amountCents > 0),
    );
  if (!rule)
    return {
      category: "Uncategorized",
      kind: amountCents < 0 ? "expense" : "income",
      matchedRule: null,
    };
  return { category: rule.category, kind: rule.kind, matchedRule: rule.vendor };
}
/** A starting "description contains" text for a new rule: the first few plain words, no numbers or card suffixes. */
export function suggestPattern(description: string) {
  return description
    .toLowerCase()
    .replace(/[•*#]+\s*\d+/g, " ")
    .replace(/\b\d[\d/\-.:]*\b/g, " ")
    .replace(/[^a-z&' ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .join(" ");
}
export const titleCase = (s: string) =>
  s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
