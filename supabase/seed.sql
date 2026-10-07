-- Replace this UUID with an existing Supabase Auth user ID before running.
-- Seed belongs to that user. Never seed credentials or real financial data.
begin;
do $$
declare target_user uuid := '00000000-0000-0000-0000-000000000000';
begin
 if not exists (select 1 from auth.users where id=target_user) then raise exception 'Replace target_user with an existing Auth user UUID'; end if;
 insert into public.accounts(owner_id,name,provider,account_type) values(target_user,'Square Banking','Square','bank');
 insert into public.categories(owner_id,name,kind) values(target_user,'AI tools','expense'),(target_user,'Software & hosting','expense'),(target_user,'Software & devices','expense'),(target_user,'Printing & office','expense'),(target_user,'Transfers','transfer'),(target_user,'Client revenue','income');
 insert into public.category_rules(owner_id,vendor,pattern,category,kind,priority) values
 (target_user,'Square Banking','square banking','Transfers','transfer',100),
 (target_user,'OpenAI','openai','AI tools','expense',50),
 (target_user,'Anthropic','anthropic','AI tools','expense',50),
 (target_user,'Gemini','gemini','AI tools','expense',50),
 (target_user,'Apple','apple','Software & devices','expense',40),
 (target_user,'Replit','replit','Software & hosting','expense',50),
 (target_user,'Supabase','supabase','Software & hosting','expense',50),
 (target_user,'GitHub','github','Software & hosting','expense',50),
 (target_user,'Vercel','vercel','Software & hosting','expense',50),
 (target_user,'FedEx Office','fedex office','Printing & office','expense',60);
end $$;
commit;
