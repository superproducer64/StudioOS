"use client";
import { useState } from "react";
import { blockingItems, useClients, useProjects, type Client, type Project } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { parseCents, usd } from "@/lib/reports";
const statuses = ["active", "on hold", "completed", "archived"];
function ProjectRow({
  p,
  clients,
  onChange,
  setStatus,
}: {
  p: Project;
  clients: Client[];
  onChange: () => Promise<void>;
  setStatus: (id: string, status: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(p.name);
  const [clientId, setClientId] = useState(p.client_id ?? "");
  const [budget, setBudget] = useState(p.budget_cents ? (p.budget_cents / 100).toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const clientName = clients.find((c) => c.id === p.client_id)?.name ?? "—";
  async function save() {
    const cents = budget.trim() ? parseCents(budget) : 0;
    if (cents === null) return setMessage("Enter the budget as a dollar amount like 12,500.00.");
    setBusy(true);
    setMessage("");
    try {
      const r = await getSupabase()
        .from("projects")
        .update({ name: name.trim(), client_id: clientId || null, budget_cents: cents })
        .eq("id", p.id);
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
      const blocked = await blockingItems(p.id, [
        ["transaction(s) tagged to it", "transactions", "project_id"],
        ["invoice(s)", "invoices", "project_id"],
        ["asset(s)", "assets", "project_id"],
      ]);
      if (blocked.length)
        setMessage(
          "Can't delete yet: " + blocked.join(", ") +
            ". Set the status to archived instead, or fix the name with Edit.",
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
      const r = await getSupabase().from("projects").delete().eq("id", p.id);
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
          <input aria-label="Project name" value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          p.name
        )}
      </td>
      <td>
        {editing ? (
          <select aria-label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          clientName
        )}
      </td>
      <td>
        {editing ? (
          <input aria-label="Budget" value={budget} onChange={(e) => setBudget(e.target.value)} />
        ) : p.budget_cents ? (
          usd(p.budget_cents)
        ) : (
          "—"
        )}
      </td>
      <td>
        <select
          aria-label="Status"
          value={statuses.includes(p.status) ? p.status : "active"}
          onChange={(e) => void setStatus(p.id, e.target.value)}
        >
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
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
                setName(p.name);
                setClientId(p.client_id ?? "");
                setBudget(p.budget_cents ? (p.budget_cents / 100).toFixed(2) : "");
                setMessage("");
              }}
            >
              Cancel
            </button>
          </>
        ) : confirming ? (
          <>
            <small>Delete {p.name}? This can't be undone.</small>
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
export default function Projects() {
  const projects = useProjects();
  const clients = useClients();
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    const cents = budget.trim() ? parseCents(budget) : 0;
    if (cents === null) return setNotice("Enter the budget as a dollar amount like 12,500.00.");
    setBusy(true);
    try {
      const r = await getSupabase()
        .from("projects")
        .insert({ name: name.trim(), client_id: clientId || null, budget_cents: cents });
      if (r.error) throw r.error;
      setName("");
      setBudget("");
      await projects.refresh();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(id: string, status: string) {
    setNotice("");
    const r = await getSupabase().from("projects").update({ status }).eq("id", id);
    if (r.error) setNotice(r.error.message);
    await projects.refresh();
  }
  return (
    <>
      <h1>Projects</h1>
      <p>Tag transactions to a project in Review, then see its income, expenses and invoices in Reports.</p>
      <section>
        <form onSubmit={add}>
          <label>
            Project name
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Client (optional)
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">No client</option>
              {clients.rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Budget (USD, optional)
            <input value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <button disabled={busy || !name.trim()}>Add project</button>
        </form>
        {(projects.error || clients.error || notice) && (
          <p className="error">{projects.error || clients.error || notice}</p>
        )}
      </section>
      <section className="scroll">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Budget</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.rows.map((p) => (
              <ProjectRow
                key={[p.id, p.name, p.client_id, p.budget_cents].join(":")}
                p={p}
                clients={clients.rows}
                onChange={projects.refresh}
                setStatus={setStatus}
              />
            ))}
          </tbody>
        </table>
        {projects.ready && !projects.rows.length && <p>No projects yet.</p>}
      </section>
    </>
  );
}
