from pathlib import Path
root=Path(__file__).resolve().parents[2]
parts=['finance','acquisition','identity','selfservice']
header='-- SYZIA 033: incremental upgrade. Preserve migrations 001–032.\nbegin;\ncreate temporary table migration033_existing_functions on commit drop as select oid from pg_proc;\n'
footer='''
do $$declare n text;begin foreach n in array array['acquisition_leads','acquisition_events','selfservice_drafts','selfservice_payments','selfservice_consents']loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 if n in('acquisition_events','selfservice_consents')then execute format('create trigger %I before update or delete on private.%I for each row execute function private.consumer_deny_immutable()',n||'_immutable',n);end if;
 end loop;end;$$;
do $$declare f record;begin for f in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and not exists(select 1 from migration033_existing_functions x where x.oid=p.oid)loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated,service_role';end loop;end;$$;
grant execute on function public.acquisition_plans(),public.consumer_public_page(text) to anon,authenticated;
grant execute on function public.acquisition_lead_submit(uuid,text,text,text,text,text),public.access_identity_lookup(text),public.access_identity_exists(text),public.access_identity_contexts(uuid),public.access_selfservice_identity(uuid,text,text),public.access_select_context(uuid,uuid,uuid),public.selfservice_payment_bind(uuid,uuid,integer,text,text,boolean),public.selfservice_billing_due(uuid) to service_role;
grant execute on function public.people_reserve(text,text,text,text,text,uuid),public.access_reserve(uuid,text,text,text,text,text,text,text,uuid,uuid),public.billing_plan_save(uuid,integer,jsonb),public.acquisition_context(),public.acquisition_lead_update(uuid,integer,text),public.selfservice_context(),public.selfservice_save(uuid,integer,text,text,text,text,text,uuid,uuid),public.selfservice_complete(uuid,integer,boolean,text),public.financial_recurrence_save(uuid,uuid,integer,jsonb,uuid),public.financial_forecast(uuid,date,date),public.financial_occurrence_pay(uuid,uuid,date,text,uuid),public.financial_summary(uuid,date,date) to authenticated;
commit;
'''
(root/'supabase/migrations/202609240033_acquisition_selfservice_finance.sql').write_text(header+'\n'.join((root/f'scripts/syzia-033/{p}.sql').read_text()for p in parts)+footer)
