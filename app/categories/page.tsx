"use client";
import { useState } from "react";
import { fromTransactions, parseCategoryList } from "@/lib/categories";
import { useCategories, useLedger, type Category } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
const kinds: Category["kind"][] = ["income", "expense", "transfer"];
const titles: Record<Category["kind"], string> = {
  income: "Income",
  expense: "Expenses",
  transfer: "Transfers (not income or expense)",
};
export default function Categories() {
  const { categories, ready, error, refresh } = useCategories();
  const { transactions } = useLedger();
  const [pasted, setPasted] = useState("");
  const [pasteKind, setPasteKind] = useState<Category["kind"]>("expense");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Category["kind"]>("expense");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function run(work: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(true);
    setNotice("");
    try {
      const r = await work();
      if (r.error) throw new Error(r.error.message);
      await refresh();
      setNotice(done);
    } catch (e) {
      const m = (e as Error).message;
      setNotice(m.includes("duplicate key") ? "That category name already exists." : m);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Categories</h1>
      <p>
        Your list of income and expense categories. Rules and the Review queue offer these as
        choices, and rules use them to sort new statements when you import. Deleting a category
        never changes transactions or rules that already use it.
      </p>
      <button
        disabled={busy}
        onClick={() =>
          void run(
            () => getSupabase().rpc("seed_finance_categories"),
            "Starter list added. Nothing existing was changed.",
          )
        }
      >
        Add starter list
      </button>
      <button
        disabled={busy}
        onClick={() => {
          const fresh = fromTransactions(
            transactions,
            categories.map((c) => c.name),
          );
          if (!fresh.length) return setNotice("No new categories found on your imported transactions.");
          void run(
            () => getSupabase().from("categories").insert(fresh),
            "Added " + fresh.length + " from your transactions: " + fresh.map((c) => c.name).join(", ") + ".",
          );
        }}
      >
        Add categories from my transactions
      </button>
      <section>
        <h2>Paste a list</h2>
        <p>
          One per line. Add a type after a comma or tab if it is not the default (income, expense, transfer, or + / -), like
          {" "}<code>Client payments, income</code>. A two-column paste from a spreadsheet works too.
        </p>
        <label>
          Default type
          <select value={pasteKind} onChange={(e) => setPasteKind(e.target.value as Category["kind"])}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <textarea rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} />
        <button
          disabled={busy || !pasted.trim()}
          onClick={() => {
            const fresh = parseCategoryList(pasted, pasteKind, categories.map((c) => c.name));
            if (!fresh.length) return setNotice("Nothing new in that list.");
            void run(async () => {
              const r = await getSupabase().from("categories").insert(fresh);
              if (!r.error) setPasted("");
              return r;
            }, "Added " + fresh.length + " categories.");
          }}
        >
          Add pasted list
        </button>
      </section>
      <section>
        <h2>New category</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await getSupabase()
                .from("categories")
                .insert({ name: name.trim(), kind });
              if (!r.error) setName("");
              return r;
            }, "Category added.");
          }}
        >
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as Category["kind"])}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || !name.trim()}>Add category</button>
        </form>
      </section>
      {(error || notice) && <p role="status">{error || notice}</p>}
      {ready && !categories.length && (
        <section>No categories yet. Add the starter list, or create your own above.</section>
      )}
      {kinds.map((k) => {
        const list = categories.filter((c) => c.kind === k);
        if (!list.length) return null;
        return (
          <section key={k}>
            <h2>{titles[k]}</h2>
            <ul>
              {list.map((c) => (
                <li key={c.id}>
                  {c.name}{" "}
                  <button
                    disabled={busy}
                    aria-label={"Delete " + c.name}
                    onClick={() =>
                      void run(
                        () => getSupabase().from("categories").delete().eq("id", c.id),
                        "Deleted " + c.name + ".",
                      )
                    }
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
