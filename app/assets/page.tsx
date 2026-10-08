"use client";
import { useState } from "react";
import { useAssets, useProjects } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { parseCents, usd } from "@/lib/reports";
export default function Assets() {
  const assets = useAssets();
  const projects = useProjects();
  const [f, setF] = useState({
    name: "",
    cost: "",
    date: "",
    vendor: "",
    serial: "",
    location: "",
    classification: "business",
    project: "",
    depreciable: false,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  const total = assets.rows.reduce((s, a) => s + a.cost_cents, 0);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    const cents = f.cost.trim() ? parseCents(f.cost) : 0;
    if (cents === null) return setNotice("Enter the cost as a dollar amount like 2,400.00.");
    setBusy(true);
    try {
      const r = await getSupabase()
        .from("assets")
        .insert({
          name: f.name.trim(),
          cost_cents: cents,
          purchase_date: f.date || null,
          vendor: f.vendor.trim() || null,
          serial_number: f.serial.trim() || null,
          location: f.location.trim() || null,
          classification: f.classification,
          project_id: f.project || null,
          depreciable: f.depreciable,
        });
      if (r.error) throw r.error;
      setF({ ...f, name: "", cost: "", date: "", vendor: "", serial: "", location: "", depreciable: false });
      await assets.refresh();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Assets</h1>
      <p>
        Equipment and other purchases you want to track. The depreciable box is
        your note for an accountant; StudioOS does not calculate depreciation.
      </p>
      <section>
        <small>Total recorded cost</small>
        <div className="metric">{usd(total)}</div>
      </section>
      <section>
        <form onSubmit={add}>
          <div className="grid">
            <label>
              Name
              <input required value={f.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label>
              Cost (USD)
              <input value={f.cost} onChange={(e) => set("cost", e.target.value)} />
            </label>
            <label>
              Purchase date
              <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
            </label>
            <label>
              Vendor
              <input value={f.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </label>
            <label>
              Serial number
              <input value={f.serial} onChange={(e) => set("serial", e.target.value)} />
            </label>
            <label>
              Location
              <input value={f.location} onChange={(e) => set("location", e.target.value)} />
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
              Project
              <select value={f.project} onChange={(e) => set("project", e.target.value)}>
                <option value="">No project</option>
                {projects.rows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={f.depreciable}
              onChange={(e) => set("depreciable", e.target.checked)}
            />
            Flag as depreciable for my accountant
          </label>
          <button disabled={busy || !f.name.trim()}>Add asset</button>
        </form>
        {(assets.error || projects.error || notice) && (
          <p className="error">{assets.error || projects.error || notice}</p>
        )}
      </section>
      <section className="scroll">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Cost</th>
              <th>Purchased</th>
              <th>Type</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            {assets.rows.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.name}
                  {a.depreciable && <small> · depreciable flag</small>}
                  {a.serial_number && (
                    <>
                      <br />
                      <small>S/N {a.serial_number}</small>
                    </>
                  )}
                </td>
                <td>{usd(a.cost_cents)}</td>
                <td>{a.purchase_date || "—"}</td>
                <td>{a.classification}</td>
                <td>{a.location || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {assets.ready && !assets.rows.length && <p>No assets yet.</p>}
      </section>
    </>
  );
}
