begin;
-- Final local review, not a new phase. Platform administration is not tenant management.
alter table public.organization_members add column is_attendant boolean not null default false;
alter table public.organization_members add constraint own_attendant_not_admin check(not is_attendant or role='colaborador_empresa');
alter table public.company_settings add column support_configured boolean not null default false;
alter table public.company_settings add column support_mode text not null default 'shared' check(support_mode in ('own','shared','mixed'));
create or replace function private.company_can_manage(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_org_admin(p_org);
$$;
create or replace function private.billing_can_read(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.is_org_admin(p_org) or (private.has_global_role('super_admin') and exists(select 1 from public.organizations where id=p_org and status='active')); $$;
create or replace function private.company_can_read(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.status='active' and o.status='active' and not m.is_attendant);
$$;
create function private.operations_member_role() returns trigger language plpgsql set search_path='' as $$ begin if new.role<>'colaborador_empresa' then new.is_attendant=false;end if;return new;end;$$;
create trigger operations_member_role before update of role on public.organization_members for each row execute function private.operations_member_role();
-- A platform administrator can provision empty settings, never read/manage tenant business data.
create or replace function public.company_initialize(p_org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_authorize('org',p_org);
 insert into public.company_settings(organization_id) values(p_org) on conflict do nothing;
 insert into public.business_rules(organization_id) values(p_org) on conflict do nothing;
 insert into public.attendant_permissions(organization_id) values(p_org) on conflict do nothing;
end;$$;
create function public.operations_set_attendant(p_org uuid,p_user uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.company_lock(p_org);
 if p_enabled is null then raise exception 'invalid_company_fields' using errcode='22023';end if;
 update public.organization_members set is_attendant=p_enabled where organization_id=p_org and user_id=p_user and role='colaborador_empresa';
 if not found then raise exception 'member_required' using errcode='22023';end if;
end;$$;
create function public.operations_support_mode(p_org uuid,p_mode text,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.company_lock(p_org,p_revision);
 if p_mode is null or p_mode not in ('own','shared','mixed') then raise exception 'invalid_company_fields' using errcode='22023';end if;
 update public.company_settings set support_mode=p_mode,support_configured=true,human_enabled=false,revision=revision+1 where organization_id=p_org;
end;$$;
create function private.own_attendant(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id join public.profiles p on p.id=m.user_id join auth.users u on u.id=p.id
 where m.organization_id=p_org and m.user_id=p_user and m.is_attendant and m.role='colaborador_empresa' and m.status='active' and o.status='active' and p.status='active' and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()));
$$;

create or replace function private.company_checklist(p_org uuid,p_draft uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.company_settings; m public.manual_versions; checks jsonb;
begin
 select * into c from public.company_settings where organization_id=p_org;
 select * into m from public.manual_versions where organization_id=p_org and id=coalesce(p_draft,c.published_manual_id);
 checks=jsonb_build_object(
 'company',coalesce(length(btrim(c.description))>=10 and length(btrim(c.service_regions))>=2,false),
 'services',exists(select 1 from public.services where organization_id=p_org and active),
 'pricing',exists(select 1 from public.business_rules where organization_id=p_org and length(btrim(pricing_policy))>=10),
 'hours',coalesce(jsonb_array_length(c.business_hours)>0 and jsonb_array_length(c.human_hours)>0,false),
 'payments',coalesce(length(btrim(c.payment_methods))>=2,false),
 'faq',exists(select 1 from public.faqs where organization_id=p_org and active),
 'replies',exists(select 1 from public.quick_replies where organization_id=p_org and active),
 'rules',exists(select 1 from public.business_rules where organization_id=p_org and length(btrim(payment_policy))>=10 and length(btrim(cancellation_policy))>=10 and length(btrim(rescheduling_policy))>=10 and length(btrim(service_policy))>=10 and length(btrim(deadlines_policy))>=10 and length(btrim(exception_policy))>=10),
 'autonomy',exists(select 1 from public.attendant_permissions where organization_id=p_org and reviewed),
 'exception_contact',coalesce(length(btrim(c.exception_contact_name))>=2 and length(btrim(c.exception_contact))>=5,false),
 'manual_sections',(select count(*)=11 from public.manual_sections where organization_id=p_org and manual_id=m.id and length(btrim(content))>=10),
 'manual_published',coalesce(m.status='published' and m.source_revision=c.operational_revision,false),
 'attendant',((c.support_mode in ('own','mixed') and exists(select 1 from public.organization_members mm where mm.organization_id=p_org and private.own_attendant(p_org,mm.user_id))) or (c.support_mode in ('shared','mixed') and exists(select 1 from public.attendant_organizations a join public.profiles pr on pr.id=a.user_id join auth.users u on u.id=pr.id join public.platform_roles r on r.user_id=pr.id and r.role='atendente' and r.active
 where a.organization_id=p_org and a.status='active' and a.kind='primary' and pr.status='active' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))))
 );
 return checks;
end; $$;
create or replace function private.central_eligible(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.company_settings s where s.organization_id=p_org and s.human_enabled
 and not exists(select 1 from jsonb_each(private.company_checklist(p_org)) where value<>'true'::jsonb)
 and ((s.support_mode in ('own','mixed') and private.own_attendant(p_org,p_user)) or
 (s.support_mode in ('shared','mixed') and private.billing_feature(p_org,'human_support') and exists(
 select 1 from public.attendant_organizations a join public.organizations o on o.id=a.organization_id join public.profiles p on p.id=a.user_id join auth.users u on u.id=p.id join public.platform_roles r on r.user_id=p.id and r.role='atendente' and r.active
 where a.organization_id=p_org and a.user_id=p_user and a.status='active' and o.status='active' and p.status='active' and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())))));
$$;
create or replace function public.company_attendant_permission(p_org uuid,p_action text,p_discount integer default 0) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.is_active_user() and private.central_eligible(p_org,auth.uid()) and exists(select 1 from public.attendant_permissions where organization_id=p_org and reviewed and p_action=any(allowed_actions) and p_discount>=0 and ((p_action='discount' and not never_change_price and p_discount<=max_discount_percent) or(p_action<>'discount' and p_discount=0))),false);
$$;

create or replace function public.central_presence(p_state text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.work_sessions;
begin perform private.central_lock();if not (private.has_global_role('atendente') or exists(select 1 from public.organization_members m where m.user_id=auth.uid() and private.own_attendant(m.organization_id,auth.uid()))) then raise exception 'attendant_role_required' using errcode='42501';end if;
 if p_state is null or p_state not in ('available','busy','pause','offline') then raise exception 'invalid_presence' using errcode='22023';end if;
 select * into s from public.work_sessions where user_id=auth.uid() and ended_at is null;
 if p_state='offline' then update public.work_sessions set presence='offline',ended_at=clock_timestamp() where id=s.id;return jsonb_build_object('presence','offline');end if;
 if s.id is null then insert into public.work_sessions(user_id,presence) values(auth.uid(),p_state) returning * into s;else update public.work_sessions set presence=p_state where id=s.id returning * into s;end if;return jsonb_build_object('presence',s.presence,'started_at',s.started_at);end;$$;
create or replace function public.analytics_central(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bounds jsonb;lo timestamptz;hi timestamptz;minutes integer;r jsonb;
begin
 if not private.is_org_admin(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 bounds=private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);lo=(bounds->>'from')::timestamptz;hi=(bounds->>'until')::timestamptz;
 select response_minutes into minutes from public.central_settings where organization_id=p_org;
 with cohort as(select t.id,t.created_at from public.tickets t where t.organization_id=p_org and t.created_at>=lo and t.created_at<hi),
 timings as(select t.*,first_customer.at customer_at,first_response.at response_at,extract(epoch from(first_response.at-first_customer.at)) response_seconds,
 exists(select 1 from public.ticket_events e where e.organization_id=p_org and e.ticket_id=t.id and e.event='resolved' and e.created_at<hi) resolved
 from cohort t left join lateral(select min(m.created_at) as at from public.ticket_messages m where m.organization_id=p_org and m.ticket_id=t.id and m.kind='customer' and m.created_at<hi)first_customer on true
 left join lateral(select min(m.created_at) as at from public.ticket_messages m where m.organization_id=p_org and m.ticket_id=t.id and m.kind in ('attendant','company') and m.created_at>=first_customer.at and m.created_at<hi)first_response on true)
 select jsonb_build_object('period',bounds,'generated_at',statement_timestamp(),'tickets',count(*),'resolved',count(*) filter(where resolved),'answered',count(response_at),'unanswered',count(*) filter(where customer_at is not null and response_at is null),
 'first_response_seconds',round(avg(response_seconds),1),'median_response_seconds',percentile_cont(.5) within group(order by response_seconds),
 'sla',jsonb_build_object('reference_minutes',minutes,'basis','current_configuration_elapsed_time','within',case when minutes is null then null else count(*) filter(where response_seconds<=minutes*60) end,'breached',case when minutes is null then null else count(*) filter(where response_seconds>minutes*60 or(response_at is null and customer_at<least(hi,statement_timestamp())-make_interval(mins=>minutes))) end),
 'live',jsonb_build_object('queued',(select count(*) from public.tickets where organization_id=p_org and state='queued'),'open',(select count(*) from public.tickets where organization_id=p_org and state not in ('resolved','closed')),'assigned',(select count(*) from public.tickets where organization_id=p_org and state not in ('resolved','closed') and assignee_id is not null),'waiting_company',(select count(*) from public.tickets where organization_id=p_org and state='waiting_company'))) into r from timings;
 return r;
end;$$;
create or replace function public.central_context(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tickets;q public.quote_requests;m public.manual_versions;s public.central_settings;ctx jsonb;
begin t=private.central_ticket(p_code);select * into q from public.quote_requests where id=t.request_id;select v.* into m from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id and v.organization_id=cs.organization_id where cs.organization_id=t.organization_id and v.status='published';select * into s from public.central_settings where organization_id=t.organization_id;
 ctx=private.central_request_context_core(q.public_code);
 return jsonb_build_object('ticket',to_jsonb(t),'request',ctx,'me',auth.uid(),'admin',private.company_can_manage(t.organization_id),'operator_name',(select display_name from public.profiles where id=auth.uid()),
 'organization',(select jsonb_build_object('id',id,'name',name,'slug',slug,'timezone',timezone) from public.organizations where id=t.organization_id),
 'customer',jsonb_build_object('name',(select name from public.customers where id=t.customer_id),'whatsapp',case when(ctx->>'contact_authorized')::boolean then (select whatsapp from public.customers where id=t.customer_id) end,'request_count',(select count(*) from public.quote_requests where customer_id=t.customer_id),'previous_requests',coalesce((select jsonb_agg(jsonb_build_object('code',public_code,'state',state,'created_at',created_at)) from(select public_code,state,created_at from public.quote_requests where customer_id=t.customer_id and id<>q.id order by created_at desc limit 5) recent),'[]'::jsonb)),
 'customer_context',case when coalesce(s.share_customer_context,false) or private.company_can_manage(t.organization_id) then(select jsonb_build_object('tags',tags,'preferred_time',preferred_time,'operational_note',operational_note,'origin_context',origin_context) from public.customer_context where customer_id=t.customer_id) else null end,
 'origin',(select jsonb_build_object('source',source,'detail',source_detail) from public.opportunity_context where opportunity_id=q.opportunity_id),
 'manual',jsonb_build_object('id',m.id,'version',m.version,'title',m.title,'snapshot',m.snapshot,'sections',coalesce((select jsonb_agg(jsonb_build_object('key',section_key,'content',content) order by section_key) from public.manual_sections where manual_id=m.id),'[]'::jsonb)),
 'permissions',coalesce((select jsonb_object_agg(action,public.company_attendant_permission(t.organization_id,action)) from unnest(array['price_list','quote_create','quote_send','schedule','reschedule','cancel','whatsapp']) action),'{}'::jsonb),
 'settings',coalesce(to_jsonb(s),jsonb_build_object('revision',1,'quick_reply_edit',false,'share_customer_context',false)),
 'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'kind',a.kind)) from (select user_id,kind::text kind from public.attendant_organizations where organization_id=t.organization_id union select user_id,'own' from public.organization_members where organization_id=t.organization_id and is_attendant) a join public.profiles p on p.id=a.user_id where private.central_eligible(t.organization_id,p.id)),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'name',author_name,'body',body,'at',created_at) order by created_at,id) from public.ticket_messages where ticket_id=t.id),'[]'::jsonb),
 'notes',coalesce((select jsonb_agg(jsonb_build_object('body',n.body,'author',p.display_name,'at',n.created_at) order by n.created_at,n.id) from public.ticket_notes n join public.profiles p on p.id=n.author_id where ticket_id=t.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'author',p.display_name,'from',e.from_assignee,'to',e.to_assignee,'state',e.state,'at',e.created_at) order by e.created_at,e.id) from public.ticket_events e left join public.profiles p on p.id=e.actor_id where ticket_id=t.id),'[]'::jsonb),
 'escalations',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'summary',summary,'question',question,'response',response,'at',created_at,'responded_at',responded_at) order by created_at desc) from public.ticket_escalations where ticket_id=t.id),'[]'::jsonb),
 'financial',jsonb_build_object('operational',false,'label','Preparação: nenhum pagamento processado pela Central','records',coalesce((select jsonb_agg(jsonb_build_object('status',status,'origin',origin,'confirmation_method',confirmation_method,'amount_cents',amount_cents,'confirmed_cents',confirmed_cents)) from public.payments where request_id=q.id),'[]'::jsonb)));
end;$$;
revoke all on function private.own_attendant(uuid,uuid),public.operations_set_attendant(uuid,uuid,boolean),public.operations_support_mode(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.operations_set_attendant(uuid,uuid,boolean),public.operations_support_mode(uuid,text,integer) to authenticated;
create function public.operations_member(p_org uuid,p_user uuid,p_role text,p_status public.record_status) returns void language plpgsql security definer set search_path='' as $$
begin perform private.company_lock(p_org);
 if p_role not in ('admin_empresa','colaborador_empresa','own_attendant') or p_role is null then raise exception 'invalid_company_fields' using errcode='22023';end if;
 perform public.foundation_set_member(p_org,p_user,(case when p_role='own_attendant' then 'colaborador_empresa' else p_role end)::public.member_role,p_status);
 update public.organization_members set is_attendant=(p_role='own_attendant') where organization_id=p_org and user_id=p_user;
end;$$;
revoke all on function public.operations_member(uuid,uuid,text,public.record_status) from public,anon,authenticated;
grant execute on function public.operations_member(uuid,uuid,text,public.record_status) to authenticated;
commit;
