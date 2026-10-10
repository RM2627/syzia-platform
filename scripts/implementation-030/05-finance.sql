create function private.financial_received(p_org uuid,p_account uuid)returns bigint language sql stable security definer set search_path=''as $$
 select coalesce(sum(case kind when 'receipt'then amount_cents else -amount_cents end),0)::bigint from public.financial_receipts where organization_id=p_org and account_id=p_account;$$;
create function private.financial_account_json(p_org uuid,p_id uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select to_jsonb(a)||jsonb_build_object('customer_name',c.name,'assigned_name',(select display_name from public.profiles where id=a.assigned_to),'received_cents',r.amount,'balance_cents',a.total_cents-r.amount,'status',case when a.cancelled_at is not null then 'cancelled'when r.amount=a.total_cents then 'paid'when a.due_date<(now()at time zone o.timezone)::date then 'overdue'when r.amount>0 then 'partial'else 'pending'end)
 from public.financial_accounts a join public.organizations o on o.id=a.organization_id left join public.customers c on c.id=a.customer_id and c.organization_id=p_org cross join lateral(select private.financial_received(p_org,a.id)amount)r where a.organization_id=p_org and a.id=p_id;$$;
create function private.financial_event(p_org uuid,p_account uuid,p_receipt uuid,p_expense uuid,p_event text,p_reason text,p_details jsonb default '{}')returns void language sql security definer set search_path=''as $$
 insert into public.financial_events(organization_id,account_id,receipt_id,expense_id,event,actor_id,reason,details)values(p_org,p_account,p_receipt,p_expense,p_event,auth.uid(),coalesce(p_reason,''),p_details);$$;
create function private.financial_idem(p_org uuid,p_key uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=''as $$declare c private.financial_commands;begin
 if p_key is null then raise exception 'financial_key_required';end if;
 select * into c from private.financial_commands where organization_id=p_org and actor_id=auth.uid()and key=p_key;
 if found and c.payload<>p_payload then raise exception 'idempotency_conflict';end if;return c.result;end;$$;
create function private.financial_remember(p_org uuid,p_key uuid,p_payload jsonb,p_result jsonb)returns void language sql security definer set search_path=''as $$insert into private.financial_commands values(p_org,auth.uid(),p_key,p_payload,p_result);$$;
create function public.financial_accounts(p_org uuid,p_status text default null,p_search text default '',p_offset int default 0)returns jsonb language plpgsql stable security definer set search_path=''as $$declare r jsonb;begin
 if not private.is_active_user()or not private.access_scope(p_org)or private.permission_role(p_org,auth.uid())is null then raise exception 'permission_denied'using errcode='42501';end if;
 if p_offset is null or p_offset<0 or p_offset>100000 or length(coalesce(p_search,''))>150 then raise exception 'financial_filter_invalid';end if;
 select coalesce(jsonb_agg(x),'[]')into r from(select private.financial_account_json(p_org,a.id)x from public.financial_accounts a where a.organization_id=p_org and private.permission_allowed(p_org,'finance.accounts.read',a.id)and (coalesce(p_search,'')=''or a.description ilike '%'||p_search||'%'or exists(select 1 from public.customers c where c.id=a.customer_id and c.organization_id=p_org and c.name ilike '%'||p_search||'%'))and(p_status is null or private.financial_account_json(p_org,a.id)->>'status'=p_status)order by a.created_at desc,a.id limit 50 offset p_offset)t;
 return jsonb_build_object('accounts',r,'next_offset',case when jsonb_array_length(r)=50 then p_offset+50 end);
end;$$;
create function public.financial_account(p_org uuid,p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'finance.accounts.read',p_id);
 if not exists(select 1 from public.financial_accounts where organization_id=p_org and id=p_id)then raise exception 'permission_denied'using errcode='42501';end if;
 return jsonb_build_object('account',private.financial_account_json(p_org,p_id),'can_record',private.permission_allowed(p_org,'finance.receipts.record',p_id),'can_reverse',private.permission_allowed(p_org,'finance.receipts.reverse',p_id),
 'receipts',case when private.permission_allowed(p_org,'finance.history.read',p_id)then coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('actor_name',p.display_name)order by r.created_at,r.id)from public.financial_receipts r left join public.profiles p on p.id=r.actor_id where r.organization_id=p_org and r.account_id=p_id),'[]'::jsonb)else null end,
 'history',case when private.permission_allowed(p_org,'finance.history.read',p_id)then coalesce((select jsonb_agg(to_jsonb(e)order by e.created_at,e.id)from public.financial_events e where organization_id=p_org and account_id=p_id),'[]'::jsonb)else null end);
end;$$;
create function public.financial_account_save(p_org uuid,p_id uuid,p_revision int,p_data jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare a public.financial_accounts;q public.quote_requests;v public.quote_versions;payload jsonb;prior jsonb;r jsonb;total_ bigint;customer_ uuid;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.accounts.manage');
 perform private.company_keys(p_data,array['description','customer_id','request_id','appointment_id','service_id','total_cents','due_date','notes','assigned_to','cancel','reason']);
 payload=jsonb_build_array('account',p_id,p_revision,p_data);prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 if p_id is not null then
 select * into a from public.financial_accounts where id=p_id and organization_id=p_org for update;
 if a.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if a.revision is distinct from p_revision then raise exception 'financial_revision_conflict'using errcode='40001';end if;
 if a.cancelled_at is not null then raise exception 'financial_account_cancelled';end if;
 if coalesce((p_data->>'cancel')::boolean,false)then
 if private.financial_received(p_org,p_id)<>0 then raise exception 'financial_reverse_before_cancel';end if;
 if length(btrim(coalesce(p_data->>'reason','')))<10 then raise exception 'financial_reason_required';end if;
 update public.financial_accounts set cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancel_reason=p_data->>'reason',revision=revision+1 where id=p_id;
 perform private.financial_event(p_org,p_id,null,null,'account_cancelled',p_data->>'reason');
 else
 total_=coalesce((p_data->>'total_cents')::bigint,a.total_cents);
 if total_<private.financial_received(p_org,p_id)or(a.origin='approved_quote'and total_<>a.total_cents)then raise exception 'financial_total_invalid';end if;
 if p_data?'assigned_to'and nullif(p_data->>'assigned_to','')is not null and private.permission_role(p_org,(p_data->>'assigned_to')::uuid)is null then raise exception 'financial_assignee_invalid';end if;
 update public.financial_accounts set description=coalesce(p_data->>'description',description),total_cents=total_,due_date=case when p_data?'due_date'then nullif(p_data->>'due_date','')::date else due_date end,notes=coalesce(p_data->>'notes',notes),assigned_to=case when p_data?'assigned_to'then nullif(p_data->>'assigned_to','')::uuid else assigned_to end,revision=revision+1 where id=p_id;
 perform private.financial_event(p_org,p_id,null,null,'account_updated',coalesce(p_data->>'reason','Atualização autorizada'),jsonb_build_object('previous_total_cents',a.total_cents,'total_cents',total_));
 end if;
 else
 if p_revision is distinct from 0 then raise exception 'financial_revision_conflict'using errcode='40001';end if;
 if nullif(p_data->>'request_id','')is not null then
 select * into q from public.quote_requests where organization_id=p_org and id=(p_data->>'request_id')::uuid;
 select * into v from public.quote_versions where organization_id=p_org and id=q.accepted_version_id and request_id=q.id;
 if v.id is null or v.total_cents is null or v.total_cents<=0 then raise exception 'financial_approved_quote_required';end if;
 select * into a from public.financial_accounts where organization_id=p_org and request_id=q.id and cancelled_at is null;
 if a.id is not null then r=jsonb_build_object('id',a.id,'revision',a.revision);perform private.financial_remember(p_org,p_key,payload,r);return r;end if;
 total_=v.total_cents;customer_=q.customer_id;
 else total_=(p_data->>'total_cents')::bigint;customer_=nullif(p_data->>'customer_id','')::uuid;end if;
 if nullif(p_data->>'assigned_to','')is not null and private.permission_role(p_org,(p_data->>'assigned_to')::uuid)is null then raise exception 'financial_assignee_invalid';end if;
 if nullif(p_data->>'appointment_id','')is not null and not exists(select 1 from public.appointments ap where ap.organization_id=p_org and ap.id=(p_data->>'appointment_id')::uuid and (q.id is null or ap.request_id=q.id)and(customer_ is null or ap.customer_id=customer_)and(nullif(p_data->>'service_id','')is null or exists(select 1 from public.quote_requests ar where ar.id=ap.request_id and ar.service_id=(p_data->>'service_id')::uuid)))then raise exception 'financial_link_invalid';end if;
 insert into public.financial_accounts(organization_id,customer_id,request_id,quote_version_id,appointment_id,service_id,description,origin,total_cents,due_date,notes,assigned_to,created_by)
 values(p_org,customer_,q.id,v.id,nullif(p_data->>'appointment_id','')::uuid,coalesce(q.service_id,nullif(p_data->>'service_id','')::uuid),coalesce(p_data->>'description','Serviço contratado'),case when q.id is null then 'manual'else 'approved_quote'end,total_,nullif(p_data->>'due_date','')::date,coalesce(p_data->>'notes',''),nullif(p_data->>'assigned_to','')::uuid,auth.uid())returning * into a;
 p_id=a.id;perform private.financial_event(p_org,p_id,null,null,'account_created','Criação autorizada',jsonb_build_object('origin',a.origin,'total_cents',total_));
 end if;
 select jsonb_build_object('id',id,'revision',revision)into r from public.financial_accounts where id=p_id;
 perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_receipt_record(p_org uuid,p_account uuid,p_amount bigint,p_date date,p_method text,p_note text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare a public.financial_accounts;payload jsonb;prior jsonb;r jsonb;id_ uuid;today date;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.receipts.record',p_account);perform private.permission_require(p_org,'finance.accounts.read',p_account);
 payload=jsonb_build_array('receipt',p_account,p_amount,p_date,p_method,coalesce(p_note,''));prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 select * into a from public.financial_accounts where organization_id=p_org and id=p_account for update;if a.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 select (now()at time zone timezone)::date into today from public.organizations where id=p_org;
 if a.cancelled_at is not null or p_amount is null or p_amount<=0 or p_date is null or not isfinite(p_date)or p_date>today or p_amount>a.total_cents-private.financial_received(p_org,p_account)then raise exception 'financial_receipt_invalid';end if;
 insert into public.financial_receipts(organization_id,account_id,kind,amount_cents,effective_date,method,note,actor_id)values(p_org,p_account,'receipt',p_amount,p_date,p_method,coalesce(p_note,''),auth.uid())returning id into id_;
 update public.financial_accounts set revision=revision+1 where id=p_account;
 perform private.financial_event(p_org,p_account,id_,null,'receipt_recorded',p_note,jsonb_build_object('amount_cents',p_amount,'effective_date',p_date));
 r=jsonb_build_object('id',id_,'account',private.financial_account_json(p_org,p_account));perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_receipt_reverse(p_org uuid,p_receipt uuid,p_reason text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare original public.financial_receipts;id_ uuid;payload jsonb;prior jsonb;r jsonb;today date;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.receipts.reverse');
 payload=jsonb_build_array('reversal',p_receipt,p_reason);prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 select * into original from public.financial_receipts where id=p_receipt and organization_id=p_org and kind='receipt';if original.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason))not between 10 and 1000 then raise exception 'financial_reason_required';end if;
 select id into id_ from public.financial_receipts where original_id=p_receipt;
 if id_ is null then
 select(now()at time zone timezone)::date into today from public.organizations where id=p_org;
 insert into public.financial_receipts(organization_id,account_id,kind,amount_cents,effective_date,method,note,original_id,actor_id)values(p_org,original.account_id,'reversal',original.amount_cents,today,original.method,btrim(p_reason),original.id,auth.uid())returning id into id_;
 update public.financial_accounts set revision=revision+1 where id=original.account_id;
 perform private.financial_event(p_org,original.account_id,id_,null,'receipt_reversed',p_reason,jsonb_build_object('original_receipt',original.id,'effect_cents',-original.amount_cents));end if;
 r=jsonb_build_object('id',id_,'account',private.financial_account_json(p_org,original.account_id));perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function private.financial_approved()returns trigger language plpgsql security definer set search_path=''as $$
declare v public.quote_versions;a public.financial_accounts;begin
 if new.accepted_version_id is null or new.accepted_version_id is not distinct from old.accepted_version_id then return new;end if;
 select * into v from public.quote_versions where organization_id=new.organization_id and request_id=new.id and id=new.accepted_version_id;
 if v.total_cents is null or v.total_cents<=0 then return new;end if;
 -- New approvals create a receivable, never a receipt. Existing approvals are not retroactively assumed unpaid.
 if not exists(select 1 from public.financial_accounts where organization_id=new.organization_id and request_id=new.id and cancelled_at is null)then
 insert into public.financial_accounts(organization_id,customer_id,request_id,quote_version_id,service_id,description,origin,total_cents,created_by)values(new.organization_id,new.customer_id,new.id,v.id,new.service_id,coalesce((select name from public.services where id=new.service_id),'Serviço contratado'),'approved_quote',v.total_cents,case when exists(select 1 from public.profiles where id=auth.uid())then auth.uid()end)returning * into a;
 perform private.financial_event(new.organization_id,a.id,null,null,'account_from_approval','Proposta aprovada; nenhum recebimento registrado',jsonb_build_object('quote_version_id',v.id,'total_cents',v.total_cents));end if;return new;
end;$$;
create trigger financial_approved after update of accepted_version_id on public.quote_requests for each row execute function private.financial_approved();
create function public.financial_expense_save(p_org uuid,p_data jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare payload jsonb;prior jsonb;r jsonb;id_ uuid;cat uuid;today date;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.expenses.record');
 perform private.company_keys(p_data,array['description','category','amount_cents','date','method','note']);payload=jsonb_build_array('expense',p_data);prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 select(now()at time zone timezone)::date into today from public.organizations where id=p_org;
 if nullif(p_data->>'date','')is null or not isfinite((p_data->>'date')::date)or(p_data->>'date')::date>today then raise exception 'financial_date_invalid';end if;
 if length(btrim(coalesce(p_data->>'category','')))>0 then
 insert into public.expense_categories(organization_id,name)values(p_org,btrim(p_data->>'category'))on conflict do nothing;
 select id into cat from public.expense_categories where organization_id=p_org and lower(btrim(name))=lower(btrim(p_data->>'category'))and active;
 if cat is null then raise exception 'financial_category_inactive';end if;end if;
 insert into public.financial_expenses(organization_id,category_id,description,amount_cents,effective_date,method,note,actor_id)values(p_org,cat,p_data->>'description',(p_data->>'amount_cents')::bigint,(p_data->>'date')::date,p_data->>'method',coalesce(p_data->>'note',''),auth.uid())returning id into id_;
 perform private.financial_event(p_org,null,null,id_,'expense_recorded',p_data->>'note');r=jsonb_build_object('id',id_);perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_expense_cancel(p_org uuid,p_id uuid,p_reason text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare payload jsonb;prior jsonb;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.expenses.manage');payload=jsonb_build_array('expense_cancel',p_id,p_reason);prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 if p_reason is null or length(btrim(p_reason))not between 10 and 1000 then raise exception 'financial_reason_required';end if;
 if not exists(select 1 from public.financial_expenses where organization_id=p_org and id=p_id)then raise exception 'permission_denied'using errcode='42501';end if;
 update public.financial_expenses set cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancel_reason=p_reason where organization_id=p_org and id=p_id and cancelled_at is null;
 if found then perform private.financial_event(p_org,null,null,p_id,'expense_cancelled',p_reason);end if;
 r=jsonb_build_object('id',p_id);perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_expenses(p_org uuid,p_from date,p_to date)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'finance.expenses.read');perform private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);
 return jsonb_build_object('expenses',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('category',c.name)order by effective_date desc,e.id)from public.financial_expenses e left join public.expense_categories c on c.id=e.category_id and c.organization_id=p_org where e.organization_id=p_org and e.effective_date between p_from and p_to),'[]'::jsonb),'categories',coalesce((select jsonb_agg(to_jsonb(c)order by name)from public.expense_categories c where organization_id=p_org),'[]'::jsonb));end;$$;
create function public.financial_receipts(p_org uuid,p_from date,p_to date)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'finance.receipts.summary');perform private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);
 return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('description',a.description,'customer_name',c.name)order by r.effective_date desc,r.id)from public.financial_receipts r join public.financial_accounts a on a.id=r.account_id and a.organization_id=p_org left join public.customers c on c.id=a.customer_id where r.organization_id=p_org and r.effective_date between p_from and p_to),'[]'::jsonb);end;$$;
create function private.financial_totals(p_org uuid,p_from date,p_to date)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare b jsonb;lo timestamptz;hi timestamptz;received bigint;expenses bigint;quoted bigint;approved bigint;performed bigint;balance bigint;overdue bigint;today date;num bigint;begin
 b=private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);lo=(b->>'from')::timestamptz;hi=(b->>'until')::timestamptz;select(now()at time zone timezone)::date into today from public.organizations where id=p_org;
 select coalesce(sum(case kind when 'receipt'then amount_cents else -amount_cents end),0)into received from public.financial_receipts where organization_id=p_org and effective_date between p_from and p_to;
 select coalesce(sum(amount_cents),0)into expenses from public.financial_expenses where organization_id=p_org and effective_date between p_from and p_to and cancelled_at is null;
 select coalesce(sum(total_cents),0)into quoted from(select distinct on(request_id)total_cents from public.quote_versions where organization_id=p_org and kind='final'and state='sent'and created_at>=lo and created_at<hi order by request_id,version desc)x;
 select coalesce(sum(v.total_cents),0)into approved from public.quote_requests q join public.quote_versions v on v.id=q.accepted_version_id and v.organization_id=p_org where q.organization_id=p_org and exists(select 1 from public.request_events e where e.organization_id=p_org and e.request_id=q.id and e.event='approved'and e.created_at>=lo and e.created_at<hi);
 select coalesce(sum(v.total_cents),0)into performed from public.appointments a join public.quote_requests q on q.id=a.request_id and q.organization_id=p_org join public.quote_versions v on v.id=q.accepted_version_id and v.organization_id=p_org where a.organization_id=p_org and a.execution_state='completed'and a.completed_at>=lo and a.completed_at<hi;
 select coalesce(sum(a.total_cents-private.financial_received(p_org,a.id)),0),coalesce(sum(a.total_cents-private.financial_received(p_org,a.id))filter(where a.due_date<today),0),count(*)filter(where a.total_cents>private.financial_received(p_org,a.id))into balance,overdue,num from public.financial_accounts a where a.organization_id=p_org and a.cancelled_at is null;
 return jsonb_build_object('period',b,'quoted_cents',quoted,'approved_cents',approved,'performed_cents',performed,'received_cents',received,'expenses_cents',expenses,'result_cents',received-expenses,'receivable_cents',balance,'overdue_cents',overdue,'pending_count',num,'average_receipt_cents',(select round(avg(amount_cents))from public.financial_receipts where organization_id=p_org and kind='receipt'and effective_date between p_from and p_to and not exists(select 1 from public.financial_receipts rev where rev.original_id=financial_receipts.id)),'basis','manual_ledger_effective_dates;receivables_current_snapshot;quotes_issued_in_period;result_not_accounting_profit');
end;$$;
create function public.financial_summary(p_org uuid,p_from date,p_to date)returns jsonb language plpgsql stable security definer set search_path=''as $$declare r jsonb;out_ jsonb='{}';full_ boolean;begin
 if not private.is_active_user()or private.permission_role(p_org,auth.uid())is null or not private.access_scope(p_org)then raise exception 'permission_denied'using errcode='42501';end if;
 full_=private.permission_allowed(p_org,'analytics.financial');
 if not(full_ or private.permission_allowed(p_org,'finance.cash.read')or private.permission_allowed(p_org,'finance.result.read')or private.permission_allowed(p_org,'finance.receipts.summary'))then raise exception 'permission_denied'using errcode='42501';end if;
 r=private.financial_totals(p_org,p_from,p_to);if full_ then return r;end if;
 out_=jsonb_build_object('period',r->'period','basis',r->'basis');
 if private.permission_allowed(p_org,'finance.cash.read')then out_=out_||jsonb_build_object('received_cents',r->'received_cents','expenses_cents',r->'expenses_cents','result_cents',r->'result_cents','receivable_cents',r->'receivable_cents');end if;
 if private.permission_allowed(p_org,'finance.receipts.summary')then out_=out_||jsonb_build_object('received_cents',r->'received_cents','average_receipt_cents',r->'average_receipt_cents');end if;
 if private.permission_allowed(p_org,'finance.result.read')then out_=out_||jsonb_build_object('result_cents',r->'result_cents');end if;return out_;
end;$$;
create policy financial_accounts_read on public.financial_accounts for select to authenticated using(private.permission_allowed(organization_id,'finance.accounts.read',id));
create policy financial_receipts_read on public.financial_receipts for select to authenticated using(private.permission_allowed(organization_id,'finance.receipts.summary')or private.permission_allowed(organization_id,'finance.history.read',account_id));
create policy financial_expenses_read on public.financial_expenses for select to authenticated using(private.permission_allowed(organization_id,'finance.expenses.read'));
create policy financial_events_read on public.financial_events for select to authenticated using((account_id is not null and private.permission_allowed(organization_id,'finance.history.read',account_id))or(expense_id is not null and private.permission_allowed(organization_id,'finance.expenses.read')));
create policy expense_categories_read on public.expense_categories for select to authenticated using(private.permission_allowed(organization_id,'finance.expenses.read')or private.permission_allowed(organization_id,'finance.expenses.record'));

create function public.financial_expense_category_save(p_org uuid,p_id uuid,p_name text,p_active boolean,p_delete boolean,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare payload jsonb;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.expenses.manage');payload=jsonb_build_array('expense_category',p_id,p_name,p_active,p_delete);r=private.financial_idem(p_org,p_key,payload);if r is not null then return r;end if;
 if p_id is not null and not exists(select 1 from public.expense_categories where organization_id=p_org and id=p_id)then raise exception 'permission_denied'using errcode='42501';end if;
 if p_delete then if exists(select 1 from public.financial_expenses where organization_id=p_org and category_id=p_id)then raise exception 'category_in_use';end if;delete from public.expense_categories where organization_id=p_org and id=p_id;
 elsif p_id is null then insert into public.expense_categories(organization_id,name,active)values(p_org,btrim(p_name),coalesce(p_active,true))returning id into p_id;
 else update public.expense_categories set name=btrim(p_name),active=coalesce(p_active,active)where organization_id=p_org and id=p_id;end if;
 r=jsonb_build_object('id',p_id);perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_reference_options(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'finance.accounts.manage');
 return jsonb_build_object(
 'assignees',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name))from public.profiles p where private.permission_allowed(p_org,'people.read')and private.permission_role(p_org,p.id)is not null),'[]'::jsonb),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name))from(select id,name from public.customers where organization_id=p_org and private.permission_allowed(p_org,'clients.read')order by name limit 200)x),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name))from(select id,name from public.services where organization_id=p_org and active and private.permission_allowed(p_org,'services.read')order by name limit 200)x),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(to_jsonb(x))from(select a.id,a.customer_id,a.request_id,q.service_id,a.starts_at,c.name customer from public.appointments a join public.customers c on c.id=a.customer_id join public.quote_requests q on q.id=a.request_id where a.organization_id=p_org and a.kind='booking'and private.permission_allowed(p_org,'agenda.read')order by starts_at desc limit 100)x),'[]'::jsonb));
end;$$;
