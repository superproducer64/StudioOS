export type Rule = { vendor: string; pattern: string; category: string; kind: 'expense' | 'transfer'; priority: number };
export const defaultRules: Rule[] = [
  {vendor:'Square Banking',pattern:'square banking',category:'Transfers',kind:'transfer',priority:100},
  ...['OpenAI','Anthropic','Gemini'].map(vendor => ({vendor,pattern:vendor.toLowerCase(),category:'AI tools',kind:'expense' as const,priority:50})),
  ...['Replit','Supabase','GitHub','Vercel'].map(vendor => ({vendor,pattern:vendor.toLowerCase(),category:'Software & hosting',kind:'expense' as const,priority:50})),
  {vendor:'Apple',pattern:'apple',category:'Software & devices',kind:'expense',priority:40},
  {vendor:'FedEx Office',pattern:'fedex office',category:'Printing & office',kind:'expense',priority:60}
];
// Rules are suggestions. All imports require review; merchant names alone cannot establish tax treatment.
export function categorize(description: string, amountCents: number, rules = defaultRules) {
  const text = description.toLowerCase();
  const rule = [...rules].sort((a,b) => b.priority-a.priority).find(r => text.includes(r.pattern.toLowerCase()));
  if (!rule) return { category: 'Uncategorized', kind: amountCents < 0 ? 'expense' : 'income', matchedRule: null };
  return { category: rule.category, kind: rule.kind === 'transfer' ? 'transfer' : amountCents < 0 ? 'expense' : 'income', matchedRule: rule.vendor };
}
