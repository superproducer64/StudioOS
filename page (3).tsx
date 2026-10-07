"use client";
import { useState } from "react";
import { useRows, type Batch } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
export default function History() {
  const { rows, error, refresh } = useRows<Batch>("import_batches");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h1>Import history</h1>
      <p>
        Reversing an import excludes its transactions from the ledger while
        preserving their audit history. You can restore it.
      </p>
      {error && <p className="error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {rows.map((b) => (
        <section key={b.id}>
          <h2>{b.filename}</h2>
          <p>
            {b.source} · {b.row_count} new rows · {b.status} ·{" "}
            {new Date(b.created_at).toLocaleString()}
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setNotice("");
              try {
                const { error } = await getSupabase().rpc(
                  "set_import_reversed",
                  { p_batch: b.id, p_reversed: b.status !== "reversed" },
                );
                if (error) throw error;
                await refresh();
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {b.status === "reversed" ? "Restore import" : "Reverse import"}
          </button>
        </section>
      ))}
    </>
  );
}
