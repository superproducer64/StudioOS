"use client";
import { useState } from "react";
import { useAccounts, useSubscriptions } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { parseCents, recurringSummary, usd } from "@/lib/reports";
export default function Subscriptions() {
  const subs = useSubscriptions();
  const { accounts } = useAccounts();
  const [f, setF] = useState({
    vendor: "",
    amount: "",
    cadence: "monthly",
    renewal: "",
    category: "",
    classification: "business",
    account: "",
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const summary = recurringSummary(subs.rows);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    const cents = parseCents(f.amount);
    if (cents === null) return setNotice("Enter the amount as a dollar amount like 19.99.");
    setBusy(true);
    try {
      const r = await getSupabase()
        .from("subscriptions")
        .insert({
          vendor: f.vendor.trim(),
          amount_cents: cents,
          cadence: f.cadence,
          next_renewal: f.renewal || null,
          category: f.category.trim() || null,
          classification: f.classification,
          account_id: f.account || null,
        });
      if (r.error) throw r.error;
      setF({ ...f, vendor: "", amount: "", renewal: "", category: "" });
      await subs.refresh();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(id: string, active: boolean) {
    const r = await getSupabase().from("subscriptions").update({ active }).eq("id", id);
    if (r.error) setNotice(r.error.message);
    await subs.refresh();
  }
  return (
    <>
      <h1>Subscriptions</h1>
      <section>
        <small>Active recurring spend (USD)</small>
        <div className="metric">{usd(summary.monthlyCents)} / month</div>
        <small>
          Annual plans are divided by 12.
          {summary.unnormalized > 0 && " " + summary.unnormalized + " with an irregular cadence are not included."}
          {summary.otherCurrency > 0 && " " + summary.otherCurrency + " in other currencies are not included."}
        </small>
      </section>
      <section>
        <form onSubmit={add}>
          <div className="grid">
            <label>
              Vendor
              <input required value={f.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </label>
            <label>
              Amount (USD)
              <input required value={f.amount} onChange={(e) => set("amount", e.target.value)} />
            </label>
            <label>
              Cadence
              <select value={f.cadence} onChange={(e) => set("cadence", e.target.value)}>
                {["monthly", "annual", "other"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Next renewal
              <input type="date" value={f.renewal} onChange={(e) => set("renewal", e.target.value)} />
            </label>
            <label>
              Category
              <input value={f.category} onChange={(e) => set("category", e.target.value)} />
            </label>
            <label>
              Business or personal
              <select value={f.classification} onChange={(e) => set("classification", e.target.value)}>
                {["business", "personal", "mixed"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Paid from
              <select value={f.account} onChange={(e) => set("account", e.target.value)}>
                <option value="">Not linked</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button disabled={busy || !f.vendor.trim()}>Add subscription</button>
        </form>
        {(subs.error || notice) && <p className="error">{subs.error || notice}</p>}
      </section>
      <section className="scroll">
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Cadence</th>
              <th>Renews</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subs.rows.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.vendor}
                  {s.category && (
                    <>
                      <br />
                      <small>{s.category}</small>
                    </>
                  )}
                </td>
                <td>{usd(s.amount_cents, s.currency)}</td>
                <td>{s.cadence}</td>
                <td>{s.next_renewal || "—"}</td>
                <td>{s.classification}</td>
                <td>
                  <button onClick={() => void toggle(s.id, !s.active)}>
                    {s.active ? "Active · pause" : "Paused · resume"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {subs.ready && !subs.rows.length && <p>No subscriptions yet.</p>}
      </section>
    </>
  );
}
