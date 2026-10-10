-- psql only. Operator supplies actor_uuid and target_uuid for TWO TEMPORARY test admins.
-- The original root account must never be either target. See guide before executing.
\set ON_ERROR_STOP on
begin;
\ir assert-test-dataset.sql
select set_config('foundation.test_actor', :'actor_uuid', true);
select set_config('foundation.test_target', :'target_uuid', true);
do $$
begin
 if current_setting('foundation.test_actor')=current_setting('foundation.test_target')
 or not exists(select 1 from public.organization_members where user_id=current_setting('foundation.test_actor')::uuid and role='admin_empresa' and status='active')
 or not exists(select 1 from public.organization_members where user_id=current_setting('foundation.test_target')::uuid and role='admin_empresa' and status='active')
 then raise exception 'use_only_two_fixture_company_admins'; end if;
end $$;
select pg_backend_pid() as session_a_pid;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'actor_uuid','is_anonymous',false)::text,true);
set local role authenticated;
select public.foundation_set_global_role(:'target_uuid'::uuid,'super_admin',false);
-- Launch session B now, while A holds the authorization lock.
select pg_sleep(15);
commit;
