-- READ ONLY. Run after applying all 13 migrations in the dedicated test project.
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname;
select tablename,policyname,cmd,roles,qual from pg_policies where schemaname='public' order by tablename;
select p.oid::regprocedure,n.nspname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon_execute,has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'central_%' and n.nspname in ('private','public') order by 2,1;
select conrelid::regclass,conname,pg_get_constraintdef(oid) from pg_constraint where conrelid in ('tickets'::regclass,'ticket_messages'::regclass,'ticket_notes'::regclass,'ticket_events'::regclass,'ticket_escalations'::regclass,'central_quote_actions'::regclass,'work_sessions'::regclass,'appointments'::regclass) order by 1,2;
select indexname,indexdef from pg_indexes where schemaname='public' and (indexname like 'central_%' or tablename='appointments');
