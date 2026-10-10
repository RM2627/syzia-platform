-- Expense schedules are forecasts. The existing financial_expenses ledger remains paid facts only.
insert into private.permission_catalog(action,module,label,roles,scopes,capability,delegates_management) values
('finance.recurring.create','finance','Criar despesas recorrentes',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',false),
('finance.recurring.manage','finance','Editar/cancelar recorrências',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',false),
('finance.forecast.read','finance','Ver despesas previstas',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',false),
('finance.expenses.pay','finance','Confirmar pagamento de despesa prevista',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',false);
create table public.financial_recurrences(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 description text not null check(length(btrim(description)) between 2 and 300),category text not null default '' check(length(category)<=120),
 amount_cents bigint not null check(amount_cents between 1 and 100000000000),frequency text not null check(frequency in('weekly','monthly','yearly')),
 starts_on date not null check(isfinite(starts_on)),ends_on date check(isfinite(ends_on)),note text not null default '' check(length(note)<=1000),
 active boolean not null default true,revision int not null default 1,actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check(ends_on is null or ends_on>=starts_on),unique(organization_id,id)
);
create table public.financial_occurrences(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),recurrence_id uuid not null,
 due_date date not null,description text not null,category text not null,amount_cents bigint not null,note text not null,
 state text not null default 'pending' check(state in('pending','paid','cancelled')),source_revision int not null,expense_id uuid,
 created_at timestamptz not null default now(),unique(recurrence_id,due_date),unique(organization_id,id),
 foreign key(organization_id,recurrence_id) references public.financial_recurrences(organization_id,id),
 foreign key(organization_id,expense_id) references public.financial_expenses(organization_id,id),
 check((state='paid')=(expense_id is not null))
);
do $$declare n text;begin foreach n in array array['financial_recurrences','financial_occurrences'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 execute format('create trigger %I after insert or update on public.%I for each row execute function private.company_audit()',n||'_audit',n);
 execute format('create trigger %I before delete on public.%I for each row execute function private.consumer_deny_immutable()',n||'_no_delete',n);
 end loop;end;$$;
create function private.expense_due(p_start date,p_frequency text,p_n int) returns date language sql immutable set search_path='' as $$
 select case p_frequency when 'weekly' then p_start+7*p_n when 'monthly' then (p_start+make_interval(months=>p_n))::date when 'yearly' then (p_start+make_interval(years=>p_n))::date end;$$;
create function private.expense_materialize(p_org uuid,p_until date) returns void language plpgsql security definer set search_path='' as $$
declare r public.financial_recurrences;d date;n int;today_ date;begin
 select(now()at time zone timezone)::date into today_ from public.organizations where id=p_org;
 if p_until is null or not isfinite(p_until) or p_until>today_+366 then raise exception 'financial_date_invalid';end if;
 for r in select * from public.financial_recurrences where organization_id=p_org and active for update loop
 n=0;loop d=private.expense_due(r.starts_on,r.frequency,n);exit when d>p_until or(r.ends_on is not null and d>r.ends_on);
 insert into public.financial_occurrences(organization_id,recurrence_id,due_date,description,category,amount_cents,note,source_revision)
 values(p_org,r.id,d,r.description,r.category,r.amount_cents,r.note,r.revision)on conflict(recurrence_id,due_date)do nothing;
 n=n+1;if n>20000 then raise exception 'financial_period_invalid';end if;
 end loop;end loop;end;$$;
create function public.financial_recurrence_save(p_org uuid,p_id uuid,p_revision int,p_data jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.financial_recurrences;payload jsonb;result_ jsonb;today_ date;begin
 perform pg_advisory_xact_lock(734921501);
 perform private.permission_require(p_org,case when p_id is null then 'finance.recurring.create' else 'finance.recurring.manage'end);
 perform private.company_keys(p_data,array['description','category','amount_cents','frequency','starts_on','ends_on','note','active']);
 payload=jsonb_build_array('recurrence_save',p_id,p_revision,p_data);result_=private.financial_idem(p_org,p_key,payload);if result_ is not null then return result_;end if;
 select(now()at time zone timezone)::date into today_ from public.organizations where id=p_org;
 if p_id is null then
 if p_revision<>0 or (p_data->>'starts_on')::date<today_-366 or (p_data->>'starts_on')::date>today_+366 then raise exception 'financial_date_invalid';end if;
 insert into public.financial_recurrences(organization_id,description,category,amount_cents,frequency,starts_on,ends_on,note,actor_id)
 values(p_org,p_data->>'description',coalesce(p_data->>'category',''),(p_data->>'amount_cents')::bigint,p_data->>'frequency',(p_data->>'starts_on')::date,nullif(p_data->>'ends_on','')::date,coalesce(p_data->>'note',''),auth.uid())returning * into r;
 else
 select * into r from public.financial_recurrences where id=p_id and organization_id=p_org for update;
 if r.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if not r.active then raise exception 'financial_transition_invalid';end if;
 if r.revision<>p_revision then raise exception 'financial_revision_conflict'using errcode='40001';end if;
 -- An established schedule keeps its anchor; a different frequency/date uses a new recurrence.
 if p_data->>'frequency' is distinct from r.frequency or(p_data->>'starts_on')::date is distinct from r.starts_on then raise exception 'recurrence_schedule_fixed';end if;
 update public.financial_recurrences set description=p_data->>'description',category=coalesce(p_data->>'category',''),amount_cents=(p_data->>'amount_cents')::bigint,ends_on=nullif(p_data->>'ends_on','')::date,note=coalesce(p_data->>'note',''),active=coalesce((p_data->>'active')::boolean,active),revision=revision+1 where id=r.id returning * into r;
 update public.financial_occurrences set state='pending'where recurrence_id=r.id and state='cancelled'and due_date>=today_ and r.active and(r.ends_on is null or due_date<=r.ends_on);
 update public.financial_occurrences set state='cancelled' where recurrence_id=r.id and state='pending' and due_date>=today_ and(not r.active or(r.ends_on is not null and due_date>r.ends_on));
 update public.financial_occurrences set description=r.description,category=r.category,amount_cents=r.amount_cents,note=r.note,source_revision=r.revision where recurrence_id=r.id and state='pending' and due_date>=today_;
 end if;
 perform private.expense_materialize(p_org,today_+90);
 perform private.financial_event(p_org,null,null,null,'recurrence_saved','',jsonb_build_object('recurrence',r.id,'revision',r.revision,'active',r.active));
 result_=jsonb_build_object('id',r.id,'revision',r.revision);perform private.financial_remember(p_org,p_key,payload,result_);return result_;
end;$$;
create function public.financial_forecast(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.permission_require(p_org,'finance.forecast.read');perform private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);
 perform pg_advisory_xact_lock(734921501);perform private.expense_materialize(p_org,p_to);
 return jsonb_build_object('recurrences',coalesce((select jsonb_agg(to_jsonb(r)order by r.created_at desc)from public.financial_recurrences r where organization_id=p_org),'[]'),
 'occurrences',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('payment_cancelled',exists(select 1 from public.financial_expenses e where e.id=o.expense_id and e.organization_id=o.organization_id and e.cancelled_at is not null))order by due_date,id)from public.financial_occurrences o where organization_id=p_org and due_date between p_from and p_to),'[]'));
end;$$;
create function public.financial_occurrence_pay(p_org uuid,p_id uuid,p_date date,p_method text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare o public.financial_occurrences;payload jsonb;r jsonb;cat uuid;id_ uuid;today_ date;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.expenses.pay');
 payload=jsonb_build_array('occurrence_pay',p_id,p_date,p_method);r=private.financial_idem(p_org,p_key,payload);if r is not null then return r;end if;
 select * into o from public.financial_occurrences where organization_id=p_org and id=p_id for update;
 if o.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if o.state='cancelled'then raise exception 'financial_transition_invalid';end if;
 select(now()at time zone timezone)::date into today_ from public.organizations where id=p_org;
 if p_date is null or not isfinite(p_date)or p_date>today_ then raise exception 'financial_date_invalid';end if;
 if o.state='paid'then r=jsonb_build_object('id',o.expense_id);else
 if length(btrim(o.category))>0 then
 insert into public.expense_categories(organization_id,name)values(p_org,btrim(o.category))on conflict do nothing;
 select id into cat from public.expense_categories where organization_id=p_org and lower(btrim(name))=lower(btrim(o.category))and active;
 if cat is null then raise exception 'financial_category_inactive';end if;end if;
 insert into public.financial_expenses(organization_id,category_id,description,amount_cents,effective_date,method,note,actor_id)values(p_org,cat,o.description,o.amount_cents,p_date,p_method,o.note,auth.uid())returning id into id_;
 update public.financial_occurrences set state='paid',expense_id=id_ where id=o.id;
 perform private.financial_event(p_org,null,null,id_,'recurring_expense_paid','',jsonb_build_object('occurrence',o.id));r=jsonb_build_object('id',id_);end if;
 perform private.financial_remember(p_org,p_key,payload,r);return r;end;$$;
alter function public.financial_summary(uuid,date,date) rename to financial_summary_032;
alter function public.financial_summary_032(uuid,date,date)set schema private;
revoke all on function private.financial_summary_032(uuid,date,date)from public,anon,authenticated,service_role;
create function public.financial_summary(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql security definer set search_path=''as $$declare r jsonb;begin
 r=private.financial_summary_032(p_org,p_from,p_to);
 if private.permission_allowed(p_org,'finance.forecast.read') then
 perform pg_advisory_xact_lock(734921501);perform private.expense_materialize(p_org,p_to);
 r=r||jsonb_build_object('forecast_expenses_cents',(select coalesce(sum(amount_cents),0)from public.financial_occurrences where organization_id=p_org and state='pending'and due_date between p_from and p_to));end if;return r;end;$$;
