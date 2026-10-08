import type { Transaction } from "./imports";
export function summarize(rows: Transaction[], from = "", to = "") {
  const selected = rows.filter(
    (t) => (!from || t.date >= from) && (!to || t.date <= to),
  );
  const booked = selected.filter(
    (t) => t.reviewed && t.currency === "USD" && t.kind !== "transfer",
  );
  const income = booked
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amountCents, 0);
  const expenses =
    -booked
      .filter((t) => t.kind === "expense")
      .reduce((s, t) => s + t.amountCents, 0) || 0;
  return {
    income,
    expenses,
    net: income - expenses,
    pending: selected.filter((t) => !t.reviewed).length,
    foreign: selected.filter((t) => t.currency !== "USD").length,
    count: selected.length,
  };
}
