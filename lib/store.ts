"use client";
import { useCallback, useEffect, useState } from "react";
import type { Transaction } from "./imports";
import type { Rule } from "./rules";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth";
export type Account = {
  id: string;
  name: string;
  provider: string;
  account_type: string;
  currency: string;
};
export type Batch = {
  id: string;
  filename: string;
  source: string;
  status: string;
  row_count: number;
  created_at: string;
};
export type SavedRule = Rule & { id: string; enabled: boolean };
export function useRows<T>(
  table: string,
  query: string = "*",
  order: string = "created_at",
) {
  const { user } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const data: T[] = [];
      for (let start = 0; ; start += 1000) {
        const result = await getSupabase()
          .from(table)
          .select(query)
          .eq("owner_id", user.id)
          .order(order)
          .order("id")
          .range(start, start + 999);
        if (result.error) throw result.error;
        const chunk = result.data as unknown as T[];
        data.push(...chunk);
        if (chunk.length < 1000) break;
      }
      setRows(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, [user, table, query, order]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { rows, ready, error, refresh };
}
export function useAccounts() {
  const data = useRows<Account>("accounts");
  return { ...data, accounts: data.rows };
}
export function useRules() {
  const data = useRows<SavedRule>("category_rules");
  return { ...data, rules: data.rows };
}
type DbTransaction = {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  currency: string;
  category: string;
  kind: string;
  matched_rule: string | null;
  review_status: string;
  raw: Record<string, string>;
  account_id: string;
  voided: boolean;
  accounts: Account;
  import_batches: { source: Transaction["source"] };
};
export function useLedger() {
  const data = useRows<DbTransaction>(
    "transactions",
    "*,accounts!transactions_account_id_owner_id_fkey(name),import_batches!transactions_import_account_fkey(source)",
    "occurred_on",
  );
  const transactions: Transaction[] = data.rows
    .filter((t) => !t.voided)
    .map((t) => ({
      id: t.id,
      date: t.occurred_on,
      description: t.description,
      amountCents: t.amount_cents,
      currency: t.currency,
      category: t.category,
      kind: t.kind,
      matchedRule: t.matched_rule,
      reviewed: t.review_status === "approved",
      source: t.import_batches?.source || "Bank",
      account: t.accounts?.name || t.account_id,
      raw: t.raw,
    }));
  return { ...data, transactions };
}
export async function commitImport(
  accountId: string,
  source: string,
  filename: string,
  rows: Transaction[],
) {
  const { data, error } = await getSupabase().rpc("commit_import", {
    p_account: accountId,
    p_source: source,
    p_filename: filename,
    p_rows: rows.map((t) => ({
      dedupe_key: t.id,
      occurred_on: t.date,
      description: t.description,
      amount_cents: t.amountCents,
      currency: t.currency,
      category: t.category,
      kind: t.kind,
      matched_rule: t.matchedRule,
      raw: t.raw,
    })),
  });
  if (error) throw error;
  return data as { inserted: number; skipped: number; batch_id: string };
}
export async function reviewTransaction(
  id: string,
  category: string,
  kind: string,
  approved: boolean,
) {
  const { error } = await getSupabase().rpc("review_transaction", {
    p_id: id,
    p_category: category,
    p_kind: kind,
    p_approved: approved,
  });
  if (error) throw error;
}
