// Suggests which bank deposits might have paid an invoice. These are suggestions only: a person
// confirms each match, and the database re-checks every rule when the match is recorded.
export type Deposit = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  currency: string;
  kind: string;
  invoiceId?: string | null;
};
export type MatchableInvoice = {
  status: string;
  currency: string;
  issued_on: string | null;
  total_cents: number;
  amount_paid_cents: number;
};
export type Suggestion = { deposit: Deposit; exact: boolean };

/**
 * Unmatched incoming deposits in the invoice's currency, no larger than what is still owed and
 * not dated before the invoice was sent. Deposits equal to the full balance come first, then the
 * most recent. At most `limit` are returned.
 */
export function suggestDeposits(inv: MatchableInvoice, deposits: Deposit[], limit = 5): Suggestion[] {
  if (inv.status !== "sent" && inv.status !== "partially_paid") return [];
  const balance = inv.total_cents - inv.amount_paid_cents;
  if (balance <= 0) return [];
  return deposits
    .filter(
      (d) =>
        !d.invoiceId &&
        d.kind === "income" &&
        d.amountCents > 0 &&
        d.currency === inv.currency &&
        d.amountCents <= balance &&
        (!inv.issued_on || d.date >= inv.issued_on),
    )
    .map((deposit) => ({ deposit, exact: deposit.amountCents === balance }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.deposit.date.localeCompare(a.deposit.date))
    .slice(0, limit);
}
