-- Requires root_uuid and attendant_uuid; use empty company B from the test fixture.
\set ON_ERROR_STOP on
begin;
\ir assert-test-dataset.sql
select pg_backend_pid() as primary_a_pid;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'root_uuid','is_anonymous',false)::text,true);
set local role authenticated;
select public.foundation_set_attendant('10000000-0000-0000-0000-000000000002',:'attendant_uuid'::uuid,'primary','active');
select pg_sleep(15);
commit;
