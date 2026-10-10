from pathlib import Path

root=Path(__file__).resolve().parents[2]
baseline=root/'reports/syzia-040/baseline-functions'
parts=['-- SYZIA 040: incremental sobre 039, sem reescrever contratos ou dados operacionais.\nbegin;\n']
def sql(value): parts.append(value.rstrip()+(';' if value.rstrip().endswith('$function$') else '')+'\n')
def change(name, replacements):
    value=(baseline/(name+'.sql')).read_text()
    for before,after in replacements:
        assert before in value,(name,before)
        value=value.replace(before,after)
    sql(value)

sql('''
create table private.billing_plan_homologations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 plan_version_id uuid not null references public.billing_plan_versions(id),
 started_by uuid not null references public.profiles(id),started_at timestamptz not null default clock_timestamp(),
 ended_by uuid references public.profiles(id),ended_at timestamptz,reason text not null check(length(btrim(reason))between 10 and 500)
);
create unique index billing_one_homologation on private.billing_plan_homologations(organization_id)where ended_at is null;
alter table private.billing_plan_homologations enable row level security;
alter table private.billing_plan_homologations force row level security;
revoke all on private.billing_plan_homologations from public,anon,authenticated,service_role;
create function private.billing_homologation(p_org uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('id',h.id,'started_at',h.started_at,'reason',h.reason,'plan',to_jsonb(v)||jsonb_build_object('name',p.name),'notice','PLANO APLICADO PARA HOMOLOGAÇÃO — não representa assinatura ou pagamento.')
 from private.billing_plan_homologations h join public.billing_plan_versions v on v.id=h.plan_version_id join public.billing_plans p on p.id=v.plan_id where h.organization_id=p_org and h.ended_at is null;$$;
create function private.billing_effective_version(p_org uuid)returns public.billing_plan_versions language sql stable security definer set search_path=''as $$
 select v from public.billing_plan_versions v where v.id=coalesce((select plan_version_id from private.billing_plan_homologations where organization_id=p_org and ended_at is null),(select plan_version_id from public.billing_subscriptions where organization_id=p_org));$$;
alter function private.entitlement(uuid,text)rename to entitlement_039;
create function private.entitlement(p_org uuid,p_feature text)returns boolean language plpgsql stable security definer set search_path=''as $$declare v public.billing_plan_versions;begin
 if not exists(select 1 from public.organizations where id=p_org and status='active')then return false;end if;
 if p_feature='setup'then return true;end if;
 if exists(select 1 from private.billing_plan_homologations where organization_id=p_org and ended_at is null)then
 v=private.billing_effective_version(p_org);
 if p_feature='finance_analytics'then return coalesce((v.capabilities->>'finance')::boolean,true)and coalesce((v.capabilities->>'analytics')::boolean,true);end if;
 return coalesce((v.capabilities->>p_feature)::boolean,p_feature in('finance','analytics'));
 end if;
 return private.entitlement_039(p_org,p_feature);end;$$;
create function public.billing_homologation_set(p_org uuid,p_version uuid,p_expected uuid,p_reason text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
 declare h private.billing_plan_homologations;prior public.billing_commands;payload jsonb;result_ jsonb;begin
 perform private.lock_authorize('global');
 if p_key is null or p_reason is null or length(btrim(p_reason))not between 10 and 500 or not exists(select 1 from public.organizations where id=p_org and status='active')then raise exception 'homologation_invalid';end if;
 payload=jsonb_build_object('action','homologation','version',p_version,'expected',p_expected,'reason',btrim(p_reason));
 select *into prior from public.billing_commands where organization_id=p_org and actor_id=auth.uid()and key=p_key;
 if found then if prior.payload<>payload then raise exception 'billing_key_conflict';end if;return prior.result;end if;
 select *into h from private.billing_plan_homologations where organization_id=p_org and ended_at is null for update;
 if h.id is distinct from p_expected then raise exception 'homologation_conflict'using errcode='40001';end if;
 if p_version is not null and not exists(select 1 from public.billing_plan_versions where id=p_version)then raise exception 'billing_plan_unavailable';end if;
 update private.billing_plan_homologations set ended_at=clock_timestamp(),ended_by=auth.uid()where id=h.id;
 if p_version is not null then
 insert into private.billing_plan_homologations(organization_id,plan_version_id,started_by,reason)values(p_org,p_version,auth.uid(),btrim(p_reason))returning *into h;
 end if;
 if not private.entitlement(p_org,'human_support')then update public.attendant_organizations set status='suspended'where organization_id=p_org and status='active';end if;
 perform private.access_audit(p_org,auth.uid(),case when p_version is null then 'plan_homologation_ended'else 'plan_homologation_applied'end,h.id);
 result_=jsonb_build_object('homologation',private.billing_homologation(p_org),'ended',p_version is null);
 insert into public.billing_commands values(p_org,auth.uid(),p_key,payload,result_,clock_timestamp());return result_;end;$$;
''')
change('private.billing_assert_capacity',[
 ("if private.internal_exemption(p_org)is not null then return;end if;","if private.internal_exemption(p_org)is not null and private.billing_homologation(p_org)is null then return;end if;"),
 ("if s.organization_id is null then","if private.billing_homologation(p_org)is null then if s.organization_id is null then"),
 ("select * into v from public.billing_plan_versions where id=s.plan_version_id;","end if; v=private.billing_effective_version(p_org);")])
# Use exact replacements for existing usage semantics, keeping counters and history.
for path in baseline.glob('private.billing*.sql'):
    s=path.read_text()
    old="select v.quota_semantics from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=p_org"
    old2="select v.quota_semantics into sem from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=new.organization_id;"
    old3="select v.quota_semantics into sem from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=org;"
    if any(x in s for x in [old,old2,old3]):
        sql(s.replace(old,"select quota_semantics from private.billing_effective_version(p_org)").replace(old2,"select quota_semantics into sem from private.billing_effective_version(new.organization_id);").replace(old3,"select quota_semantics into sem from private.billing_effective_version(org);"))
change('public.billing_context',[("'trial',private.trial_context(p_org)","'homologation',private.billing_homologation(p_org),'effective_plan',to_jsonb(private.billing_effective_version(p_org)),'trial',private.trial_context(p_org)")])
change('public.billing_admin_overview',[("o.id,o.name,o.status,s.state", "o.id,o.name,o.status,private.billing_homologation(o.id) homologation,s.state"),("'plans',private.billing_catalog(true)","'plan_versions',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('name',p.name)order by p.position,p.name,v.version desc),'[]')from public.billing_plan_versions v join public.billing_plans p on p.id=v.plan_id),'plans',private.billing_catalog(true)")])
change('public.billing_capabilities',[("'finance',private.entitlement", "'homologation',case when private.billing_can_read(p_org)then private.billing_homologation(p_org)end,'finance',private.entitlement"),("'commercial_state',case when", "'commercial_state',case when private.billing_homologation(p_org)is not null then 'homologation'when")])
sql('''
alter table public.billing_plans add column featured boolean not null default false;
alter table public.billing_plans add column featured_label text not null default 'Mais recomendado'check(length(btrim(featured_label))between 1 and 60);
create unique index billing_one_featured_plan on public.billing_plans(featured)where featured and site_visible;
create function public.billing_plan_feature(p_plan uuid,p_label text,p_previous uuid)returns void language plpgsql security definer set search_path=''as $$declare old_ uuid;begin
 perform private.lock_authorize('global');select id into old_ from public.billing_plans where featured and site_visible for update;
 if old_ is distinct from p_previous then raise exception 'featured_plan_changed'using errcode='40001';end if;
 if p_plan is not null and(not exists(select 1 from public.billing_plans where id=p_plan and site_visible and active and available)or p_label is null or length(btrim(p_label))not between 1 and 60)then raise exception 'featured_plan_invalid';end if;
 update public.billing_plans set featured=false where featured;
 update public.billing_plans set featured=true,featured_label=btrim(p_label)where id=p_plan;
 perform private.access_audit(null,auth.uid(),'plan_feature_changed',p_plan);end;$$;
''')
# Existing public offer projection uses an explicit shape.
change('public.acquisition_plans',[("'name',p.name", "'featured',p.featured,'featured_label',p.featured_label,'name',p.name")])

# Self service: eligibility is server-side, free trial requires consent, not a simulated card.
sql("alter table private.selfservice_consents alter column payment_reference drop not null;alter table private.selfservice_drafts drop constraint selfservice_drafts_state_check;alter table private.selfservice_drafts add constraint selfservice_drafts_state_check check(state in('review','ineligible','payment_pending','ready','completed','cancelled'));")
change('private.selfservice_eligibility',[
 ("if not policy_.auto_enabled then return 'manual_policy';end if;", ""),
 ("if not (policy_.required_types", "if not policy_.auto_enabled then return 'manual_policy';end if;\n if not (policy_.required_types"),
 ("or(kind='business'and fingerprint=p_fingerprint)", "or(kind='business'and fingerprint=p_fingerprint)")])
change('public.selfservice_save',[("when why='eligible'then 'payment_pending'else 'review'", "when why='eligible'then 'ready'when why in('previous_identity','trial_not_offered')then 'ineligible'else 'review'")])
change('public.selfservice_complete',[
 ("p_conditions<>'selfservice-033'", "p_conditions<>'selfservice-040'"),
 ("select *into m from private.selfservice_payments where draft_id=d.id and revision=d.revision and valid_until>clock_timestamp();\n if m.draft_id is null then raise exception 'selfservice_payment_required';end if;\n if not m.simulation or m.provider<>'mock'or not(select mock_enabled from private.billing_runtime)then raise exception 'billing_provider_not_configured';end if;", ""),
 ("why<>'eligible'then raise exception 'trial_review_required';end if;", "why<>'eligible'then update private.selfservice_drafts set state=case when why in('previous_identity','trial_not_offered')then 'ineligible'else 'review'end,eligibility=why where id=d.id;return private.selfservice_projection(d.id);end if;\n d.trial_end=clock_timestamp()+make_interval(days=>v.trial_days);update private.selfservice_drafts set trial_end=d.trial_end where id=d.id;"),
 ("Self-service: explicit plan, validated simulated method and consent", "Self-service: elegibilidade server-side, plano explícito e consentimento; sem pagamento"),
 ("m.reference,m.simulation", "null,false"),
 ("m.simulation", "false"),
 (", salvo cancelamento conforme as condições apresentadas.", ", mediante contratação após o período gratuito. Esta confirmação não registra pagamento."),
 ("payment_reference,simulation)values", "payment_reference,simulation,conditions_version)values"),
 ("statement_,null,false);", "statement_,null,false,'selfservice-040');")])
# Used/denied is conclusive, never sent back to administrative review.
change('private.billing_subscription_action_038',[("select id into request_ from private.trial_requests", "if why in('previous_grant','previous_identity','previous_review','not_applicable')then\n result_=jsonb_build_object('review_required',false,'eligible',false,'reason',why,'subscription_required',why<>'not_applicable');\n insert into public.billing_commands values(p_org,auth.uid(),p_key,payload,result_,now());return result_;end if;\n select id into request_ from private.trial_requests")])
sql('''
create function public.billing_trial_confirm(p_org uuid,p_kind text,p_document text,p_plan uuid,p_revision integer,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare doc text;fp bytea;begin
 perform private.permission_require(p_org,'billing.manage');perform private.company_lock(p_org);
 if private.billing_homologation(p_org)is not null then raise exception 'homologation_trial_unavailable';end if;
 doc=private.document_normalize(p_kind,p_document);if doc is null then raise exception 'document_invalid';end if;
 fp=private.trial_fingerprint('business','BR:'||p_kind||':'||doc);
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(p_org,'business',fp,auth.uid(),'self_declared_structure_040')on conflict(organization_id,kind,fingerprint)do nothing;
 if p_kind='CPF'then insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(p_org,'responsible',private.trial_fingerprint('responsible','BR:CPF:'||doc),auth.uid(),'self_declared_structure_040')on conflict(organization_id,kind,fingerprint)do nothing;end if;
 return public.billing_subscription_action(p_org,'trial',p_plan,p_revision,p_key);end;$$;
''')

change('public.billing_subscription_action',[("perform private.permission_require(p_org,'billing.manage');", "perform private.permission_require(p_org,'billing.manage');if p_action='trial'and private.billing_homologation(p_org)is not null then raise exception 'homologation_trial_unavailable';end if;")])

# Scoped employee grants make a collaborator eligible; role alone never does.
change('private.central_eligible',[("private.permission_actor(p_org,p_user,'central.read') and","private.permission_actor(p_org,p_user,'central.read') and private.permission_actor(p_org,p_user,'central.manage') and private.permission_actor(p_org,p_user,'central.reply') and"),("private.permission_central_base(p_org,p_user) or", "private.permission_central_base(p_org,p_user) or (private.permission_role(p_org,p_user)in('colaborador_empresa','own_attendant')and private.permission_actor(p_org,p_user,'central.manage')and private.permission_actor(p_org,p_user,'central.reply')and(p_user is distinct from auth.uid()or(private.is_active_user()and private.access_scope(p_org)))) or")])
change('private.central_staff',[("(private.permission_manager(p_org) or private.central_eligible(p_org,auth.uid()) or private.permission_role(p_org,auth.uid())='colaborador_empresa')", "private.permission_role(p_org,auth.uid())in('super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant')")])
change('public.central_presence',[("private.has_global_role('atendente')", "exists(select 1 from public.organizations o where private.central_eligible(o.id,auth.uid())) or private.has_global_role('atendente')")])
change('private.v029_central_act',[("if not private.central_eligible(t.organization_id,auth.uid()) or not exists", "if not private.central_eligible(t.organization_id,auth.uid())then raise exception 'central_claim_permission_required'using errcode='42501';end if;\n  if not exists")])
change('public.central_act',[("depth_=private.permission_enter(org_,case", "if p_action='claim'and not private.permission_allowed(org_,'central.manage')then raise exception 'central_claim_permission_required'using errcode='42501';end if;depth_=private.permission_enter(org_,case")])
change('private.permission_projection',[("'admin',private.permission_manager(p_org)", "'claim_eligible',private.central_eligible(p_org,auth.uid()),'admin',private.permission_manager(p_org)")])

# Platform staff remain global identities, with only local autonomy delegated to companies.
change('public.foundation_set_attendant',[("perform private.require_eligible_user(p_user);", "perform private.require_eligible_user(p_user);\n  if not private.entitlement(p_org,'human_support')then raise exception 'human_support_required'using errcode='42501';end if;")])
sql('''
create function private.human_support_revocation()returns trigger language plpgsql security definer set search_path=''as $$begin
 if not private.entitlement(new.organization_id,'human_support')then update public.attendant_organizations set status='suspended'where organization_id=new.organization_id and status='active';end if;return new;end;$$;
create trigger syzia040_subscription_support after insert or update on public.billing_subscriptions for each row execute function private.human_support_revocation();
create trigger syzia040_exemption_support after insert or update on private.organization_exemptions for each row execute function private.human_support_revocation();
''')
change('public.access_team',[("result_=private.permission_projection", "result_=jsonb_set(jsonb_set(result_,'{accounts}',coalesce((select jsonb_agg(x||jsonb_build_object('can_attend',private.central_eligible(p_org,(x->>'user_id')::uuid),'can_reply',private.permission_actor(p_org,(x->>'user_id')::uuid,'central.reply'),'scope','organization'))from jsonb_array_elements(result_->'accounts')x),'[]'::jsonb)),'{legacy}',coalesce((select jsonb_agg(x||jsonb_build_object('can_attend',private.central_eligible(p_org,(x->>'user_id')::uuid),'can_reply',private.permission_actor(p_org,(x->>'user_id')::uuid,'central.reply'),'scope','organization'))from jsonb_array_elements(result_->'legacy')x),'[]'::jsonb));result_=result_||jsonb_build_object('shared',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name,'status',a.status,'kind',a.kind))from public.attendant_organizations a join public.profiles p on p.id=a.user_id where a.organization_id=p_org),'[]'::jsonb));result_=private.permission_projection")])
change('public.people_companies' ,[("'status',status", "'status',status,'human_support',private.entitlement(id,'human_support')")])
change('public.people_link',[("if p_role not in", "if exists(select 1 from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff')then raise exception 'platform_staff_requires_assignment';end if;\n if p_role not in")])
change('public.access_manage',[("perform private.lock_authorize('org',a.organization_id);", "if exists(select 1 from private.enterprise_accounts where user_id=a.user_id and organization_id is null and role='syzia_staff')then raise exception 'shared_identity_requires_superadmin'using errcode='42501';end if;perform private.lock_authorize('org',a.organization_id);")])
sql('''
create function public.people_staff_edit(p_user uuid,p_name text,p_username text,p_email text,p_phone text)returns void language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;begin
 perform private.lock_authorize('global');select *into a from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff'for update;
 if a.id is null or a.state in('reserved','changing','uncertain')or p_user=auth.uid()then raise exception 'access_change_unavailable';end if;
 if p_name is null or length(btrim(p_name))not between 3 and 120 or p_username is null or lower(btrim(p_username))!~'^[a-z][a-z0-9]{1,29}[.][a-z0-9][a-z0-9.]{0,29}$'or p_email is null or length(btrim(p_email))>254 or btrim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'or length(coalesce(p_phone,''))>40 then raise exception 'access_identity_invalid';end if;
 update private.enterprise_accounts set display_name=btrim(p_name),username=lower(btrim(p_username)),contact_email=nullif(lower(btrim(p_email)),''),phone=nullif(btrim(p_phone),'')where id=a.id;
 update public.profiles set display_name=btrim(p_name)where id=p_user;
 update private.enterprise_sessions set revoked=true where user_id=p_user;
 perform private.access_audit(null,auth.uid(),'staff_identity_edited',a.id);end;$$;
''')
change('public.permissions_context',[("'timezone',","'homologation',case when private.billing_homologation(p_org)is not null then jsonb_build_object('notice','PLANO APLICADO PARA HOMOLOGAÇÃO — não representa assinatura ou pagamento.','name',private.billing_homologation(p_org)#>>'{plan,name}')end,'timezone',")])
change('public.permissions_team',[("'role',x.role", "'role',x.role,'can_attend',private.central_eligible(p_org,p.id),'can_reply',private.permission_actor(p_org,p.id,'central.reply')")])

sql('''
create function public.people_staff_state(p_user uuid,p_active boolean)returns void language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;begin
 perform private.lock_authorize('global');select *into a from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff'for update;
 if a.id is null or p_active is null or a.state in('reserved','changing','uncertain')or p_user=auth.uid()then raise exception 'access_change_unavailable';end if;
 update private.enterprise_accounts set state=case when p_active then case when activated_at is null then 'pending'else 'active'end else 'disabled'end where id=a.id;
 update public.profiles set status=case when p_active then 'active'::public.record_status else 'suspended'::public.record_status end where id=p_user;
 update private.enterprise_sessions set revoked=true where user_id=p_user;
 if not p_active then update public.attendant_organizations set status='suspended'where user_id=p_user;end if;
 perform private.access_audit(null,auth.uid(),case when p_active then 'staff_identity_enabled'else 'staff_identity_disabled'end,a.id);end;$$;
''')

# Published identity and booking readiness are projected only after the existing request authorization.
sql('''
create function private.consumer_booking_status(q public.quote_requests)returns jsonb language plpgsql stable security definer set search_path=''as $$declare s jsonb;pub public.consumer_publications;ready boolean=false;begin
 if q.state not in('submitted','under_review','quoted','approved')then return jsonb_build_object('ready',false,'reason','request_not_ready');end if;
 if q.accepted_version_id is not null then return jsonb_build_object('ready',true,'reason',null);end if;
 if q.state not in('submitted','under_review')then return jsonb_build_object('ready',false,'reason','proposal_required');end if;
 pub=private.consumer_publication((select slug from public.organizations where id=q.organization_id));
 begin s=private.consumer_request_selection(q);exception when sqlstate '22023'then return jsonb_build_object('ready',false,'reason','service_unavailable');end;
 ready=coalesce((s->>'direct_booking')::boolean,false)and s->>'price_mode'='fixed'and pub.id=q.publication_id;
 return jsonb_build_object('ready',coalesce(ready,false),'reason',case when ready then null else 'proposal_required'end);end;$$;
''')
change('private.central_request_context_core',[("'code',q.public_code", "'booking',private.consumer_booking_status(q),'branding',(select pub.payload->'branding'from public.consumer_pages page join public.consumer_publications pub on pub.id=page.publication_id where page.organization_id=q.organization_id),'code',q.public_code")])
sql('''
revoke all on function private.billing_homologation(uuid),private.billing_effective_version(uuid),private.entitlement_039(uuid,text),private.entitlement(uuid,text),private.human_support_revocation(),private.consumer_booking_status(public.quote_requests)from public,anon,authenticated,service_role;
revoke all on function public.billing_homologation_set(uuid,uuid,uuid,text,uuid),public.billing_plan_feature(uuid,text,uuid),public.billing_trial_confirm(uuid,text,text,uuid,integer,uuid),public.people_staff_edit(uuid,text,text,text,text),public.people_staff_state(uuid,boolean)from public,anon,authenticated,service_role;
grant execute on function public.billing_homologation_set(uuid,uuid,uuid,text,uuid),public.billing_plan_feature(uuid,text,uuid),public.billing_trial_confirm(uuid,text,text,uuid,integer,uuid),public.people_staff_edit(uuid,text,text,text,text),public.people_staff_state(uuid,boolean)to authenticated;
notify pgrst,'reload schema';
commit;
''')
(root/'supabase/migrations/202609260040_post_homologation.sql').write_text('\n'.join(parts))
print('040 gerada',sum(map(len,parts)),'caracteres')
