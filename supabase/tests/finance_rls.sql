-- Run in SQL Editor as postgres. Fixtures have no email/password and are rolled back.
begin;
insert into auth.users(id) values('00000000-0000-0000-0000-00000000a101'),('00000000-0000-0000-0000-00000000b101');
insert into public.accounts(id,owner_id,name,provider,account_type) values('00000000-0000-0000-0000-00000000a201','00000000-0000-0000-0000-00000000a101','Synthetic RLS account','Bank','bank');
insert into public.clients(id,owner_id,name) values('00000000-0000-0000-0000-00000000a301','00000000-0000-0000-0000-00000000a101','Synthetic client');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000a101","role":"authenticated"}',true);
do $$
declare result jsonb; duplicate jsonb; batch uuid; tx uuid; baseline integer; payload jsonb:='[{"dedupe_key":"fixture-1","occurred_on":"2026-10-01","description":"Synthetic OpenAI","amount_cents":-2000,"currency":"USD","category":"AI tools","kind":"expense"}]';
begin
 result:=public.commit_import('00000000-0000-0000-0000-00000000a201','Bank','synthetic.csv',payload);
 if (result->>'inserted')::int<>1 then raise exception 'Import failed'; end if;
 duplicate:=public.commit_import('00000000-0000-0000-0000-00000000a201','Bank','synthetic.csv',payload);
 if (duplicate->>'inserted')::int<>0 or (duplicate->>'skipped')::int<>1 then raise exception 'Deduplication failed'; end if;
 select count(*) into baseline from public.import_batches;
 begin
  perform public.commit_import('00000000-0000-0000-0000-00000000a201','Bank','invalid.csv','[{"dedupe_key":"must-rollback","occurred_on":"2026-10-01","description":"Synthetic","amount_cents":100,"currency":"USD","kind":"income"},{"dedupe_key":"invalid","occurred_on":"2026-10-01","description":"Synthetic","amount_cents":10,"currency":"EUR","kind":"income"}]');
  raise exception 'Expected currency failure';
 exception when others then if sqlerrm='Expected currency failure' then raise; end if; end;
 if (select count(*) from public.import_batches)<>baseline or exists(select 1 from public.transactions where dedupe_key='must-rollback') then raise exception 'Atomic rollback failed'; end if;
 batch:=(result->>'batch_id')::uuid;
 select id into tx from public.transactions where dedupe_key='fixture-1';
 perform public.review_transaction(tx,'AI tools','expense',true,'business');
 if not exists(select 1 from public.transactions where id=tx and review_status='approved') then raise exception 'Review failed'; end if;
 perform public.set_import_reversed(batch,true);
 if not exists(select 1 from public.transactions where id=tx and voided) then raise exception 'Reverse failed'; end if;
 perform public.set_import_reversed(batch,false);
 if not exists(select 1 from public.transactions where id=tx and not voided) then raise exception 'Restore failed'; end if;
 if (select count(*) from public.transaction_audit where transaction_id=tx)<>4 then raise exception 'Audit capture failed'; end if;
 perform public.seed_finance_rules();perform public.seed_finance_rules();
 if (select count(*) from public.category_rules)<>10 then raise exception 'Rule seed idempotency failed'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000b101","role":"authenticated"}',true);
do $$
begin
 if exists(select 1 from public.accounts) or exists(select 1 from public.transactions) or exists(select 1 from public.import_batches) or exists(select 1 from public.transaction_audit) or exists(select 1 from public.category_rules) then raise exception 'Cross-user data leak'; end if;
 begin
  perform public.commit_import('00000000-0000-0000-0000-00000000a201','Bank','forbidden.csv','[{"dedupe_key":"forbidden","currency":"USD"}]');
  raise exception 'Cross-user import accepted';
 exception when others then if sqlerrm<>'Account not found' then raise; end if; end;
 begin
  insert into public.projects(client_id,name) values('00000000-0000-0000-0000-00000000a301','Forbidden link');
  raise exception 'Cross-user foreign key accepted';
 exception when foreign_key_violation then null; end;
 begin
  insert into public.accounts(owner_id,name,provider,account_type) values('00000000-0000-0000-0000-00000000a101','Forbidden owner','Bank','bank');
  raise exception 'Cross-owner write accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.transaction_audit(owner_id,transaction_id,action) values(auth.uid(),gen_random_uuid(),'Forged');
  raise exception 'Audit forgery accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: import, dedupe, atomic rollback, review, reverse/restore, audit, rule seeds, cross-user isolation, foreign-key isolation and audit write denial. Fixtures rolled back.' as verification;
