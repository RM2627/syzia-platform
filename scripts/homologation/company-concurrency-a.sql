\set ON_ERROR_STOP on
-- Test-only dedicated DB. Parameters admin_uuid, organization_uuid, expected_revision from BEFORE either session.
begin;
\ir assert-test-dataset.sql
select pg_backend_pid() as session_a_pid;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'admin_uuid','is_anonymous',false)::text,true);
set local role authenticated;
select public.company_save(:'organization_uuid'::uuid,'settings',null,:'expected_revision'::integer,'{"legal_name":"Edição concorrente fictícia A"}');
-- Start session B while A holds the Foundation authorization lock.
select pg_sleep(15);
commit;
