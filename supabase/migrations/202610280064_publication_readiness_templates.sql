-- SYZIA 061 integrated correction: publication/template readiness.
-- No stored snapshot, review token, authorization or historical migration changes.
begin;

create function private.presence_publication_current(p_org uuid, p_payload jsonb, p_show_prices boolean)
returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(
   (case when p_payload ? 'template' then p_payload else p_payload || jsonb_build_object('template','current') end)
   = (private.presence_payload(p_org,p_show_prices) || jsonb_build_object('template',
       coalesce((select t.template from private.company_page_templates t where t.organization_id=p_org),'current'))),
   false);
$$;
revoke all on function private.presence_publication_current(uuid,jsonb,boolean) from public,anon,authenticated,service_role;

-- Replace only the proven incompatible expression. The 048 checklist and manual
-- policy remain unchanged. Only a missing legacy layout means the default layout;
-- no service, quantity, price or public-content property is discarded.
do $$
declare definition_ text;
 old_ text := 'm.source_revision=c.operational_revision or(v.manual_id is null and v.payload=private.presence_payload(p_org,v.show_prices))';
 new_ text := $replacement$
 (m.source_revision=c.operational_revision
   and (case when v.payload ? 'template' then v.payload->>'template' else 'current' end)=coalesce((select t.template from private.company_page_templates t where t.organization_id=p_org),'current'))
 or(v.manual_id is null and private.presence_publication_current(p_org,v.payload,v.show_prices))
 $replacement$;
begin
 definition_=pg_get_functiondef('private.onboarding_readiness(uuid)'::regprocedure);
 if position(old_ in definition_)=0 or position(old_ in substring(definition_ from position(old_ in definition_)+length(old_)))>0 then
   raise exception 'publication_readiness_contract_changed';
 end if;
 execute replace(definition_,old_,new_);
end;$$;

commit;
