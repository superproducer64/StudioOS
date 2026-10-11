"use client";
import { useState } from "react";
import { useCategories, type Category } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
const kinds: Category["kind"][] = ["income", "expense", "transfer"];
const titles: Record<Category["kind"], string> = {
  income: "Income",
  expense: "Expenses",
  transfer: "Transfers (not income or expense)",
};
export default function Categories() {
  const { categories, ready, error, refresh } = useCategories();
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
