// Search for the Review queue: plain text, or a dollar amount / range.
type Searchable = {
  description: string;
  account: string;
  category: string;
  amountCents: number;
};
const NUM = String.raw`[+-]?\$?\s*[+-]?\d[\d,]*(?:\.\d{1,2})?`;
const RANGE = new RegExp("^(" + NUM + ")\\s*(?:\\.\\.|to)\\s*(" + NUM + ")$", "i");
const SINGLE = new RegExp("^" + NUM + "$");
// Returns cents and whether the user typed decimals (so "45" means any 45.xx but "45.20" is exact).
function amount(s: string) {
  const clean = s.replace(/[$,\s+-]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  return { cents: Number(whole) * 100 + Number(frac.padEnd(2, "0")), exact: clean.includes(".") };
}
export function matchesSearch(t: Searchable, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = (t.description + " " + t.account + " " + t.category).toLowerCase().includes(q);
  if (text) return true;
  const abs = Math.abs(t.amountCents);
  const range = RANGE.exec(q);
  if (range) {
    const a = amount(range[1]);
    const b = amount(range[2]);
    if (!a || !b) return false;
    const lo = Math.min(a.cents, b.cents);
    const hi = Math.max(a.cents, b.cents) + (b.exact ? 0 : 99);
    return abs >= lo && abs <= hi;
  }
  if (SINGLE.test(q)) {
    const a = amount(q);
    if (!a) return false;
    return a.exact ? abs === a.cents : Math.floor(abs / 100) * 100 === a.cents;
  }
  return false;
}
