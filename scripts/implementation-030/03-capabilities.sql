create function private.plan_capabilities() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.capabilities='{}'::jsonb then new.capabilities=jsonb_build_object('software',true,'human_support',new.human_support,'commercial_followups',new.commercial_followups);end if;
 if exists(select 1 from jsonb_each(new.capabilities) e where e.key not in('software','human_support','commercial_followups') or jsonb_typeof(e.value)<>'boolean') then raise exception 'invalid_plan_capability';end if;
 if coalesce((new.capabilities->>'software')::boolean,false) is not true then raise exception 'software_capability_required';end if;
 new.human_support=coalesce((new.capabilities->>'human_support')::boolean,false);new.commercial_followups=coalesce((new.capabilities->>'commercial_followups')::boolean,false);return new;
end;$$;
create trigger plan_capabilities before insert on public.billing_plan_versions for each row execute function private.plan_capabilities();
create function private.shared_capability_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='active' and not private.entitlement(new.organization_id,'human_support') then raise exception 'shared_support_plan_required' using errcode='42501';end if;return new;end;$$;
create trigger shared_capability_guard before insert or update on public.attendant_organizations for each row execute function private.shared_capability_guard();
create function private.suspend_shared(p_org uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.entitlement(p_org,'human_support') then
 update public.attendant_organizations set status='suspended' where organization_id=p_org and status='active';
 end if;
end;$$;
create function private.subscription_capability_changed() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform private.suspend_shared(new.organization_id);return new;end;$$;
create trigger subscription_capability_changed after insert or update on public.billing_subscriptions for each row execute function private.subscription_capability_changed();
create trigger exemption_capability_changed after insert or update on private.organization_exemptions for each row execute function private.subscription_capability_changed();
create function public.billing_exemption_set(p_org uuid,p_kind text,p_capabilities jsonb,p_reason text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e private.organization_exemptions;payload jsonb;begin
 perform private.lock_authorize('global');
 if not exists(select 1 from public.organizations where id=p_org and status='active') or p_key is null or p_kind not in('internal','exempt') or length(btrim(p_reason))not between 10 and 500 or jsonb_typeof(p_capabilities)<>'object' or (p_capabilities->>'software')is distinct from 'true' or exists(select 1 from jsonb_each(p_capabilities)x where key not in('software','human_support','commercial_followups')or jsonb_typeof(value)<>'boolean') then raise exception 'exemption_invalid';end if;
 select * into e from private.organization_exemptions where granted_by=auth.uid() and request_key=p_key;
 if found then if e.organization_id<>p_org or e.kind<>p_kind or e.capabilities<>p_capabilities or e.reason<>btrim(p_reason)then raise exception 'idempotency_conflict';end if;return to_jsonb(e)-'request_key';end if;
 if exists(select 1 from private.organization_exemptions where organization_id=p_org and state='active')then raise exception 'exemption_already_active';end if;
 insert into private.organization_exemptions(organization_id,kind,state,capabilities,reason,granted_by,request_key)values(p_org,p_kind,'active',p_capabilities,btrim(p_reason),auth.uid(),p_key)returning * into e;
 perform private.access_audit(p_org,auth.uid(),'exemption_granted',e.id);return to_jsonb(e)-'request_key';
end;$$;
create function public.billing_exemption_revoke(p_org uuid,p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('global');if p_reason is null or length(btrim(p_reason))not between 10 and 500 then raise exception 'exemption_reason_required';end if;
 if not exists(select 1 from private.organization_exemptions where id=p_id and organization_id=p_org)then raise exception 'access_denied' using errcode='42501';end if;
 update private.organization_exemptions set state='revoked',revoked_by=auth.uid(),revoked_at=clock_timestamp(),revocation_reason=btrim(p_reason)where id=p_id and organization_id=p_org and state='active';
 if found then perform private.access_audit(p_org,auth.uid(),'exemption_revoked',p_id);end if;
end;$$;
create function public.billing_capabilities(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.is_active_user() or not private.access_scope(p_org) or not (private.can_access_org(p_org)or private.has_global_role('super_admin')) then raise exception 'access_denied' using errcode='42501';end if;
 return jsonb_build_object('software',private.entitlement(p_org,'software'),'human_support',private.entitlement(p_org,'human_support'),'commercial_followups',private.entitlement(p_org,'commercial_followups'),'exemption',case when private.billing_can_read(p_org)then private.internal_exemption(p_org)end,'commercial_state',case when private.internal_exemption(p_org)is not null then 'internal_exempt' when exists(select 1 from public.billing_subscriptions where organization_id=p_org)then(select private.billing_effective(s)from public.billing_subscriptions s where organization_id=p_org)else 'setup' end);
end;$$;
-- Exemption bypasses billing expiry/limits, never actor, tenant, verification or support checks.
do $$declare d text;begin
 d=pg_get_functiondef('private.billing_guard()'::regprocedure);d=replace(d,'org=new.organization_id;','org=new.organization_id; if private.internal_exemption(org) is not null then return new;end if;');d=replace(d,'select * into s from public.billing_subscriptions where organization_id=org;', 'if metric_ in(''requests'',''tickets'',''followups'',''software'')and not private.entitlement(org,''software'')then raise exception ''billing_subscription_required''using errcode=''42501'';end if; select * into s from public.billing_subscriptions where organization_id=org;');execute d;
 d=pg_get_functiondef('private.trial_eligibility(uuid)'::regprocedure);d=replace(d,'select * into p from private.trial_policy;',E'if private.internal_exemption(p_org) is not null then return ''not_applicable'';end if;\n select * into p from private.trial_policy;');execute d;
 d=pg_get_functiondef('public.billing_subscription_action(uuid,text,uuid,integer,uuid)'::regprocedure);d=replace(d,'perform private.company_lock(p_org);',E'perform private.company_lock(p_org); if private.internal_exemption(p_org) is not null then raise exception ''exemption_no_subscription'';end if;');execute d;
 d=pg_get_functiondef('public.billing_plan_save(uuid,integer,jsonb)'::regprocedure);d=replace(d,'''followup_limit'']);','''followup_limit'',''capabilities'']);');d=replace(d,'request_limit,ticket_limit,followup_limit)','request_limit,ticket_limit,followup_limit,capabilities)');d=replace(d,$q$(p_data->>'followup_limit')::integer);$q$,$q$(p_data->>'followup_limit')::integer,coalesce(p_data->'capabilities','{}'::jsonb));$q$);execute d;
end;$$;
