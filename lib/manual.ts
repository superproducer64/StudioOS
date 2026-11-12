import { dateISO, money, type Transaction } from "./imports";
import { categorize, type Rule } from "./rules";
export type ManualInput = {
  date: string;
  description: string;
  amount: string; // dollars, as typed; sign is ignored, direction decides
  direction: "in" | "out";
  category: string;
  kind: string;
};
/**
 * Turn the Add-transaction form into a ledger row. Money out is stored negative, money in
 * positive. Blank category falls back to the rules' suggestion, then Uncategorized.
 */
export function buildManualTransaction(
  input: ManualInput,
  accountId: string,
  accountName: string,
  currency: string,
  rules?: Rule[],
  uid: string = crypto.randomUUID(),
): Transaction {
  const description = input.description.trim();
  if (!description) throw new Error("Add a description");
  const date = dateISO(input.date);
  const cents = Math.abs(money(input.amount));
  if (cents === 0) throw new Error("Amount must be more than zero");
  const amountCents = input.direction === "out" ? -cents : cents;
  const suggested = categorize(description, amountCents, rules);
  const picked = input.category.trim();
  const category = picked && picked !== "Uncategorized" ? picked : suggested.category;
  const kind = picked && picked !== "Uncategorized" ? input.kind : suggested.kind;
  return {
    id: JSON.stringify(["Manual", accountId, uid]),
    date,
    description,
    amountCents,
    currency,
    category,
    kind,
    matchedRule: picked && picked !== "Uncategorized" ? null : suggested.matchedRule,
    reviewed: false,
    source: "Bank",
    account: accountName,
    raw: { entered: "manually" },
  };
}
