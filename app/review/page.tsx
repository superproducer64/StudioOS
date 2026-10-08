"use client";
import { useState } from "react";
import type { Transaction } from "@/lib/imports";
import { reviewTransaction, useLedger } from "@/lib/store";
function ReviewRow({
  t,
  onSave,
}: {
  t: Transaction;
  onSave: () => Promise<void>;
}) {
  const [category, setCategory] = useState(t.category);
  const [kind, setKind] = useState(t.kind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(approved: boolean) {
    setBusy(true);
    setError("");
    try {
      await reviewTransaction(t.id, category.trim(), kind, approved);
      await onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr>
      <td>
        {t.date}
        <br />
        {t.description}
        <br />
        <small>
          {t.account} · {t.matchedRule || "No matching rule"}
        </small>
      </td>
      <td>
        {(t.amountCents / 100).toFixed(2)} {t.currency}
      </td>
      <td>
        <input
          aria-label="Category"
          disabled={busy}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </td>
      <td>
        <select
          aria-label="Kind"
          disabled={busy}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {["income", "expense", "transfer"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </td>
      <td>
        <button
          disabled={busy || !category.trim() || category === "Uncategorized"}
          onClick={() => void save(true)}
        >
          Save & approve
        </button>
        <button
          disabled={busy || !category.trim()}
          onClick={() => void save(false)}
        >
          Save as pending
        </button>
        <small>{t.reviewed ? "Approved" : "Pending"}</small>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
}
export default function Review() {
  const { transactions, ready, error, refresh } = useLedger();
  return (
    <>
      <h1>Review queue</h1>
      <p>
        Choose categories and identify transfers. A positive expense is a
        refund; a negative income reverses revenue. Each save is recorded in the
        audit trail.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Kind</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <ReviewRow
                key={t.id + ":" + t.category + ":" + t.kind + ":" + t.reviewed}
                t={t}
                onSave={refresh}
              />
            ))}
          </tbody>
        </table>
      </div>
      {ready && !error && !transactions.length && (
        <section>Import a CSV to begin.</section>
      )}
    </>
  );
}
