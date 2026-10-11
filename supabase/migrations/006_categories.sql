-- 006: a managed list of income / expense / transfer categories, and income rules.
-- Categories are a convenience list the UI offers on Rules and Review. Rules and transactions
-- still store the category name as text, so deleting a category never rewrites history.

-- One name, one kind, per owner (case-insensitive).
create unique index categories_owner_name on public.categories (owner_id, lower(name));

-- Rules may now tag income as well as expenses and transfers.
alter table public.category_rules drop constraint category_rules_kind_check;
alter table public.category_rules
  add constraint category_rules_kind_check check (kind in ('income', 'expense', 'transfer'));

-- Adds a starter list plus every category already used by the caller's rules and transactions.
-- Safe to run repeatedly; never changes or removes existing categories.
create function public.seed_finance_categories() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  insert into public.categories (owner_id, name, kind) values
    (auth.uid(), 'Client payments', 'income'),
    (auth.uid(), 'Production income', 'income'),
    (auth.uid(), 'Royalties & residuals', 'income'),
    (auth.uid(), 'Grants & incentives', 'income'),
    (auth.uid(), 'Interest', 'income'),
    (auth.uid(), 'Other income', 'income'),
    (auth.uid(), 'AI tools', 'expense'),
    (auth.uid(), 'Software & hosting', 'expense'),
    (auth.uid(), 'Software & devices', 'expense'),
    (auth.uid(), 'Printing & office', 'expense'),
    (auth.uid(), 'Equipment & rentals', 'expense'),
    (auth.uid(), 'Crew & talent', 'expense'),
    (auth.uid(), 'Locations & permits', 'expense'),
    (auth.uid(), 'Travel', 'expense'),
    (auth.uid(), 'Meals', 'expense'),
    (auth.uid(), 'Insurance', 'expense'),
    (auth.uid(), 'Marketing & ads', 'expense'),
    (auth.uid(), 'Professional fees', 'expense'),
    (auth.uid(), 'Bank & processing fees', 'expense'),
    (auth.uid(), 'Transfers', 'transfer')
  on conflict do nothing;
  -- Categories your rules already use (first kind wins if a name is used with two kinds).
  insert into public.categories (owner_id, name, kind)
  select distinct on (lower(category)) auth.uid(), category, kind
    from public.category_rules
   where owner_id = auth.uid() and trim(category) <> ''
   order by lower(category), priority desc
  on conflict do nothing;
end $$;
revoke all on function public.seed_finance_categories() from public, anon;
grant execute on function public.seed_finance_categories() to authenticated;
