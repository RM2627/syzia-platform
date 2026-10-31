begin;
-- Additive Academy-only upgrade. No historical outcome is reclassified or resent.
alter table academy.deliveries add column diagnostic jsonb;
create table academy.mail_tests (
 id uuid primary key default gen_random_uuid(), actor uuid not null,
 recipient_key text not null check(recipient_key ~ '^[a-f0-9]{64}$'),
 payload text, status text not null default 'preview' check(status in('preview','pending','sending','accepted','failed','uncertain','skipped')),
 diagnostic jsonb, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 authorized_at timestamptz, attempted_at timestamptz, finished_at timestamptz
);
create index academy_mail_tests_actor on academy.mail_tests(actor,created_at);
alter table academy.mail_tests enable row level security;
alter table academy.mail_tests force row level security;
revoke all on academy.mail_tests from public,anon,authenticated,service_role;

create function academy.check_mail_diagnostic(d jsonb) returns void language plpgsql set search_path='' as $$
begin
 if d is null or jsonb_typeof(d) <> 'object' or
   not d ?& array['status','error_code','category','stage','smtp_code','response_code'] or
   (d-array['status','error_code','category','stage','smtp_code','response_code']) <> '{}'::jsonb or
   coalesce(d->>'status','') not in('accepted','failed','uncertain') or
   coalesce(d->>'error_code','') not in('','email_not_configured','email_delivery_failed','email_temporary_failure','email_authentication_failed','email_recipient_or_sender_rejected','email_rate_limited') or
   coalesce(d->>'category','') not in('accepted','definitive','temporary','uncertain') or
   coalesce(d->>'stage','') not in('accepted','prepare','configuration','dns','connection','greeting','authentication','sender','recipient','message','tls','connection_or_socket','unknown') or
   coalesce(d->>'smtp_code','') not in('NONE','UNKNOWN','EAUTH','ENOAUTH','EDNS','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNECTION','ECONNRESET','ECONNREFUSED','ESOCKET','ETLS','EPROTOCOL','EENVELOPE','EMESSAGE','ESTREAM','EFILEACCESS','EURLACCESS','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','email_not_configured','email_delivery_failed') or
   not (d->'response_code'='null'::jsonb or (jsonb_typeof(d->'response_code')='number' and (d->>'response_code') ~ '^[45][0-9]{2}$')) or
   (d->>'category'='accepted') is distinct from (d->>'status'='accepted') or
   (d->>'category'='uncertain') is distinct from (d->>'status'='uncertain')
 then raise exception 'academy_invalid';end if;
end;$$;

create function public.academy_mail_admin(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; t academy.mail_tests; v uuid;
begin
 if not coalesce(academy.allowed(),false) then raise exception 'access_denied' using errcode='42501';end if;
 if p_action='overview' then
  -- Recover only new test attempts with unknown outcome; never retry or alter historical deliveries.
  update academy.mail_tests set status='uncertain',payload=null,finished_at=now(),diagnostic=jsonb_build_object('status','uncertain','error_code','email_delivery_failed','category','uncertain','stage','unknown','smtp_code','UNKNOWN','response_code',null)
   where status='sending' and attempted_at < now()-interval '2 minutes';
  update academy.mail_tests set status='skipped',payload=null,finished_at=now() where status in('preview','pending') and expires_at<=now();
  delete from academy.mail_tests where created_at < now()-interval '180 days' and status not in('sending','pending');
  r:=public.academy_admin('overview',p_data);
  r:=jsonb_set(r,'{deliveries}',coalesce((select jsonb_agg(x || jsonb_build_object('diagnostic',d.diagnostic) order by ord) from jsonb_array_elements(r->'deliveries') with ordinality a(x,ord) left join academy.deliveries d on d.id=(x->>'id')::uuid),'[]'::jsonb));
  return r || jsonb_build_object('mail_tests',coalesce((select jsonb_agg(x) from(select id,status,diagnostic,created_at,authorized_at,attempted_at,finished_at from academy.mail_tests order by created_at desc limit 30)x),'[]'::jsonb));
 end if;
 if p_action='mail_test_preview' then
  if coalesce((p_data->>'authorized')::boolean,false) is not true then raise exception 'academy_confirmation_required';end if;
  if coalesce(p_data->>'recipient_key','') !~ '^[a-f0-9]{64}$' or length(coalesce(p_data->>'encrypted','')) not between 40 and 4000 or p_data->>'encrypted' !~ '^[A-Za-z0-9_-]+$' then raise exception 'academy_invalid';end if;
  perform pg_advisory_xact_lock(hashtext('academy-mail-test-preview:'||auth.uid()::text));
  if (select count(*) from academy.mail_tests where actor=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'academy_rate_limited';end if;
  insert into academy.mail_tests(actor,recipient_key,payload) values(auth.uid(),p_data->>'recipient_key',p_data->>'encrypted') returning * into t;
  insert into academy.events(event,actor,subject)values('mail_test_previewed',auth.uid(),t.id);
  return jsonb_build_object('id',t.id,'expires_at',t.expires_at);
 end if;
 if p_action='mail_test_confirm' then
  if coalesce((p_data->>'confirmed')::boolean,false) is not true then raise exception 'academy_confirmation_required';end if;
  perform pg_advisory_xact_lock(hashtext('academy-mail-test-budget'));
  select * into t from academy.mail_tests where id=(p_data->>'id')::uuid and actor=auth.uid() for update;
  if not found then raise exception 'access_denied' using errcode='42501';end if;
  if t.status in('pending','sending','accepted','failed','uncertain','skipped') then
   return jsonb_build_object('id',t.id,'status',t.status,'mail_test_id',case when t.status='pending' and t.expires_at>now() then t.id else null end);
  end if;
  if t.expires_at<=now() then raise exception 'academy_preview_expired';end if;
  if (select count(*) from academy.mail_tests where actor=auth.uid() and authorized_at>now()-interval '1 hour')>=3 or (select count(*) from academy.mail_tests where authorized_at>now()-interval '24 hours')>=10 then raise exception 'academy_rate_limited';end if;
  update academy.mail_tests set status='pending',authorized_at=now() where id=t.id;
  insert into academy.events(event,actor,subject)values('mail_test_authorized',auth.uid(),t.id);
  return jsonb_build_object('id',t.id,'status','pending','mail_test_id',t.id);
 end if;
 raise exception 'academy_action_invalid';
end;$$;

create function public.academy_mail_service(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare t academy.mail_tests; d jsonb:=p_data->'diagnostic'; v uuid;
begin
 if p_action='mail_test_claim' then
  update academy.mail_tests set status='skipped',payload=null,finished_at=now() where id=(p_data->>'id')::uuid and status='pending' and expires_at<=now();
  update academy.mail_tests set status='sending',attempted_at=now() where id=(p_data->>'id')::uuid and status='pending' and expires_at>now() returning * into t;
  if not found then return null;end if;
  return jsonb_build_object('id',t.id,'payload',t.payload);
 end if;
 if p_action in('delivery_finish','mail_test_finish') then
  perform academy.check_mail_diagnostic(d);
  if p_data->>'status' is distinct from d->>'status' or p_data->>'error_code' is distinct from d->>'error_code' then raise exception 'academy_invalid';end if;
  if p_action='delivery_finish' then
   select id into v from academy.deliveries where id=(p_data->>'id')::uuid and status='sending' for update;
   if not found then return jsonb_build_object('ok',false);end if;
   perform public.academy_service('delivery_finish',p_data);
   update academy.deliveries set diagnostic=d where id=v;
  else
   update academy.mail_tests set status=d->>'status',diagnostic=d,payload=null,finished_at=now() where id=(p_data->>'id')::uuid and status='sending' returning id into v;
   if not found then return jsonb_build_object('ok',false);end if;
  end if;
  insert into academy.events(event,subject,detail)values('mail_attempt_recorded',v,d);
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'academy_action_invalid';
end;$$;
revoke all on function academy.check_mail_diagnostic(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.academy_mail_admin(text,jsonb),public.academy_mail_service(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.academy_mail_admin(text,jsonb) to authenticated;
grant execute on function public.academy_mail_service(text,jsonb) to service_role;
commit;
