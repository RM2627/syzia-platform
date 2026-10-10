from pathlib import Path
root=Path(__file__).resolve().parents[2];base=root/'reports/syzia-042/baseline-functions';parts=['-- SYZIA 042: incremental upgrade over 041. No reset.\nbegin;\n']
def emit(s):parts.append(s.rstrip().rstrip(';')+';\n')
def src(n):return(base/(n+'.sql')).read_text()
def patch(n,pairs):
 s=src(n)
 for a,b in pairs:
  assert a in s,(n,a[:120]);s=s.replace(a,b)
 emit(s)
for f in ['schema','identity']:emit((root/f'scripts/syzia-042/{f}.sql').read_text())
patch('private.permission_role',[(" select case when role='admin_empresa'", " if private.syzia_identity(p_user)then return case when private.entitlement(p_org,'human_support')and exists(select 1 from public.attendant_organizations a join public.platform_roles p on p.user_id=a.user_id and p.role='atendente'and p.active where a.organization_id=p_org and a.user_id=p_user and a.status='active')then 'shared_attendant'end;end if;\n select case when role='admin_empresa'")])
patch('public.access_team_026',[("where a.organization_id=p_org)","where a.organization_id=p_org and not private.syzia_identity(a.user_id))"),("where m.organization_id=p_org and not exists", "where m.organization_id=p_org and not private.syzia_identity(m.user_id) and not exists")])
for n in ['public.access_reset','public.access_finish_provision','public.access_delivery_prepare']:
 patch(n,[("select * into a from private.enterprise_accounts where id=p_id for update;", "select * into a from private.enterprise_accounts where id=p_id for update;perform private.syzia_identity_guard(a.user_id,p_actor);")])
for n in ['public.access_manage','public.access_resume']:
 patch(n,[("select * into a from private.enterprise_accounts where id=p_id for update;", "select * into a from private.enterprise_accounts where id=p_id for update;perform private.syzia_identity_guard(a.user_id,auth.uid());")])
patch('public.access_reserve',[("AS $function$begin", "AS $function$begin if private.syzia_identity(p_existing)then raise exception 'platform_staff_requires_assignment'using errcode='42501';end if;")])
for n in ['public.foundation_set_member','public.operations_set_attendant']:
 patch(n,[("begin org_=p_org;", "begin perform private.syzia_identity_guard(p_user,auth.uid());org_=p_org;")])
patch('public.permissions_team',[("where organization_id=p_org and status='active'\n union all", "where organization_id=p_org and status='active'and not private.syzia_identity(user_id)\n union all")])
# Published configuration and the existing generic service editor.
s=src('private.v030_company_save')
for a,b in [("'photo_instructions']","'photo_instructions','execution_mode','execution_max_periods','price_max_cents']"),('photo_instructions) select','photo_instructions,execution_mode,execution_max_periods,price_max_cents) select'),("coalesce(r.photo_instructions,'') from","coalesce(r.photo_instructions,''),coalesce(r.execution_mode,'continuous'),r.execution_max_periods,r.price_max_cents from"),("photo_instructions=coalesce(r.photo_instructions,'') from","photo_instructions=coalesce(r.photo_instructions,''),execution_mode=coalesce(r.execution_mode,'continuous'),execution_max_periods=r.execution_max_periods,price_max_cents=r.price_max_cents from")]:
 if a not in s and 'photo_instructions='not in a:raise Exception(a)
 s=s.replace(a,b)
# Previous generic replacement must not leave unlabelled update assignments.
s=s.replace("photo_instructions=coalesce(r.photo_instructions,''),coalesce(r.execution_mode,'continuous'),r.execution_max_periods,r.price_max_cents from","photo_instructions=coalesce(r.photo_instructions,''),execution_mode=coalesce(r.execution_mode,'continuous'),execution_max_periods=r.execution_max_periods,price_max_cents=r.price_max_cents from")
emit(s)
for n in ['private.presence_payload','private.v029_consumer_publish_page']:
 patch(n,[("'photo_policy',coalesce", "'execution_mode',coalesce(s->>'execution_mode','continuous'),'execution_max_periods',s->'execution_max_periods','price_max_cents',case when p_show_prices then s->'price_max_cents' else 'null'::jsonb end,'photo_policy',coalesce")])
emit(src('private.consumer_slot_allowed').replace('private.consumer_slot_allowed(', 'private.execution_slot_allowed(').replace('p_ignore uuid DEFAULT NULL::uuid',"p_ignore uuid[] DEFAULT '{}'::uuid[]").replace('a.id is distinct from p_ignore',"not(a.id=any(coalesce(p_ignore,'{}'::uuid[])))"))
for f in ['home','execution','quotes']:
 p=root/f'scripts/syzia-042/{f}.sql'
 if p.exists():emit(p.read_text())
# Additional patches are kept explicit so the exact 041 definitions remain auditable.
p=root/'scripts/syzia-042/patches.py'
if p.exists():exec(p.read_text())
emit("do $$declare r record;begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'and(p.proname like 'execution_%'or p.proname like 'syzia_%'or p.proname like 'v041_%'or p.proname like 'quote_explanation_%')loop execute format('revoke all on function %s from public,anon,authenticated',r.signature);end loop;end;$$")
emit("notify pgrst,'reload schema';commit")
(root/'supabase/migrations/202609260042_operational_refinements.sql').write_text('\n'.join(parts));print('042 migration generated')
