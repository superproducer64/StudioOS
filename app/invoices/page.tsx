"use client";
import { useState } from "react";
import {
  useClients,
  useInvoiceItems,
  useInvoices,
  useLedger,
  useProjects,
  type Invoice,
  type InvoiceItem,
} from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import { suggestDeposits } from "@/lib/matching";
import type { Transaction } from "@/lib/imports";
import {
  invoiceBalanceCents,
  invoiceDisplayStatus,
  parseCents,
  usd,
} from "@/lib/reports";
const today = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
};
function InvoiceCard({
  inv,
  clientName,
  items,
  deposits,
  matchedDeposits,
  onChange,
}: {
  inv: Invoice;
  clientName: string;
  items: InvoiceItem[];
  deposits: Transaction[];
  matchedDeposits: Transaction[];
  onChange: () => Promise<void>;
}) {
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [payment, setPayment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = invoiceDisplayStatus(inv, today());
  const draft = inv.status === "draft";
  const canPay = inv.status === "sent" || inv.status === "partially_paid";
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (r.error) throw new Error(r.error.message);
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sb = () => getSupabase();
  const suggestions = suggestDeposits(inv, deposits);
  const matched = matchedDeposits.filter((t) => t.invoiceId === inv.id);
  function addItem(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseCents(price);
    const q = Number(qty);
    if (cents === null || !(q > 0)) return setError("Enter a quantity above zero and a price like 150.00.");
    void run(() =>
      sb().from("invoice_items").insert({
        invoice_id: inv.id,
        description: desc.trim(),
        quantity: q,
        unit_price_cents: cents,
      }),
    ).then(() => {
      setDesc("");
      setPrice("");
      setQty("1");
    });
  }
  function pay(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseCents(payment);
    if (cents === null || cents <= 0) return setError("Enter a payment like 500.00.");
    void run(() =>
      sb().rpc("record_invoice_payment", {
        p_invoice: inv.id,
        p_amount_cents: cents,
        p_paid_on: today(),
      }),
    ).then(() => setPayment(""));
  }
  return (
    <section>
      <h2>
        {inv.invoice_number} · {clientName}
      </h2>
      <p>
        <strong>{status.replace("_", " ")}</strong> · Total {usd(inv.total_cents, inv.currency)} · Paid{" "}
        {usd(inv.amount_paid_cents, inv.currency)} · Balance {usd(invoiceBalanceCents(inv), inv.currency)}
        {inv.due_date && " · Due " + inv.due_date}
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td>{i.quantity}</td>
                <td>{usd(i.unit_price_cents, inv.currency)}</td>
                <td>{usd(Math.round(i.quantity * i.unit_price_cents), inv.currency)}</td>
                <td>
                  {draft && (
                    <button disabled={busy} onClick={() => void run(() => sb().from("invoice_items").delete().eq("id", i.id))}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <form onSubmit={addItem}>
          <div className="grid">
            <label>
              Description
              <input required value={desc} onChange={(e) => setDesc(e.target.value)} />
            </label>
            <label>
              Quantity
              <input value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label>
              Unit price (USD)
              <input required value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
          </div>
          <button disabled={busy || !desc.trim()}>Add line item</button>
          <button
            type="button"
            disabled={busy || !items.length}
            onClick={() =>
              void run(() => sb().from("invoices").update({ status: "sent", issued_on: today() }).eq("id", inv.id))
            }
          >
            Mark as sent
          </button>
        </form>
      )}
      {canPay && (
        <form onSubmit={pay}>
          <label>
            Record a payment (USD)
            <input value={payment} onChange={(e) => setPayment(e.target.value)} />
          </label>
          <button disabled={busy || !payment.trim()}>Record payment</button>
        </form>
      )}
      {canPay && (
        <div>
          <strong>Possible bank deposits</strong>
          {suggestions.length ? (
            <ul>
              {suggestions.map(({ deposit: d, exact }) => (
                <li key={d.id}>
                  {d.date} · {d.description} · {usd(d.amountCents, d.currency)}{" "}
                  {exact && <span className="badge">Matches the balance</span>}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() => sb().rpc("match_invoice_payment", { p_invoice: inv.id, p_transaction: d.id }))
                    }
                  >
                    This paid it
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              <small>
                No unmatched deposits that fit. Deposits must be income, in {inv.currency}, no larger than the
                balance, and dated on or after the day the invoice was sent.
              </small>
            </p>
          )}
        </div>
      )}
      {matched.length > 0 && (
        <div>
          <strong>Matched deposits</strong>
          <ul>
            {matched.map((d) => (
              <li key={d.id}>
                {d.date} · {d.description} · {usd(d.amountCents, d.currency)}
                {d.voided && <span className="badge warn">Import reversed</span>}
                {inv.status !== "void" && (
                  <button
                    disabled={busy}
                    onClick={() => void run(() => sb().rpc("unmatch_invoice_payment", { p_transaction: d.id }))}
                  >
                    Undo match
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {inv.status !== "void" && inv.status !== "paid" && (
        <button disabled={busy} onClick={() => void run(() => sb().from("invoices").update({ status: "void" }).eq("id", inv.id))}>
          Void invoice
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
export default function Invoices() {
  const invoices = useInvoices();
  const items = useInvoiceItems();
  const clients = useClients();
  const projects = useProjects();
  const ledger = useLedger();
  const [f, setF] = useState({ client: "", project: "", number: "", due: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const t = today();
  const outstanding = invoices.rows
    .filter((i) => i.currency === "USD" && (i.status === "sent" || i.status === "partially_paid"))
    .reduce((s, i) => s + invoiceBalanceCents(i), 0);
  const overdue = invoices.rows
    .filter((i) => i.currency === "USD" && invoiceDisplayStatus(i, t) === "overdue")
    .reduce((s, i) => s + invoiceBalanceCents(i), 0);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const r = await getSupabase()
        .from("invoices")
        .insert({
          client_id: f.client,
          project_id: f.project || null,
          invoice_number: f.number.trim(),
          due_date: f.due || null,
        });
      if (r.error)
        throw new Error(
          r.error.message.includes("duplicate") ? "That invoice number is already used." : r.error.message,
        );
      setF({ ...f, number: "", due: "" });
      await invoices.refresh();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshAll() {
    await Promise.all([invoices.refresh(), items.refresh(), ledger.refresh()]);
  }
  const errors = invoices.error || items.error || ledger.error || clients.error || projects.error || notice;
  return (
    <>
      <h1>Invoices</h1>
      <p>
        Totals come from the line items. Overdue is worked out from the due
        date, not stored. You can record a payment by hand, or match a deposit
        from your imported bank transactions so it is not counted twice.
      </p>
      <div className="grid">
        <section>
          <small>Outstanding (USD)</small>
          <div className="metric">{usd(outstanding)}</div>
        </section>
        <section>
          <small>Overdue (USD)</small>
          <div className="metric">{usd(overdue)}</div>
        </section>
      </div>
      <section>
        <form onSubmit={add}>
          <div className="grid">
            <label>
              Client
              <select required value={f.client} onChange={(e) => set("client", e.target.value)}>
                <option value="">Choose client</option>
                {clients.rows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Project (optional)
              <select value={f.project} onChange={(e) => set("project", e.target.value)}>
                <option value="">No project</option>
                {projects.rows.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Invoice number
              <input required value={f.number} onChange={(e) => set("number", e.target.value)} />
            </label>
            <label>
              Due date
              <input type="date" value={f.due} onChange={(e) => set("due", e.target.value)} />
            </label>
          </div>
          <button disabled={busy || !f.client || !f.number.trim()}>Create draft invoice</button>
        </form>
        {clients.ready && !clients.rows.length && <p>Add a client first.</p>}
        {errors && <p className="error">{errors}</p>}
      </section>
      {[...invoices.rows].reverse().map((inv) => (
        <InvoiceCard
          key={inv.id + inv.status + inv.total_cents + inv.amount_paid_cents}
          inv={inv}
          clientName={clients.rows.find((c) => c.id === inv.client_id)?.name ?? "Unknown client"}
          items={items.rows.filter((i) => i.invoice_id === inv.id)}
          deposits={ledger.transactions}
          matchedDeposits={ledger.matchedDeposits}
          onChange={refreshAll}
        />
      ))}
      {invoices.ready && !invoices.rows.length && <section>No invoices yet.</section>}
    </>
  );
}
