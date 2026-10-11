-- Migration 006 checks: category uniqueness, income rules, seeding, anon denial and
-- cross-owner isolation. Synthetic fixtures only. Rolled back at the end.
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
grant execute on function public.t_expect(text, text) to authenticated, anon;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000a701'), ('00000000-0000-0000-0000-00000000b701');

-- Owner A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a701"}';
insert into public.category_rules (vendor, pattern, category, kind) values ('Acme', 'acme', 'Client payments', 'income');
insert into public.category_rules (vendor, pattern, category, kind) values ('Zed', 'zed', 'Custom thing', 'expense');
select public.seed_finance_categories();
select public.seed_finance_categories(); -- idempotent
do $$ begin
  if (select count(*) from public.categories) <> 21 then
    raise exception 'Expected 20 starter + 1 rule-derived category, got %', (select count(*) from public.categories);
  end if;
  if (select kind from public.categories where name = 'Custom thing') <> 'expense' then
    raise exception 'Rule-derived category should keep its rule kind';
  end if;
  if (select kind from public.categories where name = 'Client payments') <> 'income' then
    raise exception 'Client payments should be income';
  end if;
end $$;
select public.t_expect($q$insert into public.categories (name, kind) values ('client PAYMENTS', 'expense')$q$, 'duplicate key');
select public.t_expect($q$insert into public.categories (name, kind) values ('X', 'bogus')$q$, 'check constraint');
select public.t_expect($q$insert into public.category_rules (vendor, pattern, category, kind) values ('B', 'b', 'c', 'bogus')$q$, 'category_rules_kind_check');

-- Owner B sees none of A's categories and can reuse the same names.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b701"}';
do $$ begin
  if (select count(*) from public.categories) <> 0 then raise exception 'Owner B can see owner A categories'; end if;
end $$;
insert into public.categories (name, kind) values ('Client payments', 'income');
delete from public.categories where name = 'Interest'; -- not B's row: no-op
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a701"}';
do $$ begin
  if (select count(*) from public.categories where name = 'Interest') <> 1 then raise exception 'Owner B deleted owner A category'; end if;
end $$;

-- Anon is denied.
reset role;
set local role anon;
select public.t_expect('select * from public.categories', 'permission denied');
select public.t_expect('select public.seed_finance_categories()', 'permission denied');
rollback;
select 'PASS: category uniqueness, income rules, idempotent seeding (starter list plus rule-derived categories), invalid kinds rejected, anon denial and cross-owner isolation. Fixtures rolled back.' as verification;
