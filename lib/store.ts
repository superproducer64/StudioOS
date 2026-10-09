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
  opening_balance_cents: number;
  opening_balance_on: string | null;
};
export type AccountBalance = {
  account_id: string;
  name: string;
  currency: string;
  opening_balance_cents: number;
  opening_balance_on: string | null;
  activity_cents: number;
  balance_cents: number;
  transaction_count: number;
  unreviewed_count: number;
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
export type Client = {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
};
export type Project = {
  id: string;
  client_id: string | null;
  name: string;
  status: string;
  budget_cents: number;
  created_at: string;
};
export type Invoice = {
  id: string;
  client_id: string;
  project_id: string | null;
  invoice_number: string;
  status: string;
  currency: string;
  total_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
  issued_on: string | null;
  paid_on: string | null;
  created_at: string;
};
export type InvoiceItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  created_at: string;
};
export type Subscription = {
  id: string;
  vendor: string;
  category: string | null;
  amount_cents: number;
  currency: string;
  cadence: string;
  next_renewal: string | null;
  active: boolean;
  classification: string;
  account_id: string | null;
  created_at: string;
};
export type Asset = {
  id: string;
  name: string;
  purchase_date: string | null;
  cost_cents: number;
  vendor: string | null;
  serial_number: string | null;
  location: string | null;
  depreciable: boolean;
  classification: string;
  project_id: string | null;
  created_at: string;
};
export type ImportTemplate = {
  id: string;
  account_id: string;
  name: string;
  source: string;
  mapping: Record<string, string | boolean>;
  created_at: string;
};
export type ProjectPnl = {
  project_id: string;
  name: string;
  client_id: string | null;
  status: string;
  budget_cents: number;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
  invoiced_cents: number;
  paid_cents: number;
};
/**
 * Loads every row the signed-in owner can see (RLS enforces ownership; the owner filter is a
 * second guard). `tiebreak` is the unique column used for stable paging; pass the view's key
 * column for views that have no `id`.
 */
export function useRows<T>(
  table: string,
  query: string = "*",
  order: string = "created_at",
  tiebreak: string = "id",
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
          .order(tiebreak)
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
  }, [user, table, query, order, tiebreak]);
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
export const useClients = () => useRows<Client>("clients", "*", "name");
export const useProjects = () => useRows<Project>("projects", "*", "name");
export const useInvoices = () => useRows<Invoice>("invoices");
export const useInvoiceItems = () => useRows<InvoiceItem>("invoice_items");
export const useSubscriptions = () =>
  useRows<Subscription>("subscriptions", "*", "vendor");
export const useAssets = () => useRows<Asset>("assets");
export const useTemplates = () =>
  useRows<ImportTemplate>("import_templates", "*", "name");
export const useAccountBalances = () =>
  useRows<AccountBalance>("account_balances", "*", "name", "account_id");
export const useProjectPnl = () =>
  useRows<ProjectPnl>("project_pnl", "*", "name", "project_id");
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
  classification: string;
  tax_deductible: boolean;
  project_id: string | null;
  invoice_id: string | null;
  accounts: Account;
  import_batches: { source: Transaction["source"] };
};
export function useLedger() {
  const data = useRows<DbTransaction>(
    "transactions",
    "*,accounts!transactions_account_id_owner_id_fkey(name),import_batches!transactions_import_account_fkey(source)",
    "occurred_on",
  );
  const toTransaction = (t: DbTransaction): Transaction => ({
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
    classification: t.classification,
    taxDeductible: t.tax_deductible,
    projectId: t.project_id,
    invoiceId: t.invoice_id,
    voided: t.voided,
  });
  // Reversed imports are left out of the ledger, but a reversed deposit that was matched to an
  // invoice must stay reachable so the match can be undone.
  const transactions = data.rows.filter((t) => !t.voided).map(toTransaction);
  const matchedDeposits = data.rows.filter((t) => t.invoice_id).map(toTransaction);
  return { ...data, transactions, matchedDeposits };
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
  classification?: string,
  taxDeductible?: boolean,
) {
  const { error } = await getSupabase().rpc("review_transaction", {
    p_id: id,
    p_category: category,
    p_kind: kind,
    p_approved: approved,
    p_classification: classification,
    p_tax_deductible: taxDeductible,
  });
  if (error) throw error;
}
export async function tagTransaction(id: string, projectId: string | null) {
  const { error } = await getSupabase().rpc("tag_transaction", {
    p_id: id,
    p_project: projectId,
  });
  if (error) throw error;
}
