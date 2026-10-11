"use client";
import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/imports";
import { matchesSearch } from "@/lib/search";
import {
  reviewTransaction,
  tagTransaction,
  useCategories,
  useLedger,
  useProjects,
  type Category,
  type Project,
} from "@/lib/store";
import { classifications } from "@/lib/reports";
import { categorize, suggestPattern, titleCase, type Rule } from "@/lib/rules";
import { getSupabase } from "@/lib/supabase";
import { CategoryPicker } from "@/components/CategoryPicker";
function ReviewRow({
  t,
  projects,
  categories,
  pending,
  onSave,
  onNotice,
}: {
  t: Transaction;
  projects: Project[];
  categories: Category[];
  pending: Transaction[];
  onSave: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rulePattern, setRulePattern] = useState("");
  const [ruleVendor, setRuleVendor] = useState("");
  const [applyPending, setApplyPending] = useState(true);
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
  const readyForRule = !!category.trim() && category !== "Uncategorized";
  const draftRule: Rule = {
    vendor: ruleVendor.trim() || titleCase(rulePattern.trim()),
    pattern: rulePattern.trim().toLowerCase(),
    category: category.trim(),
    kind: kind as Rule["kind"],
    priority: 70,
  };
  // Pending rows this rule would label: still Uncategorized (or this row), matched by the same
  // logic imports use. Approved rows are never touched.
  const ruleMatches = useMemo(
    () =>
      ruleOpen && draftRule.pattern
        ? pending.filter(
            (o) =>
              (o.id === t.id || o.category === "Uncategorized") &&
              categorize(o.description, o.amountCents, [draftRule]).matchedRule,
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruleOpen, rulePattern, kind, pending, t.id],
  );
  async function makeRule() {
    setBusy(true);
    setError("");
    try {
      if (!draftRule.pattern)
        throw new Error("Type the text to look for in the description.");
      const r = await getSupabase().from("category_rules").insert(draftRule);
      if (r.error)
        throw new Error(
          r.error.message.includes("duplicate key")
            ? "You already have a rule for that text. Edit it on the Rules page."
            : r.error.message,
        );
      let applied = 0;
      let failed = 0;
      if (applyPending)
        for (const o of ruleMatches) {
          try {
            await reviewTransaction(
              o.id,
              draftRule.category,
              draftRule.kind,
              false,
            );
            applied++;
          } catch {
            failed++;
          }
        }
      setRuleOpen(false);
      onNotice(
        'Rule saved: descriptions containing "' +
          draftRule.pattern +
          '" → ' +
          draftRule.category +
          ". " +
          (applyPending
            ? "Set the category on " +
              applied +
              " pending row" +
              (applied === 1 ? "" : "s") +
              (failed ? " (" + failed + " could not be updated)" : "") +
              " as pending. Nothing was approved."
            : "It applies to future imports."),
      );
      await onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
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
    <>
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
          <CategoryPicker
            allowNew
            disabled={busy}
            value={category}
            categories={categories}
            onChange={(name, k) => {
              setCategory(name);
              // Picking from your list also sets its kind (income / expense / transfer).
              if (k) setKind(k);
            }}
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
              busy ||
              !category.trim() ||
              category === "Uncategorized" ||
              needsClass
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
          <button
            disabled={busy || !readyForRule}
            title={readyForRule ? "" : "Pick a category first"}
            onClick={() => {
              const p = suggestPattern(t.description);
              setRulePattern(p);
              setRuleVendor(titleCase(p));
              setRuleOpen((o) => !o);
            }}
          >
            Make a rule
          </button>
          <small>{t.reviewed ? "Approved" : "Pending"}</small>
          {needsClass && (
            <small> · Choose business, personal or mixed to approve</small>
          )}
          {error && <p className="error">{error}</p>}
        </td>
      </tr>
      {ruleOpen && (
        <tr>
          <td colSpan={7}>
            <div className="card">
              <strong>New rule</strong>: when a description contains this text,
              suggest <strong>{category}</strong> ({kind}).
              <label>
                Description contains
                <input
                  value={rulePattern}
                  onChange={(e) => setRulePattern(e.target.value)}
                />
              </label>
              <label>
                Name
                <input
                  value={ruleVendor}
                  onChange={(e) => setRuleVendor(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={applyPending}
                  onChange={(e) => setApplyPending(e.target.checked)}
                />
                Also set this category on the {ruleMatches.length} pending row
                {ruleMatches.length === 1 ? "" : "s"} that match (saved as
                pending, nothing approved)
              </label>
              <small>
                Matching is "contains", ignoring capitals. Use short, specific
                text so it does not catch other vendors. Approved rows are never
                changed.
              </small>
              <div>
                <button
                  disabled={busy || !rulePattern.trim()}
                  onClick={() => void makeRule()}
                >
                  Save rule
                </button>
                <button disabled={busy} onClick={() => setRuleOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
export default function Review() {
  const { transactions, ready, error, refresh } = useLedger();
  const { rows: projects, error: projectError } = useProjects();
  const { categories } = useCategories();
  const [show, setShow] = useState<"pending" | "all">("pending");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const pending = useMemo(
    () => transactions.filter((t) => !t.reviewed),
    [transactions],
  );
  // Each row carries several drop-downs, so only one page is drawn at a time; thousands of rows
  // at once make the browser crawl.
  const PAGE = 25;
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (show === "all" || !t.reviewed) &&
          matchesSearch(t, q),
      ),
    [transactions, show, q],
  );
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = visible.slice(current * PAGE, current * PAGE + PAGE);
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
          onChange={(e) => {
            setShow(e.target.value as "pending" | "all");
            setPage(0);
          }}
        >
          <option value="pending">Needs review</option>
          <option value="all">All transactions</option>
        </select>
      </label>
      <label>
        Search description, account, category or amount (45.20, 45, or 40..50)
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <p>
        {visible.length
          ? "Showing " +
            (current * PAGE + 1) +
            "–" +
            (current * PAGE + shown.length) +
            " of " +
            visible.length
          : "Nothing to show."}{" "}
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>
          Previous
        </button>
        <button
          disabled={current >= pages - 1}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
      </p>
      {(error || projectError) && (
        <p className="error">{error || projectError}</p>
      )}
      {notice && <p role="status">{notice}</p>}
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
            {shown.map((t) => (
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
                categories={categories}
                pending={pending}
                onSave={refresh}
                onNotice={setNotice}
              />
            ))}
          </tbody>
        </table>
      </div>
      {ready && !error && !transactions.length && (
        <section>Import a CSV to begin.</section>
      )}
      {ready && !error && transactions.length > 0 && !visible.length && (
        <section>{q ? "No matches for that search." : "Everything is reviewed."}</section>
      )}
    </>
  );
}
