"use client";
import { useState } from "react";
import { useClients, useProjects } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { parseCents, usd } from "@/lib/reports";
const statuses = ["active", "on hold", "completed", "archived"];
export default function Projects() {
  const projects = useProjects();
  const clients = useClients();
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const clientName = (id: string | null) =>
    clients.rows.find((c) => c.id === id)?.name ?? "—";
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
            </tr>
          </thead>
          <tbody>
            {projects.rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{clientName(p.client_id)}</td>
                <td>{p.budget_cents ? usd(p.budget_cents) : "—"}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
        {projects.ready && !projects.rows.length && <p>No projects yet.</p>}
      </section>
    </>
  );
}
