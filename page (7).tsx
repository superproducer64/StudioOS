"use client";
import { useState } from "react";
import { useRules, type SavedRule } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
function RuleRow({
  rule,
  onSave,
}: {
  rule: SavedRule;
  onSave: () => Promise<void>;
}) {
  const [pattern, setPattern] = useState(rule.pattern);
  const [category, setCategory] = useState(rule.category);
  const [kind, setKind] = useState(rule.kind);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section>
      <h2>{rule.vendor}</h2>
      <label>
        Description contains
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} />
      </label>
      <label>
        Category
        <input value={category} onChange={(e) => setCategory(e.target.value)} />
      </label>
      <label>
        Kind
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SavedRule["kind"])}
        >
          <option value="expense">Expense (refunds stay expenses)</option>
          <option value="transfer">Transfer</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enabled
      </label>
      <button
        disabled={busy || !pattern.trim() || !category.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            const { error } = await getSupabase()
              .from("category_rules")
              .update({
                pattern: pattern.trim().toLowerCase(),
                category: category.trim(),
                kind,
                enabled,
              })
              .eq("id", rule.id);
            if (error) throw error;
            await onSave();
            setError("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save rule
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
export default function Rules() {
  const { rules, error, refresh } = useRules();
  const [notice, setNotice] = useState("");
  const [vendor, setVendor] = useState("");
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h1>Category rules</h1>
      <p>
        Suggestions apply to future previews. Existing approved transactions are
        never recategorized automatically.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { error } = await getSupabase().rpc("seed_finance_rules");
            if (error) throw error;
            await refresh();
            setNotice(
              "Default rules added without overwriting existing patterns.",
            );
          } catch (e) {
            setNotice((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Add missing default rules
      </button>
      <section>
        <h2>New expense rule</h2>
        <label>
          Vendor
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </label>
        <label>
          Description contains
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} />
        </label>
        <label>
          Category
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <button
          disabled={
            busy || !vendor.trim() || !pattern.trim() || !category.trim()
          }
          onClick={async () => {
            setBusy(true);
            try {
              const { error } = await getSupabase()
                .from("category_rules")
                .insert({
                  vendor: vendor.trim(),
                  pattern: pattern.trim().toLowerCase(),
                  category: category.trim(),
                  kind: "expense",
                  priority: 70,
                });
              if (error) throw error;
              setVendor("");
              setPattern("");
              setCategory("");
              await refresh();
              setNotice("Rule added.");
            } catch (e) {
              setNotice((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Add rule
        </button>
      </section>
      {(error || notice) && <p role="status">{error || notice}</p>}
      {rules.map((r) => (
        <RuleRow key={r.id} rule={r} onSave={refresh} />
      ))}
    </>
  );
}
