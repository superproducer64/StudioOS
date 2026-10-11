-- Edit and delete of clients and projects: owners can fix their own rows, cannot touch another
-- owner's, and rows that other records still point at cannot be deleted. Synthetic fixtures only.
begin;
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000c901'), ('00000000-0000-0000-0000-00000000d901');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c901"}';
insert into public.clients (id, name) values
  ('00000000-0000-0000-0000-00000000c911', 'Acme Prodcutions'),
  ('00000000-0000-0000-0000-00000000c912', 'Unused client');
insert into public.projects (id, client_id, name) values
  ('00000000-0000-0000-0000-00000000c921', '00000000-0000-0000-0000-00000000c911', 'Pilot'),
  ('00000000-0000-0000-0000-00000000c922', null, 'Unused project');
-- Fix a typo on the owner's own rows.
update public.clients set name = 'Acme Productions', email = 'a@example.test' where id = '00000000-0000-0000-0000-00000000c911';
update public.projects set name = 'Pilot Episode', budget_cents = 500000 where id = '00000000-0000-0000-0000-00000000c921';
do $$ begin
  if (select name from public.clients where id = '00000000-0000-0000-0000-00000000c911') is distinct from 'Acme Productions' then
    raise exception 'Client rename did not stick';
  end if;
  if (select budget_cents from public.projects where id = '00000000-0000-0000-0000-00000000c921') is distinct from 500000 then
    raise exception 'Project edit did not stick';
  end if;
end $$;
-- A client that a project still uses cannot be deleted.
do $$ begin
  begin
    delete from public.clients where id = '00000000-0000-0000-0000-00000000c911';
    raise exception 'Deleting a client with a project should have failed';
  exception when foreign_key_violation then null;
  end;
end $$;
-- Unused rows delete fine.
delete from public.projects where id = '00000000-0000-0000-0000-00000000c922';
delete from public.clients where id = '00000000-0000-0000-0000-00000000c912';
do $$ begin
  if exists (select 1 from public.clients where id = '00000000-0000-0000-0000-00000000c912')
     or exists (select 1 from public.projects where id = '00000000-0000-0000-0000-00000000c922') then
    raise exception 'Unused rows were not deleted';
  end if;
end $$;
-- Another owner can neither see, edit nor delete these rows.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d901"}';
update public.clients set name = 'Hijacked' where id = '00000000-0000-0000-0000-00000000c911';
update public.projects set name = 'Hijacked' where id = '00000000-0000-0000-0000-00000000c921';
delete from public.projects where id = '00000000-0000-0000-0000-00000000c921';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000c901"}';
do $$ begin
  if (select name from public.clients where id = '00000000-0000-0000-0000-00000000c911') is distinct from 'Acme Productions' then
    raise exception 'Another owner edited this client';
  end if;
  if (select name from public.projects where id = '00000000-0000-0000-0000-00000000c921') is distinct from 'Pilot Episode' then
    raise exception 'Another owner edited or deleted this project';
  end if;
end $$;
reset role;
rollback;
select 'PASS: owners can edit and delete their own unused clients and projects, referenced rows are protected by foreign keys, other owners cannot edit or delete them. Fixtures rolled back.' as verification;
