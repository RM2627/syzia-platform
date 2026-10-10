create function private.journey_company_actor(p_org uuid,p_user uuid)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce(private.permission_role(p_org,p_user)in('admin_empresa','super_admin','own_attendant','colaborador_empresa'),false);$$;
create function private.journey_ticket_visible(p_ticket uuid)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce((select private.central_staff(t.organization_id)and(t.routing_scope<>'company'or private.journey_company_actor(t.organization_id,auth.uid()))from public.tickets t where t.id=p_ticket),false);$$;
create function private.journey_route(p_ticket uuid,p_reason text)returns void language plpgsql security definer set search_path=''as $$
declare t public.tickets;target uuid;begin
 select *into t from public.tickets where id=p_ticket;
 select m.user_id into target from public.organization_members m where m.organization_id=t.organization_id and m.status='active'and private.central_eligible(t.organization_id,m.user_id)and(m.role='admin_empresa'or(m.is_attendant and private.permission_actor(t.organization_id,m.user_id,'quotes.manage')and private.permission_actor(t.organization_id,m.user_id,'quotes.values')))
 order by case when m.role='admin_empresa'then 1 else 0 end,m.created_at,m.user_id limit 1;
 update public.tickets set routing_scope='company',routing_reason=p_reason,assignee_id=target,state=case when target is null then 'queued'else 'active'end,next_action='quote',revision=revision+1 where id=p_ticket;
 perform private.central_event(p_ticket,'assigned',t.assignee_id,target);end;$$;
create function private.journey_on_ticket()returns trigger language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;c jsonb;begin select *into q from public.quote_requests where id=new.request_id;
 if q.help_only then c=private.journey_selection(q.publication_id,q.help_context->'items',false);else c=private.consumer_request_selection(q);end if;
 if q.journey='review'or not coalesce((c->>'direct_booking')::boolean,false)then perform private.journey_route(new.id,'Avaliação de preço ou condição necessária');end if;return new;end;$$;
create trigger journey_ticket_route after insert on public.tickets for each row execute function private.journey_on_ticket();
-- Existing permissive policies remain; restrictive policies add the decision boundary.
create policy journey_route_read on public.tickets as restrictive for select to authenticated using(private.journey_ticket_visible(id));
do $$declare n text;begin foreach n in array array['ticket_messages','ticket_notes','ticket_events','ticket_escalations','central_quote_actions']loop execute format('create policy journey_route_read on public.%I as restrictive for select to authenticated using(private.journey_ticket_visible(ticket_id))',n);end loop;end;$$;
