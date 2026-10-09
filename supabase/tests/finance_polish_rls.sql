-- Migration 005 checks: account balances (opening balance and date, voided exclusion, currency
-- filter, unreviewed count), matching deposits to invoices (full, partial, every refusal), unmatching,
-- anon denial and cross-owner isolation. Synthetic fixtures only. Rolled back at the end.
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
  ('00000000-0000-0000-0000-00000000a505'), ('00000000-0000-0000-0000-00000000b505');
insert into public.accounts (id, owner_id, name, provider, account_type) values
  ('00000000-0000-0000-0000-00000000a605', '00000000-0000-0000-0000-00000000a505', 'Synthetic polish account', 'Bank', 'bank'),
  ('00000000-0000-0000-0000-00000000b605', '00000000-0000-0000-0000-00000000b505', 'Other owner account', 'Bank', 'bank');
insert into public.accounts (id, owner_id, name, provider, account_type, currency) values
  ('00000000-0000-0000-0000-00000000a606', '00000000-0000-0000-0000-00000000a505', 'Synthetic euro account', 'Bank', 'bank', 'EUR');
insert into public.clients (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000a705', '00000000-0000-0000-0000-00000000a505', 'Synthetic client A'),
  ('00000000-0000-0000-0000-00000000b705', '00000000-0000-0000-0000-00000000b505', 'Synthetic client B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a505","role":"authenticated"}', true);

do $$
declare
  acct constant uuid := '00000000-0000-0000-0000-00000000a605';
  cl constant uuid := '00000000-0000-0000-0000-00000000a705';
  inv1 constant uuid := '00000000-0000-0000-0000-0000000a5001';
  inv2 constant uuid := '00000000-0000-0000-0000-0000000a5002';
  invd constant uuid := '00000000-0000-0000-0000-0000000a5003';
  d_big uuid; d_part1 uuid; d_part2 uuid; d_exp uuid; d_old uuid; d_eur uuid;
  b record;
begin
  perform public.commit_import(acct, 'Bank', 'polish.csv', '[
    {"dedupe_key":"p-old","occurred_on":"2026-08-01","description":"Synthetic old deposit","amount_cents":10000,"currency":"USD","category":"Services","kind":"income"},
    {"dedupe_key":"p-big","occurred_on":"2026-10-02","description":"Synthetic full payment","amount_cents":100000,"currency":"USD","category":"Services","kind":"income"},
    {"dedupe_key":"p-p1","occurred_on":"2026-10-03","description":"Synthetic part 1","amount_cents":30000,"currency":"USD","category":"Services","kind":"income"},
    {"dedupe_key":"p-p2","occurred_on":"2026-10-04","description":"Synthetic part 2","amount_cents":70000,"currency":"USD","category":"Services","kind":"income"},
    {"dedupe_key":"p-exp","occurred_on":"2026-10-05","description":"Synthetic expense","amount_cents":-25000,"currency":"USD","category":"Software","kind":"expense"}
  ]'::jsonb);
  perform public.commit_import('00000000-0000-0000-0000-00000000a606', 'Bank', 'polish-eur.csv', '[
    {"dedupe_key":"p-eur","occurred_on":"2026-10-06","description":"Synthetic euro","amount_cents":99900,"currency":"EUR","category":"Services","kind":"income"}
  ]'::jsonb);
  select id into d_old from public.transactions where dedupe_key = 'p-old';
  select id into d_big from public.transactions where dedupe_key = 'p-big';
  select id into d_part1 from public.transactions where dedupe_key = 'p-p1';
  select id into d_part2 from public.transactions where dedupe_key = 'p-p2';
  select id into d_exp from public.transactions where dedupe_key = 'p-exp';
  select id into d_eur from public.transactions where dedupe_key = 'p-eur';

  -- Balances: no opening balance counts every transaction in the account (the euro account is separate).
  select * into b from public.account_balances where account_id = acct;
  if b.balance_cents <> 10000 + 100000 + 30000 + 70000 - 25000 or b.transaction_count <> 5 or b.unreviewed_count <> 5 then
    raise exception 'Plain balance wrong: % / % / %', b.balance_cents, b.transaction_count, b.unreviewed_count;
  end if;
  -- An opening balance as of a date counts only transactions on or after that date.
  update public.accounts set opening_balance_cents = 500000, opening_balance_on = '2026-10-01' where id = acct;
  select * into b from public.account_balances where account_id = acct;
  if b.balance_cents <> 500000 + 100000 + 30000 + 70000 - 25000 or b.transaction_count <> 4 then
    raise exception 'Opening balance wrong: % / %', b.balance_cents, b.transaction_count;
  end if;
  -- A negative opening balance (a card that owes money) works.
  update public.accounts set opening_balance_cents = -20000 where id = acct;
  if (select balance_cents from public.account_balances where account_id = acct) <> -20000 + 175000 then
    raise exception 'Negative opening balance wrong';
  end if;
  -- Reversing an import removes its transactions from the balance.
  perform public.set_import_reversed((select import_batch_id from public.transactions where id = d_exp), true);
  if (select transaction_count from public.account_balances where account_id = acct) <> 0 then
    raise exception 'Reversed import must leave the balance';
  end if;
  perform public.set_import_reversed((select import_batch_id from public.transactions where id = d_exp), false);

  -- Invoices: inv1 totals 1000.00 (sent), inv2 totals 500.00 (sent), invd stays draft.
  insert into public.invoices (id, client_id, invoice_number, status) values
    (inv1, cl, 'POL-1', 'draft'), (inv2, cl, 'POL-2', 'draft'), (invd, cl, 'POL-D', 'draft');
  insert into public.invoice_items (invoice_id, description, quantity, unit_price_cents) values
    (inv1, 'Work', 1, 100000), (inv2, 'Work', 1, 50000);
  update public.invoices set status = 'sent', issued_on = '2026-10-01' where id in (inv1, inv2);

  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', invd, d_big), 'Only sent invoices');
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', inv1, d_exp), 'Only incoming income');
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', inv1, d_eur), 'currencies differ');
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', inv2, d_big), 'larger than the invoice balance');
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', gen_random_uuid(), d_big), 'Invoice not found');
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', inv1, gen_random_uuid()), 'Transaction not found');

  -- Full payment.
  perform public.match_invoice_payment(inv1, d_big);
  if (select status from public.invoices where id = inv1) <> 'paid'
     or (select amount_paid_cents from public.invoices where id = inv1) <> 100000
     or (select paid_on from public.invoices where id = inv1) <> '2026-10-02'
     or (select invoice_id from public.transactions where id = d_big) <> inv1 then
    raise exception 'Full match did not pay the invoice and link the deposit';
  end if;
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', inv1, d_big), 'already matched');
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', inv2, d_big), 'already matched');

  -- Two partial deposits.
  perform public.match_invoice_payment(inv2, d_part1);
  if (select status from public.invoices where id = inv2) <> 'partially_paid'
     or (select amount_paid_cents from public.invoices where id = inv2) <> 30000 then
    raise exception 'Partial match wrong';
  end if;
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', inv2, d_part2), 'larger than the invoice balance');

  -- Unmatching steps the invoice back.
  perform public.unmatch_invoice_payment(d_part1);
  if (select status from public.invoices where id = inv2) <> 'sent'
     or (select amount_paid_cents from public.invoices where id = inv2) <> 0
     or (select invoice_id from public.transactions where id = d_part1) is not null then
    raise exception 'Unmatch did not restore the invoice';
  end if;
  perform public.unmatch_invoice_payment(d_big);
  -- Nothing is left paid, so the invoice goes back to sent.
  if (select status from public.invoices where id = inv1) <> 'sent' then raise exception 'Unmatch of a paid invoice wrong'; end if;
  if (select paid_on from public.invoices where id = inv1) is not null then raise exception 'paid_on must clear'; end if;
  perform public.t_expect(format('select public.unmatch_invoice_payment(%L)', d_big), 'not matched');
  perform public.t_expect(format('select public.unmatch_invoice_payment(%L)', gen_random_uuid()), 'Transaction not found');

  -- Rematch after unmatching, and a voided invoice cannot be unmatched.
  perform public.match_invoice_payment(inv1, d_big);
  update public.invoices set status = 'void' where id = inv1;
  perform public.t_expect(format('select public.unmatch_invoice_payment(%L)', d_big), 'void invoice');
  -- A reversed transaction cannot be matched.
  perform public.set_import_reversed((select import_batch_id from public.transactions where id = d_part2), true);
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', inv2, d_part2), 'was reversed');
  perform public.set_import_reversed((select import_batch_id from public.transactions where id = d_part2), false);
end $$;

-- Owner B sees none of A's data and cannot touch it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b505","role":"authenticated"}', true);
do $$
declare
  a_tx uuid;
begin
  if exists (select 1 from public.account_balances where name = 'Synthetic polish account') then
    raise exception 'Cross-owner balance leak';
  end if;
  if (select count(*) from public.account_balances) <> 1 then raise exception 'Owner B should see only their own account'; end if;
  perform public.t_expect(format('select public.match_invoice_payment(%L,%L)', '00000000-0000-0000-0000-0000000a5002', gen_random_uuid()), 'Invoice not found');
  perform public.t_expect(format('select public.unmatch_invoice_payment(%L)', gen_random_uuid()), 'Transaction not found');
end $$;

-- Anonymous callers are refused.
reset role;
set local role anon;
select public.t_expect('select * from public.account_balances', 'permission denied');
select public.t_expect($q$select public.match_invoice_payment(gen_random_uuid(), gen_random_uuid())$q$, 'permission denied');
select public.t_expect($q$select public.unmatch_invoice_payment(gen_random_uuid())$q$, 'permission denied');
reset role;
rollback;
select 'PASS: account balances (opening balance and date, negative balances, reversed imports, currency filter), deposit-to-invoice matching (full, partial, every refusal), unmatching, anon denial and cross-owner isolation. Fixtures rolled back.' as verification;
