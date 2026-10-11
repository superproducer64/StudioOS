"use client";
import { useState } from "react";
import { blockingItems, useRows, type Client } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
// A client has at most one Marketing brand profile. Its website is shown read-only here;
// edit it on the Marketing page.
type ClientWithSite = Client & { brand_profiles: { website: string | null }[] | null };
const siteOf = (c: ClientWithSite) => c.brand_profiles?.find((p) => p.website)?.website ?? null;
function ClientRow({ c, onChange }: { c: ClientWithSite; onChange: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(c.name);
  const [email, setEmail] = useState(c.email ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const r = await getSupabase()
        .from("clients")
        .update({ name: name.trim(), email: email.trim() || null })
        .eq("id", c.id);
      if (r.error) throw r.error;
      setEditing(false);
      await onChange();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function askDelete() {
    setBusy(true);
    setMessage("");
    try {
      const blocked = await blockingItems(c.id, [
        ["project(s)", "projects", "client_id"],
        ["invoice(s)", "invoices", "client_id"],
        ["marketing brand profile(s)", "brand_profiles", "client_id"],
      ]);
      if (blocked.length)
        setMessage(
          "Can't delete yet: " + blocked.join(", ") +
            " still use this client. Move or remove those first, or just fix the name with Edit.",
        );
      else setConfirming(true);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      const r = await getSupabase().from("clients").delete().eq("id", c.id);
      if (r.error) throw r.error;
      await onChange();
    } catch (e) {
      setMessage((e as Error).message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr>
      <td>
        {editing ? (
          <input aria-label="Client name" value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          c.name
        )}
      </td>
      <td>
        {editing ? (
          <input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        ) : (
          c.email || "—"
        )}
      </td>
      <td>
        {siteOf(c) ? (
          <a href={siteOf(c)!} target="_blank" rel="noopener noreferrer">
            {siteOf(c)!.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td>
        {editing ? (
          <>
            <button disabled={busy || !name.trim()} onClick={() => void save()}>
              Save
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setName(c.name);
                setEmail(c.email ?? "");
                setMessage("");
              }}
            >
              Cancel
            </button>
          </>
        ) : confirming ? (
          <>
            <small>Delete {c.name}? This can't be undone.</small>
            <button disabled={busy} onClick={() => void remove()}>
              Yes, delete
            </button>
            <button disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button disabled={busy} onClick={() => void askDelete()}>
              Delete
            </button>
          </>
        )}
        {message && <p className="error">{message}</p>}
      </td>
    </tr>
  );
}
export default function Clients() {
  const { rows, ready, error, refresh } = useRows<ClientWithSite>("clients", "*, brand_profiles(website)", "name");
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
              <th>Website</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <ClientRow key={c.id + c.name + (c.email ?? "")} c={c} onChange={refresh} />
            ))}
          </tbody>
        </table>
        {ready && !rows.length && <p>No clients yet.</p>}
      </section>
    </>
  );
}
