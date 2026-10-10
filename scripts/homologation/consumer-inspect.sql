-- Read-only. Execute as operator; no change of RLS or grants.
select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename;
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename;
select conrelid::regclass,conname,pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.appointments'::regclass,'public.quote_requests'::regclass,'public.quote_versions'::regclass,'public.attachments'::regclass);
select routine_name,grantee,privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name like 'consumer_%' order by routine_name,grantee;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='consumer-private';
select policyname,roles,cmd,permissive,qual,with_check from pg_policies where schemaname='storage' and tablename='objects';
