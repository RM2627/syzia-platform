-- OPERATOR ONLY. Dedicated, empty test dataset; never run in production.
-- First: apply migrations, create and confirm six test users through Auth, bootstrap root.
-- Replace the six placeholders with Auth UUIDs. Do not insert rows into auth.users manually.
begin;
create temporary table fixture_users(label text primary key,id uuid unique) on commit drop;
insert into fixture_users values
 ('root','REPLACE_ROOT_UUID'),('adminA','REPLACE_ADMIN_A_UUID'),('adminB','REPLACE_ADMIN_B_UUID'),
 ('worker','REPLACE_WORKER_UUID'),('attendant','REPLACE_ATTENDANT_UUID'),('unlinked','REPLACE_UNLINKED_UUID');
do $$
begin
 if (select count(*) from auth.users)<>6 or (select count(*) from public.profiles)<>6
 or exists(select 1 from public.organizations) or exists(select 1 from public.organization_members)
 or exists(select 1 from public.attendant_organizations) then raise exception 'expected_empty_dedicated_test_dataset'; end if;
 if (select count(*) from fixture_users f join auth.users u on u.id=f.id join public.profiles p on p.id=f.id
 where u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and p.status='active' and (u.banned_until is null or u.banned_until<=now()))<>6 then raise exception 'six_confirmed_active_test_accounts_required'; end if;
 if not exists(select 1 from public.platform_roles where user_id=(select id from fixture_users where label='root') and role='super_admin' and active)
 or (select count(*) from public.platform_roles where role='super_admin' and active)<>1 then raise exception 'bootstrap_root_first'; end if;
end $$;
-- Fixed fixture IDs deliberately collide rather than silently attach to existing companies.
insert into public.organizations(id,name,slug) values
 ('10000000-0000-0000-0000-000000000001','HOMOLOGAÇÃO A','homologacao-fundacao-a'),
 ('10000000-0000-0000-0000-000000000002','HOMOLOGAÇÃO B','homologacao-fundacao-b');
insert into public.organization_members(organization_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000001',(select id from fixture_users where label='adminA'),'admin_empresa'),
 ('10000000-0000-0000-0000-000000000002',(select id from fixture_users where label='adminB'),'admin_empresa'),
 ('10000000-0000-0000-0000-000000000001',(select id from fixture_users where label='worker'),'colaborador_empresa');
insert into public.platform_roles(user_id,role) select id,'atendente' from fixture_users where label in ('attendant','unlinked');
-- 030: explicit fictitious shared-support contracts; absence of billing is not an entitlement.
do $$declare plan_ uuid=gen_random_uuid();version_ uuid=gen_random_uuid();o record;begin
 insert into public.billing_plans(id,name,description,active,available,position)values(plan_,'Plano de homologação fictício','Não é oferta comercial',true,false,99);
 insert into public.billing_plan_versions(id,plan_id,version,price_cents,interval_months,trial_days,human_support,commercial_followups)values(version_,plan_,1,100,1,0,true,true);
 for o in select id from public.organizations loop insert into public.billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end)values(o.id,version_,'active',now(),now()+interval '1 year');end loop;
 if to_regprocedure('public.access_verify_document(uuid,text,text,integer,uuid)')is not null then
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from fixture_users where label='adminA'),'is_anonymous',false)::text,true);
 perform public.access_verify_document('10000000-0000-0000-0000-000000000001','CPF','52998224725',0,gen_random_uuid());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from fixture_users where label='adminB'),'is_anonymous',false)::text,true);
 perform public.access_verify_document('10000000-0000-0000-0000-000000000002','CPF','12345678909',0,gen_random_uuid());
 perform set_config('request.jwt.claims','{}',true);
 end if;
end;$$;
insert into public.attendant_organizations(organization_id,user_id,kind) values
 ('10000000-0000-0000-0000-000000000001',(select id from fixture_users where label='attendant'),'primary');
commit;
