begin;
-- Count actual first-use events; never infer usage from a browser counter.
insert into public.billing_usage(organization_id,metric,entity_id,month,created_at)
 select organization_id,'requests',request_id,date_trunc('month',min(created_at) at time zone 'America/Recife')::date,min(created_at)
 from public.request_events where event='submitted' group by organization_id,request_id;
insert into public.billing_usage(organization_id,metric,entity_id,month,created_at)
 select organization_id,'tickets',id,date_trunc('month',created_at at time zone 'America/Recife')::date,created_at from public.tickets;
insert into public.billing_usage(organization_id,metric,entity_id,month,created_at)
 select organization_id,'followups',id,date_trunc('month',created_at at time zone 'America/Recife')::date,created_at from public.commercial_attempts;
create function private.billing_feature(p_org uuid,p_feature text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.billing_subscriptions where organization_id=p_org) or exists(
 select 1 from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=p_org and private.billing_effective(s) in ('active','trial') and
 case p_feature when 'human_support' then v.human_support when 'commercial_followups' then v.commercial_followups when 'software' then true else false end);
$$;
create function private.billing_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid;metric_ text;id_ uuid;used_ bigint;ceiling_ integer;v public.billing_plan_versions;s public.billing_subscriptions;monthly boolean=false;begin
 org=new.organization_id;
 if tg_table_name='organization_members' then
 if new.status<>'active' or (tg_op='UPDATE' and old.status='active') then return new;end if;metric_='members';
 elsif tg_table_name='services' then
 if not new.active or (tg_op='UPDATE' and old.active) then return new;end if;metric_='services';
 elsif tg_table_name='quote_requests' then
 if new.state<>'submitted' or old.state<>'draft' then return new;end if;metric_='requests';id_=new.id;monthly=true;
 elsif tg_table_name='tickets' then metric_='tickets';id_=new.id;monthly=true;
 elsif tg_table_name='commercial_attempts' then metric_='followups';id_=new.id;monthly=true;
 elsif tg_table_name='opportunities' then metric_='software';
 else raise exception 'billing_guard_scope_invalid';end if;
 -- Same lock and ordering as Foundation/consumer/commercial writes; no check-then-insert race.
 perform pg_advisory_xact_lock(734921501);
 select * into s from public.billing_subscriptions where organization_id=org;
 if s.organization_id is not null then
 if private.billing_effective(s) not in ('active','trial') then raise exception 'billing_subscription_required' using errcode='42501';end if;
 select * into v from public.billing_plan_versions where id=s.plan_version_id;
 if metric_='followups' and not v.commercial_followups then raise exception 'billing_feature_unavailable' using errcode='42501';end if;
 ceiling_=case metric_ when 'members' then v.member_limit when 'services' then v.service_limit when 'requests' then v.request_limit when 'tickets' then v.ticket_limit when 'followups' then v.followup_limit end;
 if ceiling_ is not null then
 used_=(private.billing_usage_snapshot(org)->>metric_)::bigint;
 if used_>=ceiling_ then raise exception 'billing_limit_reached' using errcode='P0001',detail=metric_;end if;
 end if;
 end if;
 if monthly then insert into public.billing_usage(organization_id,metric,entity_id,month) values(org,metric_,id_,date_trunc('month',now() at time zone 'America/Recife')::date) on conflict do nothing;end if;
 return new;
end;$$;
create trigger billing_members_guard before insert or update on public.organization_members for each row execute function private.billing_guard();
create trigger billing_services_guard before insert or update on public.services for each row execute function private.billing_guard();
create trigger billing_requests_guard before update on public.quote_requests for each row execute function private.billing_guard();
create trigger billing_tickets_guard before insert on public.tickets for each row execute function private.billing_guard();
create trigger billing_followups_guard before insert on public.commercial_attempts for each row execute function private.billing_guard();
create trigger billing_interest_guard before insert on public.opportunities for each row execute function private.billing_guard();
-- Preserve every original eligibility condition and add entitlement for shared operators only.
create or replace function private.central_eligible(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.billing_feature(p_org,'human_support') and exists(select 1 from public.attendant_organizations a join public.organizations o on o.id=a.organization_id join public.profiles p on p.id=a.user_id join auth.users u on u.id=p.id join public.platform_roles r on r.user_id=p.id and r.role='atendente' and r.active join public.company_settings s on s.organization_id=o.id
 where a.organization_id=p_org and a.user_id=p_user and a.status='active' and o.status='active' and p.status='active' and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and s.human_enabled
 and not exists(select 1 from jsonb_each(private.company_checklist(p_org)) where value<>'true'::jsonb));
$$;
revoke all on function private.billing_feature(uuid,text),private.billing_guard(),private.central_eligible(uuid,uuid) from public,anon,authenticated;
commit;
