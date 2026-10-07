"use client";
import { useState } from "react";
import { useLedger } from "@/lib/store";
import { summarize } from "@/lib/dashboard";
export default function Dashboard() {
  const { transactions, ready, error } = useLedger();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const totals = summarize(transactions, from, to);
  const dollars = (v: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(v / 100);
  return (
    <>
      <h1>FinanceOS</h1>
      <p>Your studio finances, ready for review.</p>
      <div className="grid">
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {from && to && from > to && (
        <p className="error">Start date must be before the end date.</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {[
          ["Reviewed income", dollars(totals.income)],
          ["Reviewed expenses", dollars(totals.expenses)],
          ["Net activity", dollars(totals.net)],
          ["Needs review", String(totals.pending)],
        ].map(([name, value]) => (
          <section key={name}>
            <small>{name}</small>
            <div className="metric">{ready && !error ? value : "…"}</div>
          </section>
        ))}
      </div>
      <section>
        <h2>Ledger summary</h2>
        <p>
          {totals.count} transactions in this date range. Reviewed USD activity
          only; transfers and reversed imports are excluded. Refunds reduce
          expenses. These are transaction summaries, not reconciled P&amp;L or
          cash flow.
        </p>
        <p>{totals.foreign} non-USD transactions excluded from totals.</p>
      </section>
    </>
  );
}
