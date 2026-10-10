\set ON_ERROR_STOP on
\set VERBOSITY verbose
-- Same expected_revision as A. This must wait, then fail with SQLSTATE 40001.
begin;
\ir assert-test-dataset.sql
select pg_backend_pid() as session_b_pid;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'admin_uuid','is_anonymous',false)::text,true);
set local role authenticated;
select public.company_save(:'organization_uuid'::uuid,'settings',null,:'expected_revision'::integer,'{"legal_name":"Edição obsoleta fictícia B"}');
commit;
