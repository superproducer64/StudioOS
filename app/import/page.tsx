"use client";
import { useState } from "react";
import Link from "next/link";
import {
  sources,
  parseCsv,
  normalize,
  type Source,
  type Mapping,
  type Transaction,
} from "@/lib/imports";
import { useAccounts, useRules, useTemplates, commitImport } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { defaultRules } from "@/lib/rules";
export default function ImportPage() {
  const { accounts, ready, error: accountError } = useAccounts();
  const { rules, ready: rulesReady, error: rulesError } = useRules();
  const templates = useTemplates();
  const [templateName, setTemplateName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [source, setSource] = useState<Source>("Bank");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({
    date: "",
    description: "",
    amount: "",
  });
  const [preview, setPreview] = useState<Transaction[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  function clear() {
    setPreview([]);
    setNotice("");
  }
  async function read(file?: File) {
    clear();
    setError("");
    setRows([]);
    setHeaders([]);
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Use CSV files under 5 MB");
      const parsed = parseCsv(await file.text());
      if (parsed.rows.length > 5000)
        throw new Error("Split exports into batches of 5,000 rows or fewer.");
      setRows(parsed.rows);
      setHeaders(parsed.headers);
      setFilename(file.name);
      setMapping({ date: "", description: "", amount: "" });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const accountTemplates = templates.rows.filter((t) => t.account_id === accountId);
  function applyTemplate(id: string) {
    const t = templates.rows.find((x) => x.id === id);
    if (!t) return;
    const saved = t.mapping as Record<string, string | boolean>;
    const missing = Object.entries(saved)
      .filter(([k, v]) => k !== "positiveIsExpense" && typeof v === "string" && v && !headers.includes(v))
      .map(([, v]) => String(v));
    const next: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(saved))
      if (k === "positiveIsExpense" || (typeof v === "string" && headers.includes(v))) next[k] = v;
    setMapping({ date: "", description: "", amount: "", ...next } as Mapping);
    setSource(t.source as Source);
    clear();
    setError(
      missing.length
        ? "Template loaded, but these columns are not in this file: " + missing.join(", ") + ". Pick them again."
        : "",
    );
  }
  async function saveTemplate() {
    setBusy(true);
    setError("");
    try {
      const name = templateName.trim();
      if (!name) throw new Error("Name the template first.");
      const existing = accountTemplates.find((t) => t.name.toLowerCase() === name.toLowerCase());
      const body = { account_id: accountId, name, source, mapping };
      const r = existing
        ? await getSupabase().from("import_templates").update({ source, mapping }).eq("id", existing.id)
        : await getSupabase().from("import_templates").insert(body);
      if (r.error) throw r.error;
      setTemplateName("");
      await templates.refresh();
      setNotice(existing ? "Template updated." : "Template saved for this account.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = (key: keyof Mapping, label: string) => (
    <label>
      {label}
      <select
        disabled={busy}
        value={String(mapping[key] || "")}
        onChange={(e) => {
          setMapping({ ...mapping, [key]: e.target.value });
          clear();
        }}
      >
        <option value="">Select column</option>
        {headers.map((h) => (
          <option key={h}>{h}</option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <h1>Import transactions</h1>
      <p>
        Map your export columns and check the preview. Imports are saved
        atomically to your account and enter review.
      </p>
      <section>
        <label>
          Account
          <select
            disabled={busy}
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              clear();
            }}
          >
            <option value="">Choose account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </label>
        {ready && !accounts.length && (
          <p>
            <Link href="/accounts">Create an account first</Link>
          </p>
        )}
        <label>
          Source
          <select
            disabled={busy}
            value={source}
            onChange={(e) => {
              setSource(e.target.value as Source);
              clear();
            }}
          >
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          CSV file
          <input
            disabled={busy}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void read(e.target.files?.[0])}
          />
        </label>
        {headers.length > 0 && (
          <>
            <div className="grid">
              {field("date", "Date (ISO or US)")}
              {field("description", "Description")}
              {field("descriptionFallback", "If Description is blank, use (optional)")}
              {field("amount", "Signed amount")}
              {field("debit", "Debit (if no amount)")}
              {field("credit", "Credit (if no amount)")}
              {field("currency", "Currency (account default)")}
              {field("id", "Provider ID (recommended)")}
            </div>
            <label>
              <input
                disabled={busy}
                type="checkbox"
                checked={!!mapping.positiveIsExpense}
                onChange={(e) => {
                  setMapping({
                    ...mapping,
                    positiveIsExpense: e.target.checked,
                  });
                  clear();
                }}
              />
              Positive signed amounts are expenses
            </label>
            {accountId && (
              <div>
                {accountTemplates.length > 0 && (
                  <label>
                    Saved mapping for this account
                    <select
                      disabled={busy}
                      value=""
                      onChange={(e) => applyTemplate(e.target.value)}
                    >
                      <option value="">Load a template…</option>
                      {accountTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Save this mapping as
                  <input
                    disabled={busy}
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !templateName.trim() || !mapping.date || !mapping.description}
                  onClick={() => void saveTemplate()}
                >
                  Save template
                </button>
              </div>
            )}
            <button
              disabled={
                busy ||
                !rulesReady ||
                !!rulesError ||
                !accountId ||
                !mapping.date ||
                !mapping.description ||
                (!mapping.amount && (!mapping.debit || !mapping.credit))
              }
              onClick={() => {
                try {
                  const account = accounts.find((a) => a.id === accountId)!;
                  const data = normalize(rows, mapping, source, accountId).map(
                    (t) => ({
                      ...t,
                      account: account.name,
                      currency: mapping.currency
                        ? t.currency
                        : account.currency,
                    }),
                  );
                  const activeRules = rules.length
                    ? rules.filter((r) => r.enabled)
                    : defaultRules;
                  const categorized = data.map((t) => ({
                    ...t,
                    ...requireCategory(
                      t.description,
                      t.amountCents,
                      activeRules,
                    ),
                  }));
                  if (categorized.some((t) => t.currency !== account.currency))
                    throw new Error(
                      "Currency must match the selected account. Create a separate account for another currency.",
                    );
                  setPreview(categorized);
                  setError("");
                } catch (e) {
                  setPreview([]);
                  setError((e as Error).message);
                }
              }}
            >
              Preview normalization
            </button>
          </>
        )}
        {(error || accountError || rulesError) && (
          <p className="error">{error || accountError || rulesError}</p>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
      {preview.length > 0 && (
        <section>
          <h2>Preview · {preview.length} rows</h2>
          <p>
            Money out is negative. Identical records without provider IDs may
            collide; map IDs and inspect repeated purchases. PayPal fees are not
            split automatically.
          </p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Suggestion</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 100).map((t, i) => (
                  <tr key={i}>
                    <td>{t.date}</td>
                    <td>{t.description}</td>
                    <td>
                      {(t.amountCents / 100).toFixed(2)} {t.currency}
                    </td>
                    <td>
                      {t.category} / {t.kind}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await commitImport(
                  accountId,
                  source,
                  filename,
                  preview,
                );
                setNotice(
                  result.inserted +
                    " transactions saved; " +
                    result.skipped +
                    " duplicate identities skipped. Open Review to approve.",
                );
                setPreview([]);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save import to Supabase"}
          </button>
        </section>
      )}
    </>
  );
}
import { categorize as requireCategory } from "@/lib/rules";
