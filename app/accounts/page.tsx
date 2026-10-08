"use client";
import { useState } from "react";
import { useAccounts } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
export default function Accounts() {
  const { accounts, error, refresh } = useAccounts();
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
              await refresh();
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
      {accounts.map((a) => (
        <section key={a.id}>
          <h2>{a.name}</h2>
          <p>
            {a.provider} · {a.account_type} · {a.currency}
          </p>
        </section>
      ))}
    </>
  );
}
