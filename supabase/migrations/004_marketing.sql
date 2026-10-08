-- 004 · Marketing module backend
-- Owner-scoped brand profiles, planned actions, and a draft review queue linked to clients.
-- The human approval workflow is enforced by the database, not only by the UI, so no client,
-- script, or future AI integration can publish or approve content without a signed-in reviewer.
-- Nothing here publishes content anywhere. Approval only records a human decision.
begin;

-- ---------------------------------------------------------------------------
-- Brand profiles (one per client, plus at most one "own brand" profile with no client)
-- ---------------------------------------------------------------------------
create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id uuid,
  name text not null check (length(trim(name)) between 1 and 200),
  website text check (website is null or (website ~* '^https?://' and length(website) <= 500)),
  audience text not null default '' check (length(audience) <= 5000),
  voice text not null default '' check (length(voice) <= 5000),
  services text not null default '' check (length(services) <= 5000),
  service_area text not null default '' check (length(service_area) <= 5000),
  notes text not null default '' check (length(notes) <= 5000),
  unique (id, owner_id),
  foreign key (client_id, owner_id) references public.clients (id, owner_id)
);
create unique index brand_profiles_owner_client
  on public.brand_profiles (owner_id, client_id) nulls not distinct;

-- ---------------------------------------------------------------------------
-- Planned actions ("priorities"). Starter and manual tasks are plain planning items. Anything
-- claiming to come from measured data must carry a source date and evidence.
-- ---------------------------------------------------------------------------
create table public.marketing_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  brand_profile_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  reason text not null default '' check (length(reason) <= 2000),
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  source text not null default 'manual'
    check (source in ('starter', 'manual', 'search_console', 'analytics', 'ai')),
  source_date date,
  evidence jsonb,
  completed_at timestamptz,
  unique (id, owner_id),
  foreign key (brand_profile_id, owner_id)
    references public.brand_profiles (id, owner_id) on delete cascade,
  constraint measured_actions_need_evidence check (
    source in ('starter', 'manual')
    or (source_date is not null and evidence is not null and jsonb_typeof(evidence) = 'object')
  ),
  constraint completed_matches_status check ((status = 'done') = (completed_at is not null))
);

-- ---------------------------------------------------------------------------
-- Draft review queue
-- ---------------------------------------------------------------------------
create table public.marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  brand_profile_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null check (length(trim(body)) between 1 and 50000),
  channel text not null default 'website'
    check (channel in ('website', 'blog', 'google_business', 'facebook', 'instagram', 'email', 'other')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'archived')),
  ai_generated boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  published_url text check (published_url is null or (published_url ~* '^https?://' and length(published_url) <= 500)),
  unique (id, owner_id),
  -- Restrict, not cascade: deleting a brand profile must not silently erase its content history.
  foreign key (brand_profile_id, owner_id) references public.brand_profiles (id, owner_id),
  constraint draft_has_no_decision check (status <> 'draft' or (approved_at is null and published_at is null)),
  constraint approved_has_decision check (status not in ('approved', 'published') or approved_at is not null),
  constraint published_has_time check (status <> 'published' or published_at is not null),
  constraint approved_not_published check (status <> 'approved' or published_at is null)
);

-- ---------------------------------------------------------------------------
-- Append-only audit trail (owners can read it, nobody can write it directly)
-- ---------------------------------------------------------------------------
create table public.marketing_audit (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  table_name text not null,
  record_id uuid not null,
  action text not null,
  before_value jsonb,
  after_value jsonb
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger brand_profiles_touch before update on public.brand_profiles
  for each row execute function public.touch_updated_at();

create function public.enforce_action_state() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger marketing_actions_state before insert or update on public.marketing_actions
  for each row execute function public.enforce_action_state();

create function public.enforce_draft_workflow() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  content_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New content must start as a draft';
    end if;
    return new;
  end if;

  if new.owner_id <> old.owner_id
     or new.brand_profile_id <> old.brand_profile_id
     or new.ai_generated <> old.ai_generated then
    raise exception 'Owner, brand profile and AI origin cannot be changed';
  end if;
  new.updated_at := now();

  -- The decision record is written only by the workflow below, never set directly.
  if new.status = old.status
     and (new.approved_at, new.approved_by, new.published_at)
         is distinct from (old.approved_at, old.approved_by, old.published_at) then
    raise exception 'Approval and publication records are managed by the workflow';
  end if;

  content_changed := (new.title, new.body, new.channel) is distinct from (old.title, old.body, old.channel);
  if content_changed then
    if old.status = 'published' then
      raise exception 'Published content is locked. Copy it into a new draft to revise it';
    elsif old.status = 'approved' then
      new.status := 'draft'; -- editing approved content withdraws the approval
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft'     and new.status in ('approved', 'archived'))
      or (old.status = 'approved'  and new.status in ('draft', 'published', 'archived'))
      or (old.status = 'published' and new.status = 'archived')
      or (old.status = 'archived'  and new.status = 'draft')
    ) then
      raise exception 'Cannot change status from % to %', old.status, new.status;
    end if;
    -- Start from the previous decision record, then apply this transition to it.
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.published_at := old.published_at;
    if new.status = 'approved' then
      if auth.uid() is null then
        raise exception 'Approval requires a signed-in reviewer';
      end if;
      new.approved_at := now();
      new.approved_by := auth.uid();
    elsif new.status = 'published' then
      new.published_at := now();
    elsif new.status = 'draft' then
      new.approved_at := null;
      new.approved_by := null;
      new.published_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger marketing_drafts_workflow before insert or update on public.marketing_drafts
  for each row execute function public.enforce_draft_workflow();

create function public.capture_marketing_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.marketing_audit (owner_id, table_name, record_id, action, before_value)
    values (old.owner_id, tg_table_name, old.id, tg_op, to_jsonb(old));
  else
    insert into public.marketing_audit (owner_id, table_name, record_id, action, before_value, after_value)
    values (new.owner_id, tg_table_name, new.id, tg_op,
            case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  end if;
  return null;
end $$;
create trigger brand_profiles_audit after insert or update or delete on public.brand_profiles
  for each row execute function public.capture_marketing_audit();
create trigger marketing_actions_audit after insert or update or delete on public.marketing_actions
  for each row execute function public.capture_marketing_audit();
create trigger marketing_drafts_audit after insert or update on public.marketing_drafts
  for each row execute function public.capture_marketing_audit();

-- ---------------------------------------------------------------------------
-- Starter planning tasks (idempotent). These are checklists, not measured findings.
-- ---------------------------------------------------------------------------
create function public.seed_marketing_starter_actions(p_profile uuid) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  n integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.brand_profiles where id = p_profile and owner_id = auth.uid()) then
    raise exception 'Brand profile not found';
  end if;
  insert into public.marketing_actions (owner_id, brand_profile_id, title, reason, source)
  select auth.uid(), p_profile, v.title, v.reason, 'starter'
    from (values
      ('Confirm the brand profile',
       'Check the audience, services, voice and service area before drafting any client content.'),
      ('Prepare the owner''s story for review',
       'Introduce the person behind the business. Add only details the owner confirms.'),
      ('Establish the search baseline',
       'Connect Search Console and Analytics, then choose actions using real clicks, impressions and leads.')
    ) as v (title, reason)
   where not exists (
     select 1 from public.marketing_actions a
      where a.brand_profile_id = p_profile and a.owner_id = auth.uid()
        and a.source = 'starter' and a.title = v.title
   );
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index brand_profiles_client on public.brand_profiles (client_id);
create index marketing_actions_profile on public.marketing_actions (owner_id, brand_profile_id, status);
create index marketing_drafts_profile on public.marketing_drafts (owner_id, brand_profile_id, status);
create index marketing_audit_record on public.marketing_audit (owner_id, record_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.brand_profiles enable row level security;
create policy owner_access on public.brand_profiles for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.brand_profiles to authenticated;
revoke all on public.brand_profiles from anon;

alter table public.marketing_actions enable row level security;
create policy owner_access on public.marketing_actions for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.marketing_actions to authenticated;
revoke all on public.marketing_actions from anon;

alter table public.marketing_drafts enable row level security;
create policy owner_access on public.marketing_drafts for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Supabase grants new tables to authenticated by default, so DELETE must be revoked explicitly.
-- Drafts are archived, never deleted.
revoke all on public.marketing_drafts from anon;
revoke delete on public.marketing_drafts from authenticated;
grant select, insert, update on public.marketing_drafts to authenticated;

alter table public.marketing_audit enable row level security;
create policy audit_read on public.marketing_audit for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.marketing_audit from anon, authenticated;
grant select on public.marketing_audit to authenticated;

revoke all on function
  public.touch_updated_at(),
  public.enforce_action_state(),
  public.enforce_draft_workflow(),
  public.capture_marketing_audit()
  from public, anon, authenticated;
revoke all on function public.seed_marketing_starter_actions(uuid) from public, anon;
grant execute on function public.seed_marketing_starter_actions(uuid) to authenticated;

commit;
