create function private.syzia_identity(p_user uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff')or exists(select 1 from public.platform_roles where user_id=p_user and role='atendente');$$;
create function private.syzia_identity_guard(p_user uuid,p_actor uuid)returns void language plpgsql stable security definer set search_path=''as $$begin
 if private.syzia_identity(p_user)and not private.people_root(p_actor)then raise exception 'shared_identity_requires_superadmin'using errcode='42501';end if;end;$$;
create or replace function public.access_team(p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare d integer;r jsonb;begin d=private.permission_enter(p_org,'people.read');r=private.v029_access_team(p_org);
 r=r||jsonb_build_object('accounts',coalesce((select jsonb_agg(x||jsonb_build_object('can_attend',private.central_eligible(p_org,(x->>'user_id')::uuid),'can_reply',private.permission_actor(p_org,(x->>'user_id')::uuid,'central.reply'),'scope','organization'))from jsonb_array_elements(r->'accounts')x where not private.syzia_identity((x->>'user_id')::uuid)),'[]'),
 'legacy',coalesce((select jsonb_agg(x||jsonb_build_object('can_attend',private.central_eligible(p_org,(x->>'user_id')::uuid),'can_reply',private.permission_actor(p_org,(x->>'user_id')::uuid,'central.reply'),'scope','organization'))from jsonb_array_elements(r->'legacy')x where not private.syzia_identity((x->>'user_id')::uuid)),'[]'),
 'shared',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name,'identity_kind','syzia_staff','status',coalesce(a.status::text,'unassigned'),'kind',a.kind,'can_attend',private.central_eligible(p_org,p.id),'can_reply',private.permission_actor(p_org,p.id,'central.reply'),'scope','organization')order by p.display_name)from public.profiles p left join public.attendant_organizations a on a.user_id=p.id and a.organization_id=p_org where private.syzia_identity(p.id)and(a.user_id is not null or exists(select 1 from public.organization_members m where m.user_id=p.id and m.organization_id=p_org))),'[]'));
 perform private.permission_leave(d);return r;end;$$;
create or replace function public.company_attendant_permission(p_org uuid,p_action text,p_discount integer default 0)returns boolean language plpgsql stable security definer set search_path=''as $$
declare r text;grant_ text;live public.attendant_permissions;snapshot jsonb;cap integer;begin
 r=private.permission_role(p_org,auth.uid());if r is null or p_discount is null or p_discount not between 0 and 100 then return false;end if;
 grant_=case when p_action in('price_list','price_range')then 'quotes.values'when p_action in('quote_create','quote_send','quote_items','discount')then 'quotes.manage'when p_action in('schedule','reschedule','cancel','fit_in')then 'agenda.manage'when p_action in('follow_up','aftercare')then 'followup.manage'when p_action in('whatsapp','negotiate')then 'central.reply'else null end;
 if grant_ is null or not private.permission_allowed(p_org,grant_)then return false;end if;
 if p_action in('quote_create','quote_send','quote_items','discount')and not private.permission_allowed(p_org,'quotes.values')then return false;end if;
 if r in('admin_empresa','super_admin')then return p_action in('price_range','price_list','quote_create','quote_send','quote_items','discount','schedule','reschedule','cancel','fit_in','follow_up','whatsapp','aftercare','negotiate');end if;
 if not private.central_eligible(p_org,auth.uid())then return false;end if;
 select *into live from public.attendant_permissions where organization_id=p_org;
 select v.snapshot into snapshot from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id where cs.organization_id=p_org;
 if not coalesce(live.reviewed and p_action=any(live.allowed_actions)and(snapshot->'permissions'->'allowed_actions')?p_action,false)then return false;end if;
 if p_action='price_range'and not exists(select 1 from jsonb_array_elements(snapshot->'services')s where s->>'price_mode'='from'and s->>'price_max_cents'is not null and(s->>'price_max_cents')::integer>=(s->>'price_cents')::integer)then return false;end if;
 -- negotiate is information about published conditions only, never a price-edit capability.
 if p_action='discount'then cap=least(live.max_discount_percent,coalesce((snapshot->'permissions'->>'max_discount_percent')::integer,0));return not live.never_change_price and not coalesce((snapshot->'permissions'->>'never_change_price')::boolean,true)and p_discount<=cap;end if;
 return p_discount=0;
end;$$;
