-- Finance polish: account balances and matching bank deposits to invoices.
-- Every function runs with the caller's privileges (security invoker), so row-level security
-- still applies, and each one also checks ownership itself.

-- ---------------------------------------------------------------------------
-- 1. Account balances
-- ---------------------------------------------------------------------------
-- The opening balance is what the account held at the START of opening_balance_on. Transactions
-- dated on or after that day are added to it. With no date, every transaction counts.
alter table public.accounts
  add column opening_balance_cents bigint not null default 0,
  add column opening_balance_on date;

-- Reversed (voided) imports are excluded. Unreviewed transactions are included, because the
-- money has moved whether or not it has been categorized; unreviewed_count says how many.
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.owner_id,
  a.name,
  a.currency,
  a.opening_balance_cents,
  a.opening_balance_on,
  coalesce(t.activity_cents, 0)::bigint as activity_cents,
  (a.opening_balance_cents + coalesce(t.activity_cents, 0))::bigint as balance_cents,
  coalesce(t.transaction_count, 0)::bigint as transaction_count,
  coalesce(t.unreviewed_count, 0)::bigint as unreviewed_count
from public.accounts a
left join lateral (
  select sum(x.amount_cents) as activity_cents,
         count(*) as transaction_count,
         count(*) filter (where x.review_status <> 'approved') as unreviewed_count
    from public.transactions x
   where x.owner_id = a.owner_id
     and x.account_id = a.id
     and x.currency = a.currency
     and not x.voided
     and (a.opening_balance_on is null or x.occurred_on >= a.opening_balance_on)
) t on true;
revoke all on public.account_balances from anon;
grant select on public.account_balances to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Matching a bank deposit to an invoice
-- ---------------------------------------------------------------------------
alter table public.transactions add column invoice_id uuid;
alter table public.transactions
  add foreign key (invoice_id, owner_id) references public.invoices (id, owner_id);
create index transactions_invoice on public.transactions (owner_id, invoice_id);

-- Records the deposit as a payment on the invoice and links the two, in one step, so the same
-- deposit cannot be counted twice.
create function public.match_invoice_payment(p_invoice uuid, p_transaction uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  inv public.invoices%rowtype;
  tx public.transactions%rowtype;
  paid bigint;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into inv from public.invoices
    where id = p_invoice and owner_id = auth.uid() for update;
  if not found then raise exception 'Invoice not found'; end if;
  select * into tx from public.transactions
    where id = p_transaction and owner_id = auth.uid() for update;
  if not found then raise exception 'Transaction not found'; end if;
  if tx.voided then raise exception 'That transaction was reversed'; end if;
  if tx.invoice_id is not null then raise exception 'That transaction is already matched to an invoice'; end if;
  if tx.kind <> 'income' or tx.amount_cents <= 0 then
    raise exception 'Only incoming income transactions can pay an invoice';
  end if;
  if tx.currency <> inv.currency then raise exception 'The transaction and invoice currencies differ'; end if;
  if inv.status not in ('sent', 'partially_paid') then
    raise exception 'Only sent invoices can receive payments';
  end if;
  if tx.amount_cents > inv.total_cents - inv.amount_paid_cents then
    raise exception 'The deposit is larger than the invoice balance';
  end if;
  paid := inv.amount_paid_cents + tx.amount_cents;
  update public.invoices
     set amount_paid_cents = paid,
         status = case when paid >= inv.total_cents then 'paid' else 'partially_paid' end,
         paid_on = case when paid >= inv.total_cents then tx.occurred_on else null end
   where id = p_invoice;
  update public.transactions set invoice_id = p_invoice where id = p_transaction;
end $$;

-- Undoes a match made by mistake: takes the amount back off the invoice and unlinks the deposit.
create function public.unmatch_invoice_payment(p_transaction uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  inv_id uuid;
  inv public.invoices%rowtype;
  tx public.transactions%rowtype;
  paid bigint;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select invoice_id into inv_id from public.transactions
    where id = p_transaction and owner_id = auth.uid();
  if not found then raise exception 'Transaction not found'; end if;
  if inv_id is null then raise exception 'That transaction is not matched to an invoice'; end if;
  -- Same lock order as match_invoice_payment: invoice first, then transaction.
  select * into inv from public.invoices where id = inv_id and owner_id = auth.uid() for update;
  select * into tx from public.transactions where id = p_transaction and owner_id = auth.uid() for update;
  if tx.invoice_id is distinct from inv_id then raise exception 'The match changed; try again'; end if;
  if inv.status = 'void' then raise exception 'A void invoice cannot be changed'; end if;
  paid := inv.amount_paid_cents - tx.amount_cents;
  if paid < 0 then raise exception 'The invoice payments do not add up; fix the invoice first'; end if;
  update public.invoices
     set amount_paid_cents = paid,
         status = case when paid >= total_cents and total_cents > 0 then 'paid'
                       when paid > 0 then 'partially_paid' else 'sent' end,
         paid_on = case when paid >= total_cents and total_cents > 0 then paid_on else null end
   where id = inv_id;
  update public.transactions set invoice_id = null where id = p_transaction;
end $$;

revoke all on function
  public.match_invoice_payment(uuid, uuid),
  public.unmatch_invoice_payment(uuid)
  from public, anon;
grant execute on function
  public.match_invoice_payment(uuid, uuid),
  public.unmatch_invoice_payment(uuid)
  to authenticated;
