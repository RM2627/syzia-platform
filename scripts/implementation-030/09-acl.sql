alter table private.billing_runtime enable row level security;
alter table private.billing_runtime force row level security;
-- Restrict every function introduced by this migration, including private legacy aliases.
do $$declare f record;begin
 for f in select p.oid,p.pronamespace::regnamespace::text as schema from pg_proc p where p.pronamespace in('public'::regnamespace,'private'::regnamespace)and not exists(select 1 from migration030_existing_functions x where x.oid=p.oid) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
 if f.schema='public'then execute format('grant execute on function %s to authenticated',f.oid::regprocedure);end if;
 end loop;
end;$$;
grant execute on function private.permission_allowed(uuid,text,uuid),private.consumer_owner(uuid),private.customer_owner(uuid),private.permission_manager(uuid) to authenticated;
drop function private.permission_wrap(text,text,text,boolean);
drop table migration030_existing_functions;
commit;
