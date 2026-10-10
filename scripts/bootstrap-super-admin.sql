-- Run only with a trusted database-owner session, after migrations.
-- psql: psql "$DATABASE_URL" -v admin_user_id='CONFIRMED-USER-UUID' -f scripts/bootstrap-super-admin.sql
-- Do not put DATABASE_URL or privileged keys into frontend variables.
begin;
select set_config('foundation.bootstrap_user', :'admin_user_id', true);
select pg_advisory_xact_lock(734921501);
do $$
declare target uuid=current_setting('foundation.bootstrap_user')::uuid;
begin
 if exists(select 1 from public.platform_roles where role='super_admin' and active) then
  raise exception 'bootstrap_already_completed';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=target and p.status='active' and u.email_confirmed_at is not null
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())) then
  raise exception 'confirmed_active_user_required';
 end if;
 insert into public.platform_roles(user_id,role) values(target,'super_admin');
end $$;
commit;
