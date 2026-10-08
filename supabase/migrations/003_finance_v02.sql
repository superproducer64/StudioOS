-- 003 · FinanceOS v0.2 foundations
-- Adds: business/personal classification, tax-deductible flag, saved import templates,
-- assets, invoice payments and totals, project tagging, and owner-scoped report views.
-- Conventions match 001/002: owner_id defaults to auth.uid(), composite (id, owner_id) foreign
-- keys keep every link inside one owner, RLS is enabled and enforced, anon has no access,
-- and functions run with invoker privileges unless noted.
begin;

-- ---------------------------------------------------------------------------
-- 1. Classification and tax flags on transactions
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column classification text not null default 'unclassified'
    check (classification in ('business', 'personal', 'mixed', 'unclassified')),
  add column tax_deductible boolean not null default false;

-- A deductible flag only makes sense on a business or mixed expense. It is the owner's own
-- flag for later accountant review, never an automatic tax determination.
alter table public.transactions
  add constraint tax_flag_only_business_expense
  check (not tax_deductible or (kind = 'expense' and classification in ('business', 'mixed')));

-- ---------------------------------------------------------------------------
-- 2. Review function: classification, tax flag, approval guard
-- ---------------------------------------------------------------------------
drop function public.review_transaction(uuid, text, text, boolean);

create function public.review_transaction(
  p_id uuid,
  p_category text,
  p_kind text,
  p_approved boolean,
  p_classification text default null,
  p_tax_deductible boolean default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  cur public.transactions%rowtype;
  cls text;
  tax boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if trim(coalesce(p_category, '')) = ''
     or (p_approved and lower(trim(p_category)) = 'uncategorized') then
    raise exception 'Choose a category before approval';
  end if;
  if p_kind is null or p_kind not in ('income', 'expense', 'transfer') then
    raise exception 'Invalid kind';
  end if;
  select * into cur from public.transactions
    where id = p_id and owner_id = auth.uid() and not voided for update;
  if not found then raise exception 'Transaction not found'; end if;
  cls := coalesce(p_classification, cur.classification);
  tax := coalesce(p_tax_deductible, cur.tax_deductible);
  if cls not in ('business', 'personal', 'mixed', 'unclassified') then
    raise exception 'Invalid classification';
  end if;
  if p_approved and p_kind <> 'transfer' and cls = 'unclassified' then
    raise exception 'Choose business, personal or mixed before approval';
  end if;
  if tax and (p_kind <> 'expense' or cls not in ('business', 'mixed')) then
    raise exception 'Only business or mixed expenses can be flagged tax deductible';
  end if;
  update public.transactions
     set category = trim(p_category),
         kind = p_kind,
         review_status = case when p_approved then 'approved' else 'pending' end,
         classification = cls,
         tax_deductible = tax
   where id = p_id and owner_id = auth.uid();
end $$;

-- Project tagging. A null project clears the tag. The composite foreign key rejects
-- projects that belong to another owner.
create function public.tag_transaction(p_id uuid, p_project uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.transactions set project_id = p_project
   where id = p_id and owner_id = auth.uid() and not voided;
  if not found then raise exception 'Transaction not found'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Saved import templates (per account column mappings)
-- ---------------------------------------------------------------------------
create table public.import_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  account_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  source text not null check (source in ('Venmo', 'Square', 'Bank', 'Card', 'PayPal')),
  mapping jsonb not null check (
    jsonb_typeof(mapping) = 'object' and mapping ? 'date' and mapping ? 'description'
  ),
  unique (id, owner_id),
  foreign key (account_id, owner_id) references public.accounts (id, owner_id) on delete cascade
);
create unique index import_templates_owner_account_name
  on public.import_templates (owner_id, account_id, lower(name));

-- ---------------------------------------------------------------------------
-- 4. Assets
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null check (length(trim(name)) between 1 and 200),
  purchase_date date,
  cost_cents bigint not null default 0 check (cost_cents between 0 and 9007199254740991),
  vendor text,
  serial_number text,
  location text,
  depreciable boolean not null default false,
  classification text not null default 'business' check (classification in ('business', 'personal', 'mixed')),
  project_id uuid,
  transaction_id uuid,
  notes text,
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id),
  foreign key (transaction_id, owner_id) references public.transactions (id, owner_id)
);

-- ---------------------------------------------------------------------------
-- 5. Invoices: payments, dates, derived totals
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  add column issued_on date,
  add column paid_on date;
alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'sent', 'partially_paid', 'paid', 'void'));

-- Totals are derived from line items so they cannot drift.
create function public.sync_invoice_total() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  target uuid;
begin
  for target in
    select distinct x from unnest(array[
      case when tg_op <> 'INSERT' then old.invoice_id end,
      case when tg_op <> 'DELETE' then new.invoice_id end
    ]) as x where x is not null
  loop
    update public.invoices i
       set total_cents = coalesce((
         select round(sum(it.quantity * it.unit_price_cents))::bigint
           from public.invoice_items it
          where it.invoice_id = target and it.owner_id = i.owner_id
       ), 0)
     where i.id = target and i.owner_id = coalesce(new.owner_id, old.owner_id);
  end loop;
  return null;
end $$;
create trigger invoice_items_total
  after insert or update or delete on public.invoice_items
  for each row execute function public.sync_invoice_total();

create function public.record_invoice_payment(
  p_invoice uuid,
  p_amount_cents bigint,
  p_paid_on date default current_date
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  inv public.invoices%rowtype;
  paid bigint;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Payment must be greater than zero';
  end if;
  select * into inv from public.invoices
    where id = p_invoice and owner_id = auth.uid() for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status not in ('sent', 'partially_paid') then
    raise exception 'Only sent invoices can receive payments';
  end if;
  paid := inv.amount_paid_cents + p_amount_cents;
  update public.invoices
     set amount_paid_cents = paid,
         status = case when paid >= inv.total_cents then 'paid' else 'partially_paid' end,
         paid_on = case when paid >= inv.total_cents then coalesce(p_paid_on, current_date) else null end
   where id = p_invoice;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Subscriptions: link to an account, classify
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column category text,
  add column classification text not null default 'business'
    check (classification in ('business', 'personal', 'mixed')),
  add column account_id uuid,
  add foreign key (account_id, owner_id) references public.accounts (id, owner_id);

-- ---------------------------------------------------------------------------
-- 7. Indexes for owner-scoped reads and foreign keys
-- ---------------------------------------------------------------------------
create index clients_owner on public.clients (owner_id);
create index projects_owner on public.projects (owner_id);
create index projects_client on public.projects (client_id);
create index invoices_client on public.invoices (client_id);
create index invoices_project on public.invoices (project_id);
create index invoice_items_invoice on public.invoice_items (owner_id, invoice_id);
create index subscriptions_owner on public.subscriptions (owner_id);
create index import_batches_owner on public.import_batches (owner_id);
create index transactions_project on public.transactions (owner_id, project_id);
create index transactions_batch on public.transactions (import_batch_id);
create index assets_owner on public.assets (owner_id);
create index import_templates_account on public.import_templates (account_id);

-- ---------------------------------------------------------------------------
-- 8. RLS and grants for new tables
-- ---------------------------------------------------------------------------
alter table public.import_templates enable row level security;
create policy owner_access on public.import_templates for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.import_templates to authenticated;
revoke all on public.import_templates from anon;

alter table public.assets enable row level security;
create policy owner_access on public.assets for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.assets to authenticated;
revoke all on public.assets from anon;

-- ---------------------------------------------------------------------------
-- 9. Report views. security_invoker makes them run with the caller's RLS, so a view can
-- never show another owner's rows. They summarize reviewed USD activity only; they are
-- transaction summaries, not reconciled P&L, cash flow, or tax advice.
-- ---------------------------------------------------------------------------
create view public.monthly_report with (security_invoker = true) as
select
  t.owner_id,
  date_trunc('month', t.occurred_on)::date as month,
  t.classification,
  coalesce(sum(t.amount_cents) filter (where t.kind = 'income'), 0)::bigint as income_cents,
  coalesce(-sum(t.amount_cents) filter (where t.kind = 'expense'), 0)::bigint as expense_cents,
  coalesce(-sum(t.amount_cents) filter (where t.kind = 'expense' and t.tax_deductible), 0)::bigint
    as tax_flagged_cents,
  count(*)::bigint as transaction_count
from public.transactions t
where t.review_status = 'approved' and not t.voided and t.currency = 'USD' and t.kind <> 'transfer'
group by t.owner_id, date_trunc('month', t.occurred_on), t.classification;

create view public.project_pnl with (security_invoker = true) as
select
  p.owner_id,
  p.id as project_id,
  p.name,
  p.client_id,
  p.status,
  p.budget_cents,
  coalesce(tx.income_cents, 0)::bigint as income_cents,
  coalesce(tx.expense_cents, 0)::bigint as expense_cents,
  (coalesce(tx.income_cents, 0) - coalesce(tx.expense_cents, 0))::bigint as net_cents,
  coalesce(inv.invoiced_cents, 0)::bigint as invoiced_cents,
  coalesce(inv.paid_cents, 0)::bigint as paid_cents
from public.projects p
left join (
  select owner_id, project_id,
         sum(amount_cents) filter (where kind = 'income') as income_cents,
         -sum(amount_cents) filter (where kind = 'expense') as expense_cents
    from public.transactions
   where review_status = 'approved' and not voided and currency = 'USD'
     and kind <> 'transfer' and project_id is not null
   group by owner_id, project_id
) tx on tx.project_id = p.id and tx.owner_id = p.owner_id
left join (
  select owner_id, project_id,
         sum(total_cents) as invoiced_cents,
         sum(amount_paid_cents) as paid_cents
    from public.invoices
   where status <> 'void' and project_id is not null
   group by owner_id, project_id
) inv on inv.project_id = p.id and inv.owner_id = p.owner_id;

revoke all on public.monthly_report, public.project_pnl from anon;
grant select on public.monthly_report, public.project_pnl to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Function privileges (new functions are not callable by anon or the public role)
-- ---------------------------------------------------------------------------
revoke all on function
  public.review_transaction(uuid, text, text, boolean, text, boolean),
  public.tag_transaction(uuid, uuid),
  public.record_invoice_payment(uuid, bigint, date)
  from public, anon;
grant execute on function
  public.review_transaction(uuid, text, text, boolean, text, boolean),
  public.tag_transaction(uuid, uuid),
  public.record_invoice_payment(uuid, bigint, date)
  to authenticated;
revoke all on function public.sync_invoice_total() from public, anon, authenticated;

commit;
