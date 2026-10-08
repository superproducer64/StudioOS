begin;
create unique index accounts_owner_name on public.accounts(owner_id,lower(name));
create unique index rules_owner_pattern on public.category_rules(owner_id,pattern);
alter table public.import_batches drop constraint import_batches_status_check;
alter table public.import_batches add constraint import_batches_status_check check(status in ('pending','committed','failed','reversed'));
alter table public.import_batches add unique(id,account_id,owner_id);
alter table public.transactions drop constraint transactions_import_batch_id_owner_id_fkey;
alter table public.transactions add constraint transactions_import_account_fkey foreign key(import_batch_id,account_id,owner_id) references public.import_batches(id,account_id,owner_id);
alter table public.transactions add column voided boolean not null default false;
alter table public.transactions add constraint amount_safe check(amount_cents between -9007199254740991 and 9007199254740991);
create table public.transaction_audit(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,transaction_id uuid not null,created_at timestamptz not null default now(),action text not null,before_value jsonb,after_value jsonb);
alter table public.transaction_audit enable row level security;
create policy audit_read on public.transaction_audit for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.transaction_audit from anon,authenticated;
grant select on public.transaction_audit to authenticated;
create function public.capture_transaction_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.transaction_audit(owner_id,transaction_id,action,before_value,after_value) values(new.owner_id,new.id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function public.capture_transaction_audit() from public,anon,authenticated;
create trigger transaction_audit after insert or update on public.transactions for each row execute function public.capture_transaction_audit();
-- Owner access cannot be reassigned; deletes are replaced by reversible import exclusion.
revoke delete on public.transactions,public.import_batches from authenticated;
create function public.commit_import(p_account uuid,p_source text,p_filename text,p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid:=auth.uid(); batch uuid; record jsonb; inserted integer:=0; affected integer; account_currency text;
begin
 if owner is null then raise exception 'Sign in required'; end if;
 select currency into account_currency from public.accounts where id=p_account and owner_id=owner;
 if not found then raise exception 'Account not found'; end if;
 if p_source not in ('Venmo','Square','Bank','Card','PayPal') or p_source is null then raise exception 'Invalid source'; end if;
 if jsonb_typeof(p_rows)<>'array' or p_rows is null then raise exception 'Rows must be an array'; end if;
 if jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>5000 then raise exception 'Import must contain 1 to 5000 rows'; end if;
 insert into public.import_batches(owner_id,account_id,source,filename) values(owner,p_account,p_source,p_filename) returning id into batch;
 for record in select value from jsonb_array_elements(p_rows) loop
  if coalesce(record->>'currency','')<>account_currency then raise exception 'Currency does not match account'; end if;
  if coalesce(record->>'description','')='' or coalesce(record->>'dedupe_key','')='' then raise exception 'Missing description or identity'; end if;
  if coalesce(record->>'amount_cents','') !~ '^-?[0-9]+$' then raise exception 'Amount must be integer cents'; end if;
  insert into public.transactions(owner_id,account_id,import_batch_id,dedupe_key,occurred_on,description,amount_cents,currency,category,kind,matched_rule,raw)
  values(owner,p_account,batch,record->>'dedupe_key',(record->>'occurred_on')::date,record->>'description',(record->>'amount_cents')::bigint,record->>'currency',coalesce(record->>'category','Uncategorized'),record->>'kind',record->>'matched_rule',coalesce(record->'raw','{}'::jsonb))
  on conflict(owner_id,account_id,dedupe_key) do nothing;
  get diagnostics affected=row_count; inserted:=inserted+affected;
 end loop;
 update public.import_batches set status='committed',row_count=inserted where id=batch;
 return jsonb_build_object('batch_id',batch,'inserted',inserted,'skipped',jsonb_array_length(p_rows)-inserted);
end $$;
create function public.review_transaction(p_id uuid,p_category text,p_kind text,p_approved boolean) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if trim(coalesce(p_category,''))='' or (p_approved and lower(trim(p_category))='uncategorized') then raise exception 'Choose a category before approval'; end if;
 update public.transactions set category=trim(p_category),kind=p_kind,review_status=case when p_approved then 'approved' else 'pending' end where id=p_id and owner_id=auth.uid() and not voided;
 if not found then raise exception 'Transaction not found'; end if;
end $$;
create function public.set_import_reversed(p_batch uuid,p_reversed boolean) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 update public.import_batches set status=case when p_reversed then 'reversed' else 'committed' end where id=p_batch and owner_id=auth.uid();
 if not found then raise exception 'Import not found'; end if;
 update public.transactions set voided=p_reversed where import_batch_id=p_batch and owner_id=auth.uid();
end $$;
create function public.seed_finance_rules() returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into public.category_rules(owner_id,vendor,pattern,category,kind,priority) values
 (auth.uid(),'Square Banking','square banking','Transfers','transfer',100),
 (auth.uid(),'OpenAI','openai','AI tools','expense',50),
 (auth.uid(),'Anthropic','anthropic','AI tools','expense',50),
 (auth.uid(),'Gemini','gemini','AI tools','expense',50),
 (auth.uid(),'Apple','apple','Software & devices','expense',40),
 (auth.uid(),'Replit','replit','Software & hosting','expense',50),
 (auth.uid(),'Supabase','supabase','Software & hosting','expense',50),
 (auth.uid(),'GitHub','github','Software & hosting','expense',50),
 (auth.uid(),'Vercel','vercel','Software & hosting','expense',50),
 (auth.uid(),'FedEx Office','fedex office','Printing & office','expense',60)
 on conflict(owner_id,pattern) do nothing;
end $$;
revoke all on function public.commit_import(uuid,text,text,jsonb),public.review_transaction(uuid,text,text,boolean),public.set_import_reversed(uuid,boolean),public.seed_finance_rules() from public,anon;
grant execute on function public.commit_import(uuid,text,text,jsonb),public.review_transaction(uuid,text,text,boolean),public.set_import_reversed(uuid,boolean),public.seed_finance_rules() to authenticated;
commit;
