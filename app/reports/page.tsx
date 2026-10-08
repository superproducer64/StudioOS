"use client";
import { useState } from "react";
import {
  useLedger,
  useProjectPnl,
  useRows,
  useSubscriptions,
} from "@/lib/store";
import {
  groupMonthly,
  recurringSummary,
  taxFlaggedCsv,
  totalMonths,
  usd,
  type MonthlyRow,
} from "@/lib/reports";
export default function Reports() {
  const monthly = useRows<MonthlyRow>(
    "monthly_report",
    "*",
    "month",
    "classification",
  );
  const pnl = useProjectPnl();
  const subs = useSubscriptions();
  const ledger = useLedger();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const months = groupMonthly(monthly.rows);
  const all = totalMonths(months);
  const recurring = recurringSummary(subs.rows);
  const flagged = ledger.transactions.filter(
    (t) =>
      t.reviewed &&
      t.taxDeductible &&
      t.kind === "expense" &&
      t.currency === "USD" &&
      (!from || t.date >= from) &&
      (!to || t.date <= to),
  );
  const errors = monthly.error || pnl.error || subs.error || ledger.error;
  function download() {
    const names = Object.fromEntries(pnl.rows.map((p) => [p.project_id, p.name]));
    const url = URL.createObjectURL(
      new Blob([taxFlaggedCsv(ledger.transactions, names, from, to)], {
        type: "text/csv",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "tax-flagged-expenses.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <h1>Reports</h1>
      <p>
        Summaries of reviewed USD transactions, with transfers and reversed
        imports excluded. These are transaction summaries, not reconciled
        profit and loss or cash flow, and tax flags are your own notes for an
        accountant to confirm.
      </p>
      {errors && <p className="error">{errors}</p>}
      <div className="grid">
        {[
          ["Reviewed income", usd(all.income)],
          ["Reviewed expenses", usd(all.expenses)],
          ["Net activity", usd(all.net)],
          ["Flagged for tax review", usd(all.taxFlagged)],
        ].map(([name, value]) => (
          <section key={name}>
            <small>{name}</small>
            <div className="metric">{monthly.ready ? value : "…"}</div>
          </section>
        ))}
      </div>
      <section>
        <h2>Business and personal split</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Classification</th>
                <th>Income</th>
                <th>Expenses</th>
              </tr>
            </thead>
            <tbody>
              {(
                ["business", "mixed", "personal", "unclassified"] as const
              ).map((c) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td>{usd(all.byClassification[c].income)}</td>
                  <td>{usd(all.byClassification[c].expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <small>
          Unclassified rows were approved before business/personal tracking
          existed. Re-review them to classify.
        </small>
      </section>
      <section>
        <h2>By month</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Net</th>
                <th>Business net</th>
                <th>Flagged</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>{m.month.slice(0, 7)}</td>
                  <td>{usd(m.income)}</td>
                  <td>{usd(m.expenses)}</td>
                  <td>{usd(m.net)}</td>
                  <td>
                    {usd(
                      m.byClassification.business.income -
                        m.byClassification.business.expenses,
                    )}
                  </td>
                  <td>{usd(m.taxFlagged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {monthly.ready && !months.length && (
          <p>Approve transactions in Review to see monthly totals.</p>
        )}
      </section>
      <section>
        <h2>Projects</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Net</th>
                <th>Invoiced</th>
                <th>Paid</th>
                <th>Budget</th>
              </tr>
            </thead>
            <tbody>
              {pnl.rows.map((p) => (
                <tr key={p.project_id}>
                  <td>{p.name}</td>
                  <td>{usd(p.income_cents)}</td>
                  <td>{usd(p.expense_cents)}</td>
                  <td>{usd(p.net_cents)}</td>
                  <td>{usd(p.invoiced_cents)}</td>
                  <td>{usd(p.paid_cents)}</td>
                  <td>{p.budget_cents ? usd(p.budget_cents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pnl.ready && !pnl.rows.length && (
          <p>Create a project, then tag transactions to it in Review.</p>
        )}
        <small>
          Income and expenses count only reviewed transactions tagged to the
          project. Invoiced excludes void invoices.
        </small>
      </section>
      <section>
        <h2>Recurring spend</h2>
        <p className="metric">{usd(recurring.monthlyCents)} / month</p>
        <small>
          Active USD subscriptions, with annual plans divided by 12.
          {recurring.unnormalized > 0 &&
            " " +
              recurring.unnormalized +
              " with an irregular cadence are not included."}
          {recurring.otherCurrency > 0 &&
            " " +
              recurring.otherCurrency +
              " in other currencies are not included."}
        </small>
      </section>
      <section>
        <h2>Tax prep export</h2>
        <p>
          Reviewed USD expenses you flagged for tax review.
          {" " + flagged.length} match the dates below, totalling{" "}
          {usd(-flagged.reduce((s, t) => s + t.amountCents, 0))}.
        </p>
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
        <button disabled={!ledger.ready || !flagged.length} onClick={download}>
          Download CSV for your accountant
        </button>
      </section>
    </>
  );
}
