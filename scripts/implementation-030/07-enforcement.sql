create function private.permission_actor(p_org uuid,p_user uuid,p_action text)returns boolean language plpgsql stable security definer set search_path=''as $$declare r text;c private.permission_catalog;begin
 r=private.permission_role(p_org,p_user);select * into c from private.permission_catalog where action=p_action;
 return r is not null and r=any(c.roles)and private.entitlement(p_org,c.capability)and(r in('admin_empresa','super_admin')or exists(select 1 from private.organization_permissions where organization_id=p_org and user_id=p_user and action=p_action and granted and scope='organization'));
end;$$;
-- Preserve previous readiness/autonomy/assignment requirements and add per-person revocable grants.
do $$declare d text;begin
 d=pg_get_functiondef('private.central_eligible(uuid,uuid)'::regprocedure);execute replace(d,'FUNCTION private.central_eligible(','FUNCTION private.permission_central_base(');
 d=pg_get_functiondef('private.commercial_can_operate(uuid,uuid)'::regprocedure);execute replace(d,'FUNCTION private.commercial_can_operate(','FUNCTION private.permission_commercial_base(');
end;$$;
create or replace function private.central_eligible(p_org uuid,p_user uuid)returns boolean language sql stable security definer set search_path=''as $$select private.permission_central_base(p_org,p_user)and private.permission_actor(p_org,p_user,'central.read');$$;
create or replace function private.commercial_can_operate(p_org uuid,p_user uuid default auth.uid())returns boolean language sql stable security definer set search_path=''as $$select private.permission_commercial_base(p_org,p_user)and private.permission_actor(p_org,p_user,'followup.manage');$$;
create function private.permission_redact(p_value jsonb)returns jsonb language plpgsql immutable set search_path=''as $$declare r jsonb;k text;v jsonb;begin
 if jsonb_typeof(p_value)='object'then r='{}';for k,v in select * from jsonb_each(p_value)loop r=r||jsonb_build_object(k,case when k like '%cents%'or k in('discount_percent','max_discount_percent','value')then 'null'::jsonb else private.permission_redact(v)end);end loop;return r;
 elsif jsonb_typeof(p_value)='array'then return coalesce((select jsonb_agg(private.permission_redact(value))from jsonb_array_elements(p_value)),'[]'::jsonb);else return p_value;end if;
end;$$;
create function private.permission_projection(p_org uuid,p_function text,p_result jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$declare r jsonb=p_result;id_ uuid;begin
 if p_function in('operations_detail','operations_quote_context','operations_requests','operations_agenda','consumer_work_context','central_context','commercial_context','commercial_list','central_queue')and not private.permission_allowed(p_org,'quotes.values')then r=private.permission_redact(r);end if;
 if p_function='consumer_admin_context'then
 if not private.permission_allowed(p_org,'quotes.read')then r=jsonb_set(r,'{requests}','[]');end if;
 if not private.permission_allowed(p_org,'agenda.read')then r=jsonb_set(jsonb_set(r,'{blocks}','[]'),'{schedule}','null');end if;
 end if;
 if p_function='consumer_presence_context'and not private.permission_allowed(p_org,'portfolio.read')then r=jsonb_set(jsonb_set(r,'{portfolio_all}','[]'),'{portfolio}','[]');end if;
 if p_function='central_context'then
 r=r||jsonb_build_object('admin',private.permission_manager(p_org),'action_permissions',(select jsonb_object_agg(c.action,private.permission_allowed(p_org,c.action))from private.permission_catalog c));
 select id into id_ from public.financial_accounts where organization_id=p_org and request_id=(p_result->'ticket'->>'request_id')::uuid and cancelled_at is null;
 r=r||jsonb_build_object('financial',case when id_ is not null and private.permission_allowed(p_org,'finance.accounts.read',id_)then jsonb_build_object('operational',true,'account',private.financial_account_json(p_org,id_),'can_record',private.permission_allowed(p_org,'finance.receipts.record',id_))else null end);
 end if;
 if p_function in('operations_detail','operations_quote_context')then
 select id into id_ from public.financial_accounts where organization_id=p_org and request_id=coalesce((p_result->'appointment'->>'request_id')::uuid,(p_result->'request'->>'id')::uuid)and cancelled_at is null;
 if id_ is not null and private.permission_allowed(p_org,'finance.accounts.read',id_)then r=r||jsonb_build_object('financial_account',jsonb_build_object('id',id_,'balance_cents',(private.financial_account_json(p_org,id_)->'balance_cents')));end if;
 end if;
 if p_function='commercial_context'then r=r||jsonb_build_object('can_operate',coalesce((r->>'can_operate')::boolean,false)and private.permission_allowed(p_org,'followup.manage'));end if;
 if p_function='analytics_company'then
 if private.permission_allowed(p_org,'analytics.financial')then r=r||jsonb_build_object('financial',private.financial_totals(p_org,(r->'period'->>'first_day')::date,(r->'period'->>'last_day')::date));else r=r-'financial'-'values';end if;
 end if;return r;
end;$$;
-- Wrappers are generated from original signatures. Aliases stay private with ALL client grants revoked.
create function private.permission_wrap(p_name text,p_org_expr text,p_action_expr text,p_project boolean default false)returns void language plpgsql security definer set search_path=''as $$
declare f record;d text;args text;call_ text;signature_ text;body_ text;result_ text;begin
 select p.*,pg_get_function_arguments(p.oid)as declarations,pg_get_function_identity_arguments(p.oid)as identities,pg_get_function_result(p.oid)as result_type into f from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=p_name;
 if f.oid is null then raise exception 'Unknown wrapper target %',p_name;end if;
 d=pg_get_functiondef(f.oid);execute replace(d,'FUNCTION public.'||p_name||'(','FUNCTION private.v029_'||p_name||'(');
 signature_=format('private.v029_%I(%s)',p_name,f.identities);execute 'revoke all on function '||signature_||' from public,anon,authenticated,service_role';
 select string_agg(quote_ident(n),',')into call_ from unnest(f.proargnames)n;
 call_=format('private.v029_%I(%s)',p_name,coalesce(call_,''));
 body_=format('declare org_ uuid;depth_ int;%s begin org_=%s;depth_=private.permission_enter(org_,%s);',case when f.result_type='void'then ''else 'result_ '||f.result_type||';'end,p_org_expr,p_action_expr);
 body_=body_||case when f.result_type='void'then 'perform 'else 'result_='end||call_||';';
 if p_project and f.result_type='jsonb'then body_=body_||format('result_=private.permission_projection(org_,%L,result_);',p_name);end if;
 body_=body_||'perform private.permission_leave(depth_);'||case when f.result_type='void'then 'return;'else 'return result_;'end||'end;';
 execute format('create or replace function public.%I(%s)returns %s language plpgsql security definer set search_path='''' as %L',p_name,f.declarations,f.result_type,body_);
end;$$;
