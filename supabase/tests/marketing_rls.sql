-- Migration 004 checks: brand profiles, planned actions, the draft approval workflow, audit trail,
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
  ('00000000-0000-0000-0000-00000000a901'), ('00000000-0000-0000-0000-00000000b901');
insert into public.clients (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000a911', '00000000-0000-0000-0000-00000000a901', 'Synthetic client A'),
  ('00000000-0000-0000-0000-00000000b911', '00000000-0000-0000-0000-00000000b901', 'Synthetic client B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a901","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Owner A: profiles and actions
-- ---------------------------------------------------------------------------
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000a901';
  b constant uuid := '00000000-0000-0000-0000-00000000b901';
  cl constant uuid := '00000000-0000-0000-0000-00000000a911';
  cb constant uuid := '00000000-0000-0000-0000-00000000b911';
  p constant uuid := '00000000-0000-0000-0000-00000000a921';
  p2 constant uuid := '00000000-0000-0000-0000-00000000a922';
  n integer;
  act uuid;
  v record;
begin
  insert into public.brand_profiles (id, client_id, name, website, services)
    values (p, cl, 'Synthetic Roofing Co', 'https://example.test', 'Roof repair');
  insert into public.brand_profiles (id, name) values (p2, 'Own brand');

  perform public.t_expect(format('insert into public.brand_profiles (name) values (%L)', 'Second own brand'),
    'duplicate key value violates unique constraint');
  perform public.t_expect(format('insert into public.brand_profiles (client_id, name) values (%L, %L)', cl, 'Same client twice'),
    'duplicate key value violates unique constraint');
  perform public.t_expect(format('insert into public.brand_profiles (client_id, name) values (%L, %L)', cb, 'Foreign client'),
    'violates foreign key constraint');
  perform public.t_expect(format('insert into public.brand_profiles (name, website) values (%L, %L)', 'Bad site', 'ftp://nope.test'),
    'violates check constraint');
  perform public.t_expect(format('insert into public.brand_profiles (name) values (%L)', '   '),
    'violates check constraint');

  -- Starter planning tasks are idempotent and never invented for other owners' profiles.
  if public.seed_marketing_starter_actions(p) <> 3 then raise exception 'Starter seed should add three tasks'; end if;
  if public.seed_marketing_starter_actions(p) <> 0 then raise exception 'Starter seed must be idempotent'; end if;
  if public.seed_marketing_starter_actions(p2) <> 3 then raise exception 'Starter seed should work per profile'; end if;
  perform public.t_expect(format('select public.seed_marketing_starter_actions(%L)', gen_random_uuid()), 'Brand profile not found');
  if exists (select 1 from public.marketing_actions where source = 'starter' and (evidence is not null or source_date is not null)) then
    raise exception 'Starter tasks must not claim measured evidence';
  end if;

  -- Measured recommendations need a source date and evidence.
  perform public.t_expect(format('insert into public.marketing_actions (brand_profile_id, title, source) values (%L, %L, %L)', p, 'Fix titles', 'search_console'),
    'measured_actions_need_evidence');
  perform public.t_expect(format('insert into public.marketing_actions (brand_profile_id, title, source, source_date, evidence) values (%L, %L, %L, %L, %L)',
    p, 'Fix titles', 'analytics', '2026-10-01', '"just text"'), 'measured_actions_need_evidence');
  insert into public.marketing_actions (brand_profile_id, title, source, source_date, evidence)
    values (p, 'Improve roof repair page', 'search_console', '2026-10-01', '{"query":"roof repair","impressions":120}')
    returning id into act;

  -- Completion timestamps are managed by the database.
  update public.marketing_actions set status = 'done' where id = act;
  if (select completed_at from public.marketing_actions where id = act) is null then raise exception 'Done must set completed_at'; end if;
  update public.marketing_actions set status = 'open' where id = act;
  if (select completed_at from public.marketing_actions where id = act) is not null then raise exception 'Reopening must clear completed_at'; end if;
  update public.marketing_actions set completed_at = now() where id = act;
  if (select completed_at from public.marketing_actions where id = act) is not null then raise exception 'completed_at must not be settable on open actions'; end if;
  perform public.t_expect(format('update public.marketing_actions set status = %L where id = %L', 'archived', act), 'violates check constraint');
end $$;

-- ---------------------------------------------------------------------------
-- Owner A: the draft approval workflow
-- ---------------------------------------------------------------------------
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000a901';
  b constant uuid := '00000000-0000-0000-0000-00000000b901';
  p constant uuid := '00000000-0000-0000-0000-00000000a921';
  p2 constant uuid := '00000000-0000-0000-0000-00000000a922';
  d constant uuid := '00000000-0000-0000-0000-00000000a931';
  v record;
begin
  perform public.t_expect(format('insert into public.marketing_drafts (brand_profile_id, title, body, status) values (%L, %L, %L, %L)', p, 'Sneaky', 'Body', 'approved'),
    'New content must start as a draft');
  perform public.t_expect(format('insert into public.marketing_drafts (brand_profile_id, title, body, status, ai_generated) values (%L, %L, %L, %L, true)', p, 'Sneaky AI', 'Body', 'published'),
    'New content must start as a draft');
  perform public.t_expect(format('insert into public.marketing_drafts (brand_profile_id, title, body) values (%L, %L, %L)', p, 'Empty', '  '),
    'violates check constraint');
  perform public.t_expect(format('insert into public.marketing_drafts (brand_profile_id, title, body, channel) values (%L, %L, %L, %L)', p, 'Odd', 'Body', 'tiktok'),
    'violates check constraint');

  insert into public.marketing_drafts (id, brand_profile_id, title, body, channel)
    values (d, p, 'Owner story', 'Synthetic story body', 'blog');
  select status, approved_at, approved_by, published_at, ai_generated into v from public.marketing_drafts where id = d;
  if v.status <> 'draft' or v.approved_at is not null or v.approved_by is not null or v.published_at is not null or v.ai_generated then
    raise exception 'New draft must be an unapproved human draft: %', to_jsonb(v);
  end if;

  -- Illegal shortcuts.
  perform public.t_expect(format('update public.marketing_drafts set status = %L where id = %L', 'published', d), 'Cannot change status from draft to published');
  perform public.t_expect(format('update public.marketing_drafts set approved_at = now() where id = %L', d), 'managed by the workflow');
  perform public.t_expect(format('update public.marketing_drafts set status = %L, approved_at = now() where id = %L', 'draft', d), 'managed by the workflow');

  -- Approve: the reviewer and time are recorded by the database.
  update public.marketing_drafts set status = 'approved' where id = d;
  select status, approved_at, approved_by into v from public.marketing_drafts where id = d;
  if v.status <> 'approved' or v.approved_at is null or v.approved_by <> a then raise exception 'Approval record wrong: %', to_jsonb(v); end if;
  perform public.t_expect(format('update public.marketing_drafts set approved_by = %L where id = %L', b, d), 'managed by the workflow');
  perform public.t_expect(format('update public.marketing_drafts set approved_at = null where id = %L', d), 'managed by the workflow');

  -- Editing approved content withdraws the approval.
  update public.marketing_drafts set body = 'Synthetic story body, revised' where id = d;
  select status, approved_at, approved_by into v from public.marketing_drafts where id = d;
  if v.status <> 'draft' or v.approved_at is not null or v.approved_by is not null then raise exception 'Edit must withdraw approval: %', to_jsonb(v); end if;
  -- A request that edits approved content while still sending status "approved" must not keep the approval.
  update public.marketing_drafts set status = 'approved' where id = d;
  update public.marketing_drafts set body = 'Synthetic story body, revised again', status = 'approved' where id = d;
  select status, approved_at, approved_by into v from public.marketing_drafts where id = d;
  if v.status <> 'draft' or v.approved_at is not null or v.approved_by is not null then
    raise exception 'Editing approved content must withdraw approval even if status is resent: %', to_jsonb(v);
  end if;

  -- Approve, then record manual publication.
  update public.marketing_drafts set status = 'approved' where id = d;
  update public.marketing_drafts set status = 'published', published_url = 'https://example.test/story' where id = d;
  select status, approved_at, approved_by, published_at, published_url into v from public.marketing_drafts where id = d;
  if v.status <> 'published' or v.approved_at is null or v.approved_by <> a or v.published_at is null then raise exception 'Publish record wrong: %', to_jsonb(v); end if;
  perform public.t_expect(format('update public.marketing_drafts set body = %L where id = %L', 'Changed after publishing', d), 'Published content is locked');
  perform public.t_expect(format('update public.marketing_drafts set status = %L where id = %L', 'approved', d), 'Cannot change status from published to approved');
  update public.marketing_drafts set published_url = 'https://example.test/story-2' where id = d; -- the URL can be corrected

  -- Archive keeps the history; restoring returns an unapproved draft.
  update public.marketing_drafts set status = 'archived' where id = d;
  select approved_at, published_at into v from public.marketing_drafts where id = d;
  if v.approved_at is null or v.published_at is null then raise exception 'Archiving must keep the decision history'; end if;
  update public.marketing_drafts set status = 'draft' where id = d;
  select approved_at, approved_by, published_at into v from public.marketing_drafts where id = d;
  if v.approved_at is not null or v.approved_by is not null or v.published_at is not null then raise exception 'Restoring must clear the decision record'; end if;

  -- Immutable fields and deletion rules.
  perform public.t_expect(format('update public.marketing_drafts set ai_generated = true where id = %L', d), 'cannot be changed');
  perform public.t_expect(format('update public.marketing_drafts set brand_profile_id = %L where id = %L', p2, d), 'cannot be changed');
  perform public.t_expect(format('delete from public.marketing_drafts where id = %L', d), 'permission denied');
  perform public.t_expect(format('delete from public.brand_profiles where id = %L', p), 'violates foreign key constraint');

  -- A profile with no drafts can be deleted, and its actions go with it.
  delete from public.brand_profiles where id = p2;
  if exists (select 1 from public.marketing_actions where brand_profile_id = p2) then raise exception 'Actions should cascade with their profile'; end if;

  -- Audit trail.
  if (select count(*) from public.marketing_audit where record_id = d and table_name = 'marketing_drafts') < 9 then
    raise exception 'Draft changes were not all audited';
  end if;
  if not exists (select 1 from public.marketing_audit where record_id = p2 and table_name = 'brand_profiles' and action = 'DELETE' and before_value is not null) then
    raise exception 'Profile deletion was not audited';
  end if;
  perform public.t_expect(format('insert into public.marketing_audit (owner_id, table_name, record_id, action) values (%L, %L, %L, %L)', a, 'marketing_drafts', d, 'Forged'), 'permission denied');
  perform public.t_expect('update public.marketing_audit set action = ''Edited''', 'permission denied');
  perform public.t_expect('delete from public.marketing_audit', 'permission denied');
end $$;

-- ---------------------------------------------------------------------------
-- No signed-in reviewer means no approval (for example, a server-side AI integration)
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{}', true);
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000a901';
  p constant uuid := '00000000-0000-0000-0000-00000000a921';
  ai constant uuid := '00000000-0000-0000-0000-00000000a932';
begin
  insert into public.marketing_drafts (id, owner_id, brand_profile_id, title, body, ai_generated)
    values (ai, a, p, 'Generated draft', 'Synthetic generated body', true);
  perform public.t_expect(format('update public.marketing_drafts set status = %L where id = %L', 'approved', ai), 'Approval requires a signed-in reviewer');
  perform public.t_expect(format('insert into public.marketing_drafts (owner_id, brand_profile_id, title, body, status, ai_generated) values (%L, %L, %L, %L, %L, true)', a, p, 'Self-approved', 'Body', 'approved'),
    'New content must start as a draft');
end $$;

-- ---------------------------------------------------------------------------
-- Signed-out (anon) access is denied
-- ---------------------------------------------------------------------------
set local role anon;
do $$
begin
  perform public.t_expect('select * from public.brand_profiles', 'permission denied');
  perform public.t_expect('select * from public.marketing_actions', 'permission denied');
  perform public.t_expect('select * from public.marketing_drafts', 'permission denied');
  perform public.t_expect('select * from public.marketing_audit', 'permission denied');
  perform public.t_expect('select public.seed_marketing_starter_actions(gen_random_uuid())', 'permission denied');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Owner B sees and changes nothing of owner A's marketing data
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b901","role":"authenticated"}', true);
do $$
declare
  p constant uuid := '00000000-0000-0000-0000-00000000a921';
  d constant uuid := '00000000-0000-0000-0000-00000000a931';
  bp uuid;
  n integer;
begin
  if exists (select 1 from public.brand_profiles) or exists (select 1 from public.marketing_actions)
     or exists (select 1 from public.marketing_drafts) or exists (select 1 from public.marketing_audit) then
    raise exception 'Cross-owner marketing data leak';
  end if;
  perform public.t_expect(format('insert into public.marketing_drafts (brand_profile_id, title, body) values (%L, %L, %L)', p, 'Into A''s profile', 'Body'),
    'violates foreign key constraint');
  perform public.t_expect(format('select public.seed_marketing_starter_actions(%L)', p), 'Brand profile not found');
  update public.marketing_drafts set title = 'Hijacked' where id = d;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Owner B changed owner A''s draft'; end if;
  delete from public.brand_profiles where id = p;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Owner B deleted owner A''s profile'; end if;

  -- B has a fully working, separate workspace.
  insert into public.brand_profiles (name) values ('B brand') returning id into bp;
  if public.seed_marketing_starter_actions(bp) <> 3 then raise exception 'B starter tasks missing'; end if;
  if (select count(*) from public.marketing_actions) <> 3 then raise exception 'B should see only B actions'; end if;
end $$;
reset role;
rollback;
select 'PASS: profiles, evidence-gated actions, draft approval workflow (reviewer recorded, edits withdraw approval, published content locked, decision record unforgeable), no approval without a signed-in reviewer, audit trail, anon denial and cross-owner isolation. Fixtures rolled back.' as verification;
