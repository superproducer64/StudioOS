"use client";
import { useState } from "react";
import { useAccountBalances, useAccounts, type Account, type AccountBalance } from "@/lib/store";
import { parseSignedCents, usd } from "@/lib/reports";
import { getSupabase } from "@/lib/supabase";
function AccountCard({
  a,
  bal,
  onChange,
}: {
  a: Account;
  bal?: AccountBalance;
  onChange: () => Promise<void>;
}) {
  const [opening, setOpening] = useState((a.opening_balance_cents / 100).toFixed(2));
  const [on, setOn] = useState(a.opening_balance_on ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseSignedCents(opening);
    if (cents === null) return setMsg("Enter an amount like 2500.00, or -400.00 for a card balance you owe.");
    if (cents !== 0 && !on) return setMsg("Pick the date that balance was true at the start of the day.");
    setBusy(true);
    setMsg("");
    try {
      const r = await getSupabase()
        .from("accounts")
        .update({ opening_balance_cents: cents, opening_balance_on: on || null })
        .eq("id", a.id);
      if (r.error) throw r.error;
      await onChange();
      setMsg("Saved.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>{a.name}</h2>
      <p>
        {a.provider} · {a.account_type} · {a.currency}
      </p>
      {bal && (
        <>
          <div className="metric">{usd(bal.balance_cents, a.currency)}</div>
          <small>
            Calculated balance: opening balance plus {bal.transaction_count} imported transaction(s)
            {bal.opening_balance_on ? " from " + bal.opening_balance_on : ""}.
            {bal.unreviewed_count > 0 && " " + bal.unreviewed_count + " not reviewed yet."} This is worked out
            from what you imported, not read from your bank, so compare it with your statement.
          </small>
        </>
      )}
      <form onSubmit={save}>
        <div className="grid">
          <label>
            Opening balance ({a.currency})
            <input value={opening} onChange={(e) => setOpening(e.target.value)} />
          </label>
          <label>
            As of the start of
            <input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
          </label>
        </div>
        <button disabled={busy}>Save opening balance</button>
        {msg && <span role="status">{msg}</span>}
      </form>
    </section>
  );
}
export default function Accounts() {
  const { accounts, error, refresh } = useAccounts();
  const balances = useAccountBalances();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("Bank");
  const [type, setType] = useState("bank");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <>
      <h1>Accounts</h1>
      <section>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setNotice("");
            try {
              const result = await getSupabase()
                .from("accounts")
                .insert({
                  name: name.trim(),
                  provider,
                  account_type: type,
                  currency: currency.toUpperCase(),
                });
              if (result.error) throw result.error;
              setName("");
              await Promise.all([refresh(), balances.refresh()]);
              setNotice("Account created.");
            } catch (e) {
              setNotice((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Account name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Provider
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {["Bank", "Card", "Venmo", "Square", "PayPal", "Cash"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {["bank", "card", "payment_processor", "cash"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <input
              required
              pattern="[A-Za-z]{3}"
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
          <button disabled={busy || !name.trim()}>Create account</button>
        </form>
        {notice && <p role="status">{notice}</p>}
        {error && <p className="error">{error}</p>}
      </section>
      {balances.error && <p className="error">{balances.error}</p>}
      {accounts.map((a) => (
        <AccountCard
          key={a.id + a.opening_balance_cents + (a.opening_balance_on ?? "")}
          a={a}
          bal={balances.rows.find((b) => b.account_id === a.id)}
          onChange={() => Promise.all([refresh(), balances.refresh()]).then(() => undefined)}
        />
      ))}
    </>
  );
}
