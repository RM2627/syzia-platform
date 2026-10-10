-- Read-only metadata inspection, without personal records.
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'commercial_%';
select tablename,policyname,roles,cmd,qual from pg_policies where schemaname='public' and tablename like 'commercial_%';
select n.nspname,p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon_exec,has_function_privilege('authenticated',p.oid,'execute') authenticated_exec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'commercial_%';
select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename like 'commercial_%';
select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid in (select oid from pg_class where relname like 'commercial_%');
