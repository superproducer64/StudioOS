-- Migration 003 checks: classification and tax-flag rules, project tagging, report views, invoice
-- totals and payments, import templates, assets, subscriptions, anon denial and cross-owner
-- isolation. Synthetic fixtures only (no emails, passwords or real data). Rolled back at the end.
begin;
create function public.t_expect(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_msg || '%' then return; end if;
    raise exception 'Expected error containing "%" but got "%"', p_msg, sqlerrm;
  end;
  raise exception 'Expected error containing "%" but the statement succeeded: %', p_msg, p_sql;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000a501'), ('00000000-0000-0000-0000-00000000b501');
insert into public.accounts (id, owner_id, name, provider, account_type) values
  ('00000000-0000-0000-0000-00000000a601', '00000000-0000-0000-0000-00000000a501', 'Synthetic v02 account', 'Bank', 'bank'),
  ('00000000-0000-0000-0000-00000000b601', '00000000-0000-0000-0000-00000000b501', 'Other owner account', 'Bank', 'bank');
insert into public.clients (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000a701', '00000000-0000-0000-0000-00000000a501', 'Synthetic client A'),
  ('00000000-0000-0000-0000-00000000b701', '00000000-0000-0000-0000-00000000b501', 'Synthetic client B');
insert into public.projects (id, owner_id, client_id, name, budget_cents) values
  ('00000000-0000-0000-0000-00000000a801', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000a701', 'Project A1', 500000),
  ('00000000-0000-0000-0000-00000000a802', '00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-00000000a701', 'Project A2', 0),
  ('00000000-0000-0000-0000-00000000b801', '00000000-0000-0000-0000-00000000b501', '00000000-0000-0000-0000-00000000b701', 'Project B1', 0);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a501","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Owner A: classification, tax flag, tagging, report views
-- ---------------------------------------------------------------------------
do $$
declare
  acct constant uuid := '00000000-0000-0000-0000-00000000a601';
  a1 constant uuid := '00000000-0000-0000-0000-00000000a801';
  a2 constant uuid := '00000000-0000-0000-0000-00000000a802';
  b1 constant uuid := '00000000-0000-0000-0000-00000000b801';
  inc uuid; sw uuid; meal uuid; xfer uuid; nov uuid;
  v record;
begin
  perform public.commit_import(acct, 'Bank', 'v02.csv', '[
    {"dedupe_key":"v02-inc","occurred_on":"2026-10-03","description":"Synthetic client payment","amount_cents":100000,"currency":"USD","category":"Services","kind":"income"},
    {"dedupe_key":"v02-sw","occurred_on":"2026-10-04","description":"Synthetic software","amount_cents":-20000,"currency":"USD","category":"Software","kind":"expense"},
    {"dedupe_key":"v02-meal","occurred_on":"2026-10-05","description":"Synthetic meal","amount_cents":-5000,"currency":"USD","category":"Meals","kind":"expense"},
    {"dedupe_key":"v02-xfer","occurred_on":"2026-10-06","description":"Synthetic transfer","amount_cents":90000,"currency":"USD","category":"Transfers","kind":"transfer"},
    {"dedupe_key":"v02-nov","occurred_on":"2026-11-02","description":"Synthetic november","amount_cents":-1000,"currency":"USD","category":"Software","kind":"expense"}
  ]'::jsonb);
  select id into inc from public.transactions where dedupe_key = 'v02-inc';
  select id into sw from public.transactions where dedupe_key = 'v02-sw';
  select id into meal from public.transactions where dedupe_key = 'v02-meal';
  select id into xfer from public.transactions where dedupe_key = 'v02-xfer';
  select id into nov from public.transactions where dedupe_key = 'v02-nov';

  -- New transactions start unclassified and unflagged.
  if exists (select 1 from public.transactions where classification <> 'unclassified' or tax_deductible) then
    raise exception 'Imported rows must start unclassified and unflagged';
  end if;

  -- Approval needs a classification (except transfers).
  perform public.t_expect(format('select public.review_transaction(%L,%L,%L,true)', sw, 'Software', 'expense'),
    'Choose business, personal or mixed before approval');
  perform public.t_expect(format('select public.review_transaction(%L,%L,%L,true,%L)', sw, 'Software', 'expense', 'bogus'),
    'Invalid classification');
  perform public.t_expect(format('select public.review_transaction(%L,%L,%L,false)', inc, 'Services', 'bogus'),
    'Invalid kind');

  -- Tax flag only on business/mixed expenses.
  perform public.t_expect(format('select public.review_transaction(%L,%L,%L,true,%L,true)', inc, 'Services', 'income', 'business'),
    'Only business or mixed expenses');
  perform public.t_expect(format('select public.review_transaction(%L,%L,%L,true,%L,true)', meal, 'Meals', 'expense', 'personal'),
    'Only business or mixed expenses');
  perform public.t_expect(format('update public.transactions set tax_deductible = true where id = %L', inc),
    'tax_flag_only_business_expense');

  perform public.review_transaction(sw, 'Software', 'expense', true, 'business', true);
  perform public.review_transaction(inc, 'Services', 'income', true, 'business');
  perform public.review_transaction(meal, 'Meals', 'expense', true, 'personal');
  perform public.review_transaction(xfer, 'Transfers', 'transfer', true);
  -- The original four-argument call shape keeps working.
  perform public.review_transaction(nov, 'Software', 'expense', false);
  if not exists (select 1 from public.transactions where id = sw and classification = 'business'
                   and tax_deductible and review_status = 'approved') then
    raise exception 'Business expense flag not saved';
  end if;
  -- Omitted arguments leave stored values alone.
  perform public.review_transaction(sw, 'Software', 'expense', true);
  if not exists (select 1 from public.transactions where id = sw and classification = 'business' and tax_deductible) then
    raise exception 'Omitted classification arguments changed stored values';
  end if;
  -- Changing a flagged expense to a transfer requires clearing the flag explicitly.
  perform public.t_expect(format('select public.review_transaction(%L,%L,%L,false)', sw, 'Transfers', 'transfer'),
    'Only business or mixed expenses');

  -- Project tagging.
  perform public.tag_transaction(sw, a1);
  perform public.tag_transaction(inc, a1);
  perform public.tag_transaction(meal, a2);
  perform public.tag_transaction(meal, null);
  if (select project_id from public.transactions where id = meal) is not null then
    raise exception 'Clearing a project tag failed';
  end if;
  perform public.t_expect(format('select public.tag_transaction(%L,%L)', sw, b1), 'violates foreign key constraint');
  perform public.t_expect(format('select public.tag_transaction(%L,%L)', gen_random_uuid(), a1), 'Transaction not found');

  -- Monthly report: reviewed USD non-transfer activity by classification.
  select income_cents, expense_cents, tax_flagged_cents, transaction_count into v
    from public.monthly_report where month = date '2026-10-01' and classification = 'business';
  if v.income_cents <> 100000 or v.expense_cents <> 20000 or v.tax_flagged_cents <> 20000 or v.transaction_count <> 2 then
    raise exception 'Business monthly totals wrong: %', to_jsonb(v);
  end if;
  select income_cents, expense_cents, tax_flagged_cents, transaction_count into v
    from public.monthly_report where month = date '2026-10-01' and classification = 'personal';
  if v.income_cents <> 0 or v.expense_cents <> 5000 or v.tax_flagged_cents <> 0 or v.transaction_count <> 1 then
    raise exception 'Personal monthly totals wrong: %', to_jsonb(v);
  end if;
  if exists (select 1 from public.monthly_report where classification = 'unclassified')
     or exists (select 1 from public.monthly_report where month = date '2026-11-01') then
    raise exception 'Transfers and pending rows must not appear in the monthly report';
  end if;

  -- Project P&L.
  select income_cents, expense_cents, net_cents, invoiced_cents into v from public.project_pnl where project_id = a1;
  if v.income_cents <> 100000 or v.expense_cents <> 20000 or v.net_cents <> 80000 or v.invoiced_cents <> 0 then
    raise exception 'Project A1 P&L wrong: %', to_jsonb(v);
  end if;
  select income_cents, expense_cents, net_cents into v from public.project_pnl where project_id = a2;
  if v.income_cents <> 0 or v.expense_cents <> 0 or v.net_cents <> 0 then
    raise exception 'Untagged activity must not appear in Project A2: %', to_jsonb(v);
  end if;
  if exists (select 1 from public.project_pnl where project_id = b1) then
    raise exception 'Project P&L leaked another owner''s project';
  end if;

  -- Reversing the import removes its rows from the reports.
  perform public.set_import_reversed((select id from public.import_batches where filename = 'v02.csv'), true);
  if exists (select 1 from public.monthly_report) then
    raise exception 'Reversed import still appears in the monthly report';
  end if;
  perform public.set_import_reversed((select id from public.import_batches where filename = 'v02.csv'), false);
end $$;

-- ---------------------------------------------------------------------------
-- Owner A: invoices (derived totals, payments), templates, assets, subscriptions
-- ---------------------------------------------------------------------------
do $$
declare
  acct constant uuid := '00000000-0000-0000-0000-00000000a601';
  cl constant uuid := '00000000-0000-0000-0000-00000000a701';
  a1 constant uuid := '00000000-0000-0000-0000-00000000a801';
  b1 constant uuid := '00000000-0000-0000-0000-00000000b801';
  cb constant uuid := '00000000-0000-0000-0000-00000000b701';
  ab constant uuid := '00000000-0000-0000-0000-00000000b601';
  inv1 constant uuid := '00000000-0000-0000-0000-0000000a1001';
  inv2 constant uuid := '00000000-0000-0000-0000-0000000a1002';
  invv constant uuid := '00000000-0000-0000-0000-0000000a1003';
  it1 constant uuid := '00000000-0000-0000-0000-0000000a2001';
  it2 constant uuid := '00000000-0000-0000-0000-0000000a2002';
  it3 constant uuid := '00000000-0000-0000-0000-0000000a2003';
  v record;
  sw uuid;
begin
  insert into public.invoices (id, client_id, project_id, invoice_number, status, due_date)
    values (inv1, cl, a1, 'INV-V02-1', 'sent', '2026-11-01'),
           (inv2, cl, a1, 'INV-V02-2', 'draft', null),
           (invv, cl, a1, 'INV-V02-VOID', 'void', null);
  insert into public.invoice_items (id, invoice_id, description, quantity, unit_price_cents) values
    (it1, inv1, 'Design', 2, 15000), (it2, inv1, 'Print', 1, 5050);
  if (select total_cents from public.invoices where id = inv1) <> 35050 then
    raise exception 'Invoice total not derived from items';
  end if;
  update public.invoice_items set quantity = 3 where id = it1;
  if (select total_cents from public.invoices where id = inv1) <> 50050 then raise exception 'Total did not follow item update'; end if;
  delete from public.invoice_items where id = it2;
  if (select total_cents from public.invoices where id = inv1) <> 45000 then raise exception 'Total did not follow item delete'; end if;
  -- Moving an item recomputes both invoices.
  update public.invoice_items set invoice_id = inv2 where id = it1;
  if (select total_cents from public.invoices where id = inv1) <> 0
     or (select total_cents from public.invoices where id = inv2) <> 45000 then
    raise exception 'Moving an item must recompute both invoices';
  end if;
  update public.invoice_items set invoice_id = inv1 where id = it1;
  delete from public.invoice_items where invoice_id = inv2;
  -- Fractional quantities round to the nearest cent.
  insert into public.invoice_items (id, invoice_id, description, quantity, unit_price_cents)
    values (it3, inv2, 'Fractional', 1.5, 333);
  if (select total_cents from public.invoices where id = inv2) <> 500 then raise exception 'Fractional rounding wrong'; end if;
  delete from public.invoice_items where id = it3;
  insert into public.invoice_items (invoice_id, description, quantity, unit_price_cents) values (invv, 'Voided work', 1, 99999);

  -- Payments.
  perform public.t_expect(format('select public.record_invoice_payment(%L,100)', inv2), 'Only sent invoices can receive payments');
  perform public.t_expect(format('select public.record_invoice_payment(%L,0)', inv1), 'Payment must be greater than zero');
  perform public.record_invoice_payment(inv1, 10000, date '2026-10-10');
  select status, amount_paid_cents, paid_on into v from public.invoices where id = inv1;
  if v.status <> 'partially_paid' or v.amount_paid_cents <> 10000 or v.paid_on is not null then
    raise exception 'Partial payment wrong: %', to_jsonb(v);
  end if;
  perform public.record_invoice_payment(inv1, 35000, date '2026-10-20');
  select status, amount_paid_cents, paid_on into v from public.invoices where id = inv1;
  if v.status <> 'paid' or v.amount_paid_cents <> 45000 or v.paid_on <> date '2026-10-20' then
    raise exception 'Final payment wrong: %', to_jsonb(v);
  end if;
  perform public.t_expect(format('select public.record_invoice_payment(%L,100)', inv1), 'Only sent invoices can receive payments');
  perform public.t_expect(format('update public.invoices set status = %L where id = %L', 'overdue', inv1), 'invoices_status_check');

  -- Project P&L invoiced totals exclude void invoices.
  select invoiced_cents, paid_cents into v from public.project_pnl where project_id = a1;
  if v.invoiced_cents <> 45000 or v.paid_cents <> 45000 then raise exception 'Invoiced totals wrong: %', to_jsonb(v); end if;

  -- Cross-owner links are rejected.
  perform public.t_expect(format('insert into public.invoices (client_id, invoice_number) values (%L, %L)', cb, 'INV-X'),
    'violates foreign key constraint');
  perform public.t_expect(format('insert into public.invoices (client_id, project_id, invoice_number) values (%L, %L, %L)', cl, b1, 'INV-Y'),
    'violates foreign key constraint');

  -- Import templates.
  insert into public.import_templates (account_id, name, source, mapping)
    values (acct, 'Square export', 'Square', '{"date":"Date","description":"Note","amount":"Amount"}');
  perform public.t_expect(format('insert into public.import_templates (account_id, name, source, mapping) values (%L, %L, %L, %L)',
    acct, 'SQUARE EXPORT', 'Square', '{"date":"Date","description":"Note"}'), 'duplicate key value violates unique constraint');
  perform public.t_expect(format('insert into public.import_templates (account_id, name, source, mapping) values (%L, %L, %L, %L)',
    acct, 'No description', 'Bank', '{"date":"Date"}'), 'violates check constraint');
  perform public.t_expect(format('insert into public.import_templates (account_id, name, source, mapping) values (%L, %L, %L, %L)',
    ab, 'Foreign account', 'Bank', '{"date":"Date","description":"Memo"}'), 'violates foreign key constraint');

  -- Assets.
  select id into sw from public.transactions where dedupe_key = 'v02-sw';
  insert into public.assets (name, purchase_date, cost_cents, project_id, transaction_id, depreciable)
    values ('Synthetic camera', '2026-10-04', 250000, a1, sw, true);
  perform public.t_expect(format('insert into public.assets (name, project_id) values (%L, %L)', 'Bad link', b1),
    'violates foreign key constraint');
  perform public.t_expect(format('insert into public.assets (name, cost_cents) values (%L, -1)', 'Negative'),
    'violates check constraint');

  -- Subscriptions.
  insert into public.subscriptions (vendor, amount_cents, cadence, account_id, category)
    values ('Synthetic hosting', 2500, 'monthly', acct, 'Software & hosting');
  perform public.t_expect(format('insert into public.subscriptions (vendor, amount_cents, cadence, account_id) values (%L, 100, %L, %L)',
    'Foreign account sub', 'monthly', ab), 'violates foreign key constraint');
end $$;

-- ---------------------------------------------------------------------------
-- Signed-out (anon) access is denied everywhere
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
do $$
begin
  perform public.t_expect('select * from public.monthly_report', 'permission denied');
  perform public.t_expect('select * from public.project_pnl', 'permission denied');
  perform public.t_expect('select * from public.assets', 'permission denied');
  perform public.t_expect('select * from public.import_templates', 'permission denied');
  perform public.t_expect('select public.tag_transaction(gen_random_uuid(), null)', 'permission denied');
  perform public.t_expect('select public.record_invoice_payment(gen_random_uuid(), 100)', 'permission denied');
  perform public.t_expect('select public.review_transaction(gen_random_uuid(), ''x'', ''expense'', false)', 'permission denied');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Owner B sees and changes nothing of owner A's data
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b501","role":"authenticated"}', true);
do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-00000000a801';
  inv1 constant uuid := '00000000-0000-0000-0000-0000000a1001';
  tx uuid;
begin
  if exists (select 1 from public.transactions) or exists (select 1 from public.assets)
     or exists (select 1 from public.import_templates) or exists (select 1 from public.invoices)
     or exists (select 1 from public.invoice_items) or exists (select 1 from public.subscriptions)
     or exists (select 1 from public.monthly_report) or exists (select 1 from public.project_pnl where project_id = a1) then
    raise exception 'Cross-owner data leak';
  end if;
  select id into tx from (select id from public.transactions limit 1) s;
  perform public.t_expect(format('select public.record_invoice_payment(%L,100)', inv1), 'Invoice not found');
  perform public.t_expect(format('select public.tag_transaction(%L,null)', gen_random_uuid()), 'Transaction not found');
  perform public.t_expect(format('select public.review_transaction(%L,%L,%L,false)', gen_random_uuid(), 'x', 'expense'), 'Transaction not found');
end $$;
reset role;
rollback;
select 'PASS: classification and tax-flag rules, approval guard, project tagging, monthly and project reports, derived invoice totals and payments, import templates, assets, subscriptions, anon denial, cross-owner foreign keys and isolation. Fixtures rolled back.' as verification;
