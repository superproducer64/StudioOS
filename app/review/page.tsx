"use client";
import { useState } from "react";
import type { Transaction } from "@/lib/imports";
import {
  reviewTransaction,
  tagTransaction,
  useLedger,
  useProjects,
  type Project,
} from "@/lib/store";
import { classifications } from "@/lib/reports";
function ReviewRow({
  t,
  projects,
  onSave,
}: {
  t: Transaction;
  projects: Project[];
  onSave: () => Promise<void>;
}) {
  const [category, setCategory] = useState(t.category);
  const [kind, setKind] = useState(t.kind);
  const [classification, setClassification] = useState(
    t.classification ?? "unclassified",
  );
  const [tax, setTax] = useState(!!t.taxDeductible);
  const [projectId, setProjectId] = useState(t.projectId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A deductible flag only applies to business or mixed expenses; it is your flag for an
  // accountant to confirm, not a tax determination.
  const taxAllowed =
    kind === "expense" &&
    (classification === "business" || classification === "mixed");
  const needsClass = kind !== "transfer" && classification === "unclassified";
  async function save(approved: boolean) {
    setBusy(true);
    setError("");
    try {
      await reviewTransaction(
        t.id,
        category.trim(),
        kind,
        approved,
        classification,
        taxAllowed && tax,
      );
      if ((t.projectId ?? "") !== projectId)
        await tagTransaction(t.id, projectId || null);
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
        <select
          aria-label="Business or personal"
          disabled={busy}
          value={classification}
          onChange={(e) => setClassification(e.target.value)}
        >
          {classifications.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            disabled={busy || !taxAllowed}
            checked={taxAllowed && tax}
            onChange={(e) => setTax(e.target.checked)}
          />
          Flag for tax review
        </label>
      </td>
      <td>
        <select
          aria-label="Project"
          disabled={busy}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button
          disabled={
            busy || !category.trim() || category === "Uncategorized" || needsClass
          }
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
        {needsClass && (
          <small> · Choose business, personal or mixed to approve</small>
        )}
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
}
export default function Review() {
  const { transactions, ready, error, refresh } = useLedger();
  const { rows: projects, error: projectError } = useProjects();
  const [show, setShow] = useState<"pending" | "all">("pending");
  const visible = transactions.filter((t) => show === "all" || !t.reviewed);
  return (
    <>
      <h1>Review queue</h1>
      <p>
        Choose a category, identify transfers, and mark each item business,
        personal or mixed. A positive expense is a refund; a negative income
        reverses revenue. Tax flags are your own notes for an accountant, not
        tax advice. Each save is recorded in the audit trail.
      </p>
      <label>
        Show
        <select
          value={show}
          onChange={(e) => setShow(e.target.value as "pending" | "all")}
        >
          <option value="pending">Needs review</option>
          <option value="all">All transactions</option>
        </select>
      </label>
      {(error || projectError) && (
        <p className="error">{error || projectError}</p>
      )}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Kind</th>
              <th>Business / personal</th>
              <th>Project</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <ReviewRow
                key={[
                  t.id,
                  t.category,
                  t.kind,
                  t.reviewed,
                  t.classification,
                  t.taxDeductible,
                  t.projectId,
                ].join(":")}
                t={t}
                projects={projects}
                onSave={refresh}
              />
            ))}
          </tbody>
        </table>
      </div>
      {ready && !error && !transactions.length && (
        <section>Import a CSV to begin.</section>
      )}
      {ready && !error && transactions.length > 0 && !visible.length && (
        <section>Everything is reviewed.</section>
      )}
    </>
  );
}
