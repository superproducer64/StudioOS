"use client";
import { useState } from "react";
import Link from "next/link";
import { CategoryPicker } from "@/components/CategoryPicker";
import { buildManualTransaction } from "@/lib/manual";
import {
  commitImport,
  useAccounts,
  useCategories,
  useRules,
} from "@/lib/store";
import { defaultRules } from "@/lib/rules";
const today = () => new Date().toLocaleDateString("en-CA");
export default function AddTransaction() {
  const { accounts, ready } = useAccounts();
  const { rules } = useRules();
  const { categories } = useCategories();
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [category, setCategory] = useState("Uncategorized");
  const [kind, setKind] = useState("expense");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) throw new Error("Choose an account");
      const enabled = rules.filter((r) => r.enabled);
      const t = buildManualTransaction(
        { date, description, amount, direction, category, kind },
        account.id,
        account.name,
        account.currency,
        enabled.length ? enabled : defaultRules,
      );
      await commitImport(account.id, "Bank", "Manual entry", [t]);
      setNotice(
        "Saved " + t.description + ". It's in Review waiting for your approval.",
      );
      setDescription("");
      setAmount("");
      setCategory("Uncategorized");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Add a transaction</h1>
      <p>
        For cash and anything that is not on a statement. It goes to Review like
        an import, so nothing counts until you approve it.
      </p>
      <section>
        <label>
          Account
          <select
            disabled={busy}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
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
            <Link href="/accounts">Create an account first</Link> (a Cash account
            works for cash).
          </p>
        )}
        <label>
          Date
          <input
            type="date"
            disabled={busy}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Description
          <input
            disabled={busy}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Amount
          <input
            inputMode="decimal"
            placeholder="45.20"
            disabled={busy}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          Money
          <select
            disabled={busy}
            value={direction}
            onChange={(e) => {
              const d = e.target.value as "in" | "out";
              setDirection(d);
              if (category === "Uncategorized") setKind(d === "in" ? "income" : "expense");
            }}
          >
            <option value="out">Out (expense)</option>
            <option value="in">In (income)</option>
          </select>
        </label>
        <label>
          Category (optional, rules suggest one if blank)
          <CategoryPicker
            allowNew
            disabled={busy}
            value={category}
            categories={categories}
            onChange={(name, k) => {
              setCategory(name);
              if (k) setKind(k);
            }}
          />
        </label>
        <button disabled={busy || !accountId || !description.trim() || !amount.trim()} onClick={() => void save()}>
          {busy ? "Saving…" : "Save transaction"}
        </button>
        {error && <p className="error">{error}</p>}
        {notice && (
          <p role="status">
            {notice} <Link href="/review">Open Review</Link>
          </p>
        )}
      </section>
    </>
  );
}
