"use client";
import { useState } from "react";
import { useClients } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
export default function Clients() {
  const { rows, ready, error, refresh } = useClients();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const r = await getSupabase()
        .from("clients")
        .insert({ name: name.trim(), email: email.trim() || null });
      if (r.error) throw r.error;
      setName("");
      setEmail("");
      await refresh();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Clients</h1>
      <section>
        <form onSubmit={add}>
          <label>
            Client name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email (optional)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button disabled={busy || !name.trim()}>Add client</button>
        </form>
        {(error || notice) && <p className="error">{error || notice}</p>}
      </section>
      <section className="scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.email || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ready && !rows.length && <p>No clients yet.</p>}
      </section>
    </>
  );
}
