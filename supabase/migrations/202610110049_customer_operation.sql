-- SYZIA 049. Additive upgrade over populated 048; no provider/real environment action.
begin;

create table private.signup_authorizations (
 email_hash text primary key, token_hash text not null unique,
 username text not null, expires_at timestamptz not null
);
alter table private.signup_authorizations enable row level security;
alter table private.signup_authorizations force row level security;
revoke all on private.signup_authorizations from public,anon,authenticated,service_role;

create function public.access_signup_authorize(p_email text,p_username text,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_hash !~ '^[a-f0-9]{64}$' or p_email is null or p_username is null then raise exception 'access_invalid' using errcode='22023';end if;
 delete from private.signup_authorizations where expires_at<=clock_timestamp();
 insert into private.signup_authorizations values(encode(extensions.digest(lower(btrim(p_email)),'sha256'),'hex'),p_hash,p_username,clock_timestamp()+interval '5 minutes');
exception when unique_violation then raise exception 'access_signup_in_progress' using errcode='40001';
end;$$;
create function public.access_signup_release(p_hash text) returns void language sql security definer set search_path='' as $$delete from private.signup_authorizations where token_hash=p_hash;$$;
revoke all on function public.access_signup_authorize(text,text,text),public.access_signup_release(text) from public,anon,authenticated;
grant execute on function public.access_signup_authorize(text,text,text),public.access_signup_release(text) to service_role;

create or replace function public.access_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare accepted_ boolean; nonce_ text=event->'user'->'user_metadata'->>'syzia_signup_authorization';
begin
 if event->'user'->>'is_anonymous'='true' then return '{}'::jsonb;end if;
 if event->'user'->'app_metadata'->>'vireloq_provisioned'='true' and exists(select 1 from private.enterprise_accounts where user_id::text=event->'user'->>'id' and state='reserved') then return '{}'::jsonb;end if;
 if nonce_ ~ '^[a-f0-9]{64}$' then
  delete from private.signup_authorizations where email_hash=encode(extensions.digest(lower(btrim(event->'user'->>'email')),'sha256'),'hex')
   and token_hash=encode(extensions.digest(nonce_,'sha256'),'hex') and username=event->'user'->'user_metadata'->>'syzia_username' and expires_at>clock_timestamp() returning true into accepted_;
  if accepted_ then return '{}'::jsonb;end if;
 end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Acesso empresarial requer provisionamento.'));
end;$$;
revoke all on function public.access_before_user_created(jsonb) from public,anon,authenticated,service_role;
do $$begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then grant usage on schema public to supabase_auth_admin;grant execute on function public.access_before_user_created(jsonb) to supabase_auth_admin;end if;end;$$;

create function private.contact_phone(p_value text) returns text language plpgsql immutable set search_path='' as $$
declare raw_ text=btrim(coalesce(p_value,''));n text;br text;
begin
 if raw_='' then return '';end if;
 if raw_ !~ '^\+?[0-9 ()\.\-]+$' or length(raw_)>40 then raise exception 'invalid_contact_phone' using errcode='22023';end if;
 n=regexp_replace(raw_,'[^0-9]','','g');
 if left(raw_,1)='+' and left(n,2)<>'55' then
  if n !~ '^[1-9][0-9]{6,14}$' or n ~ '^([0-9])\1+$' then raise exception 'invalid_contact_phone' using errcode='22023';end if;
  return '+'||n;
 end if;
 br=case when length(n)in(12,13)and left(n,2)='55'then substring(n from 3)else n end;
 if br !~ '^[0-9]{10,11}$' or substring(br,1,2) not in('11','12','13','14','15','16','17','18','19','21','22','24','27','28','31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55','61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99')
  or(length(br)=11 and substring(br,3) !~ '^9[0-9]{8}$')or(length(br)=10 and substring(br,3)!~ '^[2-5][0-9]{7}$')or substring(br,3)~'^([0-9])\1+$' then raise exception 'invalid_contact_phone' using errcode='22023';end if;
 return '55'||br;
end;$$;
revoke all on function private.contact_phone(text) from public,anon,authenticated,service_role;

-- A per-ticket order assigned under the parent lock prevents cursor races across commits.
-- Freeze inserts while numbering the existing immutable history and attaching its trigger.
lock table public.ticket_messages in share row exclusive mode;
create table private.ticket_message_numbers(message_id uuid primary key references public.ticket_messages(id),ticket_id uuid not null references public.tickets(id),message_number bigint not null,unique(ticket_id,message_number));
alter table private.ticket_message_numbers enable row level security;alter table private.ticket_message_numbers force row level security;
revoke all on private.ticket_message_numbers from public,anon,authenticated,service_role;
insert into private.ticket_message_numbers select id,ticket_id,row_number()over(partition by ticket_id order by created_at,id)from public.ticket_messages;
create function private.message_number(p_id uuid)returns bigint language sql stable security definer set search_path=''as $$select message_number from private.ticket_message_numbers where message_id=p_id;$$;
create function private.message_number_assign() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.tickets where id=new.ticket_id and organization_id=new.organization_id for update;
 if not found then raise exception 'central_access_denied' using errcode='42501';end if;
 insert into private.ticket_message_numbers select new.id,new.ticket_id,coalesce(max(message_number),0)+1 from private.ticket_message_numbers where ticket_id=new.ticket_id;
 return new;
end;$$;
create trigger message_number_assign after insert on public.ticket_messages for each row execute function private.message_number_assign();
create table private.ticket_reads (
 ticket_id uuid not null references public.tickets(id),user_id uuid not null references auth.users(id),
 message_number bigint not null check(message_number>0),read_at timestamptz not null default clock_timestamp(),primary key(ticket_id,user_id)
);
alter table private.ticket_reads enable row level security;
alter table private.ticket_reads force row level security;
revoke all on private.ticket_reads from public,anon,authenticated,service_role;
create function private.ticket_unread(p_ticket uuid)returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from private.ticket_message_numbers n join public.ticket_messages m on m.id=n.message_id where n.ticket_id=p_ticket and m.author_id is distinct from auth.uid()
 and n.message_number>coalesce((select message_number from private.ticket_reads where ticket_id=p_ticket and user_id=auth.uid()),0);
$$;
create function public.central_mark_read(p_code text,p_message uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare t public.tickets;n bigint;depth_ int;
begin
 select *into t from public.tickets where public_code=p_code;
 if t.id is null then raise exception 'central_access_denied'using errcode='42501';end if;
 if not private.central_customer(t.request_id)then
  depth_=private.permission_enter(t.organization_id,'central.read');perform private.central_ticket(p_code);perform private.permission_leave(depth_);
 end if;
 perform 1 from public.tickets where id=t.id for update;
 select message_number into n from private.ticket_message_numbers where message_id=p_message and ticket_id=t.id;
 if n is null then raise exception 'central_message_invalid'using errcode='22023';end if;
 insert into private.ticket_reads(ticket_id,user_id,message_number)values(t.id,auth.uid(),n)
 on conflict(ticket_id,user_id)do update set message_number=greatest(ticket_reads.message_number,excluded.message_number),read_at=clock_timestamp()
 where ticket_reads.message_number<excluded.message_number;
 return jsonb_build_object('unread_count',private.ticket_unread(t.id));
end;$$;
create function public.central_unread(p_org uuid default null)returns jsonb language plpgsql stable security definer set search_path=''as $$
begin
 if not private.is_active_user()then raise exception 'central_access_denied'using errcode='42501';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(x)from(select t.public_code code,t.organization_id,private.ticket_unread(t.id) unread_count from public.tickets t where(p_org is null or t.organization_id=p_org)and private.central_staff(t.organization_id)and private.journey_ticket_visible(t.id)and private.ticket_unread(t.id)>0)x),'[]'::jsonb));
end;$$;

alter table public.appointments add column attendance_revision integer not null default 1;
create table private.appointment_attendance (
 appointment_id uuid not null references public.appointments(id),schedule_revision integer not null,
 organization_id uuid not null references public.organizations(id),actor_id uuid not null references auth.users(id),
 starts_at timestamptz not null,ends_at timestamptz not null,confirmed_at timestamptz not null default clock_timestamp(),
 primary key(appointment_id,schedule_revision)
);
alter table private.appointment_attendance enable row level security;
alter table private.appointment_attendance force row level security;
revoke all on private.appointment_attendance from public,anon,authenticated,service_role;
create function private.attendance_schedule_guard()returns trigger language plpgsql set search_path=''as $$
begin new.attendance_revision=old.attendance_revision+case when new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.state is distinct from old.state then 1 else 0 end;return new;end;$$;
create trigger attendance_schedule_guard before update on public.appointments for each row execute function private.attendance_schedule_guard();
create function private.attendance_status(p_id uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('confirmed',true,'confirmed_at',r.confirmed_at,'schedule_revision',r.schedule_revision)from private.appointment_attendance r join public.appointments a on a.id=r.appointment_id where a.id=p_id and a.state='confirmed'and r.schedule_revision=a.attendance_revision;
$$;
create function public.consumer_confirm_attendance(p_code text,p_appointment text,p_schedule_revision integer)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;a public.appointments;
begin
 select *into q from public.quote_requests where public_code=p_code;
 if q.id is null or not private.central_customer(q.id,true)then raise exception 'request_access_denied'using errcode='42501';end if;
 select *into a from public.appointments where public_code=p_appointment and request_id=q.id and organization_id=q.organization_id for update;
 if a.id is null then raise exception 'request_access_denied'using errcode='42501';end if;
 if a.attendance_revision is distinct from p_schedule_revision then raise exception 'appointment_revision_conflict'using errcode='40001';end if;
 if a.kind<>'booking'or a.state<>'confirmed'or a.execution_state<>'scheduled'or a.starts_at<=now()then raise exception 'attendance_unavailable'using errcode='22023';end if;
 insert into private.appointment_attendance(appointment_id,schedule_revision,organization_id,actor_id,starts_at,ends_at)values(a.id,a.attendance_revision,a.organization_id,auth.uid(),a.starts_at,a.ends_at)on conflict do nothing;
 return private.attendance_status(a.id);
end;$$;

create table private.execution_checklist (
 id uuid primary key default extensions.gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 appointment_id uuid not null references public.appointments(id),title text not null check(length(btrim(title))between 1 and 200),
 done boolean not null default false,removed boolean not null default false,revision integer not null default 1,
 created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(appointment_id,id)
);
create index execution_checklist_appointment on private.execution_checklist(appointment_id,created_at,id);
create table private.execution_checklist_history (
 id uuid primary key default extensions.gen_random_uuid(),item_id uuid not null references private.execution_checklist(id),
 organization_id uuid not null references public.organizations(id),actor_id uuid not null references auth.users(id),
 action text not null,previous jsonb,current_value jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table private.execution_checklist enable row level security;alter table private.execution_checklist force row level security;
alter table private.execution_checklist_history enable row level security;alter table private.execution_checklist_history force row level security;
revoke all on private.execution_checklist,private.execution_checklist_history from public,anon,authenticated,service_role;
create function public.operations_checklist(p_org uuid,p_appointment uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare d jsonb;
begin
 d=public.operations_detail(p_org,p_appointment);
 return jsonb_build_object('can_edit',private.permission_allowed(p_org,'agenda.manage')and private.permission_role(p_org,auth.uid())<>'shared_attendant','items',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('updated_name',p.display_name)order by c.created_at,c.id)from private.execution_checklist c join public.profiles p on p.id=c.updated_by where c.appointment_id=p_appointment and c.organization_id=p_org and not c.removed),'[]'::jsonb));
end;$$;
create function public.operations_checklist_save(p_org uuid,p_appointment uuid,p_id uuid,p_revision integer,p_action text,p_title text,p_done boolean,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare d jsonb;c private.execution_checklist;old_ jsonb;r jsonb;prior jsonb;payload jsonb;
begin
 d=public.operations_checklist(p_org,p_appointment);
 if not coalesce((d->>'can_edit')::boolean,false)then raise exception 'access_denied'using errcode='42501';end if;
 perform 1 from public.appointments where id=p_appointment and organization_id=p_org for update;
 if not exists(select 1 from public.appointments where id=p_appointment and kind='booking'and state='confirmed'and execution_state<>'completed')then raise exception 'checklist_read_only'using errcode='22023';end if;
 payload=jsonb_build_array(p_appointment,p_id,p_revision,p_action,p_title,p_done);prior=private.consumer_idem(p_org,'execution_checklist',p_key,payload);if prior is not null then return prior;end if;
 if p_action='add'then
  if(select count(*)from private.execution_checklist where appointment_id=p_appointment and not removed)>=100 then raise exception 'checklist_limit'using errcode='22023';end if;
  insert into private.execution_checklist(organization_id,appointment_id,title,created_by,updated_by)values(p_org,p_appointment,btrim(p_title),auth.uid(),auth.uid())returning *into c;
 elsif p_action in('edit','toggle','remove')then
  select *into c from private.execution_checklist where id=p_id and organization_id=p_org and appointment_id=p_appointment for update;
  if c.id is null or c.removed then raise exception 'checklist_item_unavailable'using errcode='22023';end if;
  if c.revision is distinct from p_revision then raise exception 'checklist_revision_conflict'using errcode='40001';end if;
  old_=to_jsonb(c);
  update private.execution_checklist set title=case when p_action='edit'then btrim(p_title)else title end,done=case when p_action='toggle'then p_done else done end,removed=p_action='remove',revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp()where id=c.id returning *into c;
 else raise exception 'checklist_action_invalid'using errcode='22023';end if;
 insert into private.execution_checklist_history(item_id,organization_id,actor_id,action,previous,current_value)values(c.id,p_org,auth.uid(),p_action,old_,to_jsonb(c));
 r=to_jsonb(c);perform private.consumer_remember(p_org,'execution_checklist',p_key,payload,r);return r;
end;$$;

-- Media remains private, uses the existing 60-second, user-bound download tickets.
create function private.operations_attachment_access(p_request uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.appointments a where a.request_id=p_request and private.permission_allowed(a.organization_id,'agenda.read')and private.permission_role(a.organization_id,auth.uid())in('super_admin','admin_empresa','colaborador_empresa','own_attendant'));
$$;
create function public.operations_attachment_ticket(p_org uuid,p_appointment uuid,p_file text)returns jsonb language plpgsql security definer set search_path=''as $$
declare d jsonb;a public.attachments;secret_ text;
begin
 d=public.operations_detail(p_org,p_appointment);
 select *into a from public.attachments where public_code=p_file and organization_id=p_org and request_id=(d->'request'->>'id')::uuid and state='ready';
 if a.id is null or not private.operations_attachment_access(a.request_id)then raise exception 'attachment_access_denied'using errcode='42501';end if;
 secret_=encode(extensions.gen_random_bytes(32),'hex');insert into public.attachment_tickets(organization_id,attachment_id,user_id,token_hash,expires_at)values(p_org,a.id,auth.uid(),encode(extensions.digest(secret_,'sha256'),'hex'),now()+interval '60 seconds');return jsonb_build_object('ticket',secret_,'expires_in',60);
end;$$;

create function public.consumer_document(p_code text,p_kind text,p_reference text)returns jsonb language plpgsql security definer set search_path=''as $$
declare ctx jsonb;q public.quote_requests;v public.quote_versions;a public.appointments;brand_ jsonb;company_ jsonb;content_ jsonb;status_ text;
begin
 select *into q from public.quote_requests where public_code=p_code;
 if q.id is null then raise exception 'request_access_denied'using errcode='42501';end if;
 if private.central_customer(q.id)then ctx=public.consumer_request_context(p_code);else perform private.permission_require(q.organization_id,'quotes.values');ctx=public.operations_quote_context(q.organization_id,p_code);end if;
 select payload into company_ from public.consumer_publications where id=q.publication_id;
 brand_=ctx->'branding';
 if p_kind='quote'then
  select *into v from public.quote_versions where public_code=p_reference and request_id=q.id and state='sent';
  if v.id is null then raise exception 'document_unavailable'using errcode='42501';end if;
  status_=case when v.kind='estimate'then 'Estimativa inicial — não é proposta aprovada'when v.id=q.accepted_version_id then 'Proposta aprovada'when v.id is distinct from q.current_version_id then 'Versão anterior — substituída'when q.state='declined'then 'Proposta recusada'when v.expires_at<=now()then 'Proposta expirada'else 'Proposta enviada'end;
  content_=to_jsonb(v)-'created_by'-'id'-'organization_id'-'request_id'||jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.quantity,'unit_cents',i.unit_cents,'gross_cents',i.quantity::bigint*i.unit_cents,'discount_cents',i.discount_cents,'price_mode',i.price_mode,'note',i.public_note,'source_kind',i.source_kind)order by position)from public.quote_items i where i.version_id=v.id),'[]'::jsonb));
 elsif p_kind='appointment'then
  select *into a from public.appointments where public_code=p_reference and request_id=q.id and organization_id=q.organization_id;
  if a.id is null or a.kind<>'booking'or a.state<>'confirmed'then raise exception 'document_unavailable'using errcode='22023';end if;
  status_='Confirmado';content_=jsonb_build_object('code',a.public_code,'revision',a.revision,'starts_at',a.starts_at,'ends_at',a.starts_at+make_interval(mins=>coalesce(a.service_minutes,extract(epoch from(a.ends_at-a.starts_at))::int/60)),'execution_state',a.execution_state,'part_number',a.part_number,'services',coalesce((select jsonb_agg(x->>'name')from jsonb_array_elements(ctx->'requested_items')x),'[]'::jsonb),'instructions',(select customer_explanation from public.quote_versions where id=q.accepted_version_id));
 else raise exception 'document_unavailable'using errcode='22023';end if;
 return jsonb_build_object('kind',p_kind,'reference',p_reference,'request',p_code,'issued_at',clock_timestamp(),'status',status_,'company',jsonb_build_object('name',(select name from public.organizations where id=q.organization_id),'timezone',(select timezone from public.organizations where id=q.organization_id),'address',company_->>'address','regions',company_->>'regions'),'branding',brand_,'content',content_);
end;$$;

-- Contact is returned only after the existing quote scope and contact rules succeed.
create function public.operations_request_contact(p_org uuid,p_code text)returns jsonb language plpgsql security definer set search_path=''as $$
declare ctx jsonb;q public.quote_requests;phone_ text;
begin
 ctx=public.operations_quote_context(p_org,p_code);
 select *into q from public.quote_requests where organization_id=p_org and public_code=p_code;
 if coalesce((ctx->>'contact_authorized')::boolean,false)and public.company_attendant_permission(p_org,'whatsapp')then select whatsapp into phone_ from public.customers where id=q.customer_id;end if;
 return jsonb_build_object('phone',phone_,'company',ctx->'company'->>'name');
end;$$;

-- Definitions preserving the 048 guards follow below.

CREATE OR REPLACE FUNCTION public.consumer_create_request(p_slug text, p_revision text, p_service text, p_addons text[], p_answers jsonb, p_customer jsonb, p_notes text, p_contact boolean, p_expected_cents bigint, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.consumer_publications;calc jsonb;c public.customers;op uuid;q public.quote_requests;ver uuid;item jsonb;pos integer=0;payload jsonb;prior jsonb;result jsonb;
begin
 if p_customer ? 'whatsapp' then p_customer=jsonb_set(p_customer,'{whatsapp}',to_jsonb(private.contact_phone(p_customer->>'whatsapp')));end if; perform private.consumer_lock();v=private.consumer_publication(p_slug);
 perform private.company_keys(p_customer,array['name','whatsapp','email','notice_version','accepted_notice']);
 if p_customer->>'notice_version' is distinct from 'consumer-v1' or p_customer->>'accepted_notice' is distinct from 'true' or p_contact is null then raise exception 'notice_required' using errcode='22023';end if;
 payload=jsonb_build_object('slug',p_slug,'revision',p_revision,'service',p_service,'addons',p_addons,'answers',p_answers,'customer',p_customer,'notes',p_notes,'contact',p_contact,'expected',p_expected_cents);
 prior=private.consumer_idem(v.organization_id,'create_request',p_key,payload);if prior is not null then return prior;end if;
 if v.public_code is distinct from p_revision then raise exception 'published_price_changed' using errcode='40001';end if;
 calc=private.consumer_selection(v.id,p_service,p_addons,p_answers);
 if not (calc->>'quotes_allowed')::boolean and not (calc->>'direct_booking')::boolean then raise exception 'service_unavailable' using errcode='22023';end if;
 if (calc->>'total_cents')::bigint is distinct from p_expected_cents then raise exception 'price_mismatch' using errcode='22023';end if;
 if (select count(*) from public.quote_requests qr join public.customers x on x.id=qr.customer_id where x.user_id=auth.uid() and qr.created_at>now()-interval '1 hour')>=10 then raise exception 'request_rate_limit' using errcode='54000';end if;
 insert into public.customers(organization_id,user_id,name,whatsapp,email) values(v.organization_id,auth.uid(),btrim(p_customer->>'name'),p_customer->>'whatsapp',nullif(btrim(p_customer->>'email'),'')) on conflict(organization_id,user_id) do update set name=excluded.name,whatsapp=excluded.whatsapp,email=excluded.email returning * into c;
 insert into public.customer_consents(organization_id,customer_id,purpose,notice_version) values(v.organization_id,c.id,'request_processing','consumer-v1');
 if p_contact and not exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null) then insert into public.customer_consents(organization_id,customer_id,purpose,notice_version) values(v.organization_id,c.id,'request_contact','consumer-v1');end if;
 insert into public.opportunities(organization_id,customer_id,service_id) values(v.organization_id,c.id,(calc->>'service_id')::uuid) returning id into op;
 insert into public.quote_requests(organization_id,customer_id,opportunity_id,publication_id,service_id,service_code,addon_codes,answers,notes) values(v.organization_id,c.id,op,v.id,(calc->>'service_id')::uuid,p_service,p_addons,p_answers,coalesce(p_notes,'')) returning * into q;
 insert into public.quote_versions(organization_id,request_id,version,kind,price_mode,total_cents,duration_minutes,created_by) values(v.organization_id,q.id,1,'estimate',calc->>'price_mode',(calc->>'total_cents')::bigint,(calc->>'duration_minutes')::integer,auth.uid()) returning id into ver;
 for item in select x from jsonb_array_elements(calc->'items')x loop insert into public.quote_items(organization_id,version_id,position,name,quantity,unit_cents,price_mode,duration_minutes) values(v.organization_id,ver,pos,item->>'name',1,(item->>'unit_cents')::integer,item->>'price_mode',(item->>'duration_minutes')::integer);pos=pos+1;end loop;
 update public.quote_versions set state='sent' where id=ver;
 perform private.consumer_event(v.organization_id,q.id,'created');result=jsonb_build_object('code',q.public_code,'state',q.state);
 perform private.consumer_remember(v.organization_id,'create_request',p_key,payload,result);return result;
end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_create_multi_request(p_slug text, p_revision text, p_items jsonb, p_customer jsonb, p_notes text, p_contact boolean, p_expected_cents bigint, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p_service text; p_addons text[]; p_answers jsonb; v public.consumer_publications;calc jsonb;c public.customers;op uuid;q public.quote_requests;ver uuid;item jsonb;pos integer=0;payload jsonb;prior jsonb;result jsonb;
begin
 if p_customer ? 'whatsapp' then p_customer=jsonb_set(p_customer,'{whatsapp}',to_jsonb(private.contact_phone(p_customer->>'whatsapp')));end if; perform private.consumer_lock();v=private.consumer_publication(p_slug);
 perform private.company_keys(p_customer,array['name','whatsapp','email','notice_version','accepted_notice']);
 if p_customer->>'notice_version' is distinct from 'consumer-v1' or p_customer->>'accepted_notice' is distinct from 'true' or p_contact is null then raise exception 'notice_required' using errcode='22023';end if;
 payload=jsonb_build_object('slug',p_slug,'revision',p_revision,'items',p_items,'customer',p_customer,'notes',p_notes,'contact',p_contact,'expected',p_expected_cents);
 prior=private.consumer_idem(v.organization_id,'create_multi_request',p_key,payload);if prior is not null then return prior;end if;
 if v.public_code is distinct from p_revision then raise exception 'published_price_changed' using errcode='40001';end if;
 calc=private.consumer_multi_selection(v.id,p_items);p_service=p_items->0->>'service';p_addons=array(select jsonb_array_elements_text(p_items->0->'addons'));p_answers=p_items->0->'answers';
 if not (calc->>'quotes_allowed')::boolean and not (calc->>'direct_booking')::boolean then raise exception 'service_unavailable' using errcode='22023';end if;
 if (calc->>'total_cents')::bigint is distinct from p_expected_cents then raise exception 'price_mismatch' using errcode='22023';end if;
 if (select count(*) from public.quote_requests qr join public.customers x on x.id=qr.customer_id where x.user_id=auth.uid() and qr.created_at>now()-interval '1 hour')>=10 then raise exception 'request_rate_limit' using errcode='54000';end if;
 insert into public.customers(organization_id,user_id,name,whatsapp,email) values(v.organization_id,auth.uid(),btrim(p_customer->>'name'),p_customer->>'whatsapp',nullif(btrim(p_customer->>'email'),'')) on conflict(organization_id,user_id) do update set name=excluded.name,whatsapp=excluded.whatsapp,email=excluded.email returning * into c;
 insert into public.customer_consents(organization_id,customer_id,purpose,notice_version) values(v.organization_id,c.id,'request_processing','consumer-v1');
 if p_contact and not exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null) then insert into public.customer_consents(organization_id,customer_id,purpose,notice_version) values(v.organization_id,c.id,'request_contact','consumer-v1');end if;
 insert into public.opportunities(organization_id,customer_id,service_id) values(v.organization_id,c.id,(calc->>'service_id')::uuid) returning id into op;
 insert into public.quote_requests(organization_id,customer_id,opportunity_id,publication_id,service_id,service_code,addon_codes,answers,notes,requested_items,review_alerts) values(v.organization_id,c.id,op,v.id,(calc->>'service_id')::uuid,p_service,p_addons,p_answers,coalesce(p_notes,''),calc->'requested_items',calc->'review_alerts') returning * into q;
 insert into public.quote_versions(organization_id,request_id,version,kind,price_mode,total_cents,duration_minutes,created_by) values(v.organization_id,q.id,1,'estimate',calc->>'price_mode',(calc->>'total_cents')::bigint,(calc->>'duration_minutes')::integer,auth.uid()) returning id into ver;
 for item in select x from jsonb_array_elements(calc->'items')x loop insert into public.quote_items(organization_id,version_id,position,name,quantity,unit_cents,price_mode,duration_minutes) values(v.organization_id,ver,pos,item->>'name',1,(item->>'unit_cents')::integer,item->>'price_mode',(item->>'duration_minutes')::integer);pos=pos+1;end loop;
 update public.quote_versions set state='sent' where id=ver;
 perform private.consumer_event(v.organization_id,q.id,'created');result=jsonb_build_object('code',q.public_code,'state',q.state);
 perform private.consumer_remember(v.organization_id,'create_multi_request',p_key,payload,result);return result;
end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_start_help(p_slug text, p_revision text, p_items jsonb, p_customer jsonb, p_stage text, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.consumer_publications;c public.customers;calc jsonb;q public.quote_requests;op uuid;t public.tickets;prior jsonb;payload jsonb;r jsonb;begin
 if p_customer ? 'whatsapp' then p_customer=jsonb_set(p_customer,'{whatsapp}',to_jsonb(private.contact_phone(p_customer->>'whatsapp')));end if;
 perform private.consumer_lock();v=private.consumer_publication(p_slug);payload=jsonb_build_array(p_slug,p_revision,p_items,p_customer,p_stage);prior=private.consumer_idem(v.organization_id,'start_help',p_key,payload);if prior is not null then return prior;end if;
 if v.public_code<>p_revision then raise exception 'published_price_changed'using errcode='40001';end if;
 perform private.company_keys(p_customer,array['name','whatsapp','email','notice_version','accepted_notice']);
 if p_customer->>'accepted_notice'is distinct from 'true'or p_customer->>'notice_version'is distinct from 'consumer-v1'or p_stage is null or p_stage not in('services','details','customer','schedule','review')then raise exception 'notice_required'using errcode='22023';end if;
 calc=private.journey_selection(v.id,p_items,false);
 if(select count(*)from public.quote_requests r join public.customers x on x.id=r.customer_id where x.user_id=auth.uid()and r.created_at>now()-interval '1 hour')>=10 then raise exception 'request_rate_limit'using errcode='54000';end if;
 insert into public.customers(organization_id,user_id,name,whatsapp,email)values(v.organization_id,auth.uid(),btrim(p_customer->>'name'),p_customer->>'whatsapp',nullif(btrim(p_customer->>'email'),''))on conflict(organization_id,user_id)do update set name=excluded.name,whatsapp=excluded.whatsapp,email=excluded.email returning *into c;
 insert into public.customer_consents(organization_id,customer_id,purpose,notice_version)values(v.organization_id,c.id,'request_processing','consumer-v1');
 insert into public.opportunities(organization_id,customer_id,service_id)values(v.organization_id,c.id,(calc->>'service_id')::uuid)returning id into op;
 insert into public.quote_requests(organization_id,customer_id,opportunity_id,publication_id,service_id,service_code,help_only,help_context)values(v.organization_id,c.id,op,v.id,(calc->>'service_id')::uuid,p_items->0->>'service',true,jsonb_build_object('stage',p_stage,'items',p_items))returning *into q;
 t=private.central_open(q.id);if not(calc->>'direct_booking')::boolean then perform private.journey_route(t.id,'Dúvida sobre serviço que exige avaliação da empresa');end if;
 perform private.consumer_event(v.organization_id,q.id,'created');r=jsonb_build_object('code',q.public_code,'ticket',t.public_code);perform private.consumer_remember(v.organization_id,'start_help',p_key,payload,r);return r;end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_prepare_help_request(p_code text, p_items jsonb, p_notes text, p_contact boolean, p_expected_cents bigint, p_key uuid, p_customer jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;c jsonb;v uuid;i jsonb;pos integer=0;r jsonb;payload jsonb;prior jsonb;begin
 if p_customer ? 'whatsapp' then p_customer=jsonb_set(p_customer,'{whatsapp}',to_jsonb(private.contact_phone(p_customer->>'whatsapp')));end if;
 perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_items,p_notes,p_contact,p_expected_cents,p_customer);prior=private.consumer_idem(q.organization_id,'prepare_help',p_key,payload);if prior is not null then return prior;end if;
 if q.state<>'draft'or not q.help_only then raise exception 'request_state_changed'using errcode='22023';end if;
 if not exists(select 1 from public.consumer_pages where organization_id=q.organization_id and enabled and publication_id=q.publication_id)then raise exception 'published_price_changed'using errcode='40001';end if;
 c=private.consumer_multi_selection(q.publication_id,p_items);if(c->>'total_cents')::bigint is distinct from p_expected_cents then raise exception 'price_mismatch'using errcode='22023';end if;
 if p_contact is null then raise exception 'notice_required'using errcode='22023';end if; if p_customer is not null then perform private.company_keys(p_customer,array['name','whatsapp','email','accepted_notice','notice_version']);if p_customer->>'accepted_notice'is distinct from 'true'or p_customer->>'notice_version'is distinct from 'consumer-v1'then raise exception 'notice_required'using errcode='22023';end if;update public.customers set name=btrim(p_customer->>'name'),whatsapp=p_customer->>'whatsapp',email=nullif(btrim(p_customer->>'email'),'')where id=q.customer_id;end if;
 update public.quote_requests set requested_items=c->'requested_items',review_alerts=c->'review_alerts',service_id=(c->>'service_id')::uuid,service_code=p_items->0->>'service',addon_codes=array(select jsonb_array_elements_text(p_items->0->'addons')),answers=p_items->0->'answers',notes=coalesce(p_notes,''),help_only=false,revision=revision+1 where id=q.id;
 insert into public.quote_versions(organization_id,request_id,version,kind,price_mode,total_cents,duration_minutes,created_by)values(q.organization_id,q.id,1,'estimate',c->>'price_mode',(c->>'total_cents')::bigint,(c->>'duration_minutes')::integer,auth.uid())returning id into v;
 for i in select value from jsonb_array_elements(c->'items')loop insert into public.quote_items(organization_id,version_id,position,name,quantity,unit_cents,price_mode,duration_minutes)values(q.organization_id,v,pos,i->>'name',1,(i->>'unit_cents')::integer,i->>'price_mode',(i->>'duration_minutes')::integer);pos=pos+1;end loop;
 update public.quote_versions set state='sent'where id=v;
 if p_contact and not exists(select 1 from public.customer_consents where customer_id=q.customer_id and purpose='request_contact'and revoked_at is null)then insert into public.customer_consents(organization_id,customer_id,purpose,notice_version)values(q.organization_id,q.customer_id,'request_contact','consumer-v1');end if;
 r=jsonb_build_object('code',p_code);perform private.consumer_remember(q.organization_id,'prepare_help',p_key,payload,r);return r;end;$function$;

CREATE OR REPLACE FUNCTION public.central_consumer_thread(p_request text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE q public.quote_requests;t public.tickets;ready_ boolean;message_ text;
BEGIN
 SELECT * INTO q FROM public.quote_requests WHERE public_code=p_request;
 IF q.id IS NULL OR NOT private.central_customer(q.id) THEN RAISE EXCEPTION 'request_access_denied' USING errcode='42501'; END IF;
 SELECT * INTO t FROM public.tickets WHERE request_id=q.id ORDER BY created_at DESC,id DESC LIMIT 1;
 ready_=private.assisted_ready(q.organization_id);
 IF private.entitlement(q.organization_id,'human_support') THEN
   SELECT CASE WHEN availability_mode='scheduled' AND NOT coalesce(private.assisted_open(),false) THEN outside_message
     ELSE 'Recebemos sua mensagem. A equipe responsável responderá assim que estiver disponível.' END INTO message_
   FROM private.assisted_policy;
 END IF;
 RETURN jsonb_build_object('shared_open',ready_,'shared_message',message_,
   'available',EXISTS(SELECT 1 FROM public.company_settings WHERE organization_id=q.organization_id AND(human_enabled OR private.people_solo_conversation(q.organization_id))),
   'code',t.public_code,'state',t.state,'can_send',private.central_customer(q.id,true),
   'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'number',private.message_number(m.id),'mine',m.author_id=auth.uid(),'kind',m.kind,'name',m.author_name,'body',m.body,'at',m.created_at) ORDER BY private.message_number(m.id)) FROM public.ticket_messages m WHERE m.ticket_id=t.id),'[]'));
END;$function$;

CREATE OR REPLACE FUNCTION private.v029_central_context(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets;q public.quote_requests;m public.manual_versions;s public.central_settings;ctx jsonb;
begin t=private.central_ticket(p_code);select * into q from public.quote_requests where id=t.request_id;select v.* into m from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id and v.organization_id=cs.organization_id where cs.organization_id=t.organization_id and v.status='published';select * into s from public.central_settings where organization_id=t.organization_id;
 ctx=private.central_request_context_core(q.public_code);
 return jsonb_build_object('ticket',to_jsonb(t),'request',ctx,'me',auth.uid(),'admin',private.company_can_manage(t.organization_id),'can_request_photos',private.journey_company_actor(t.organization_id,auth.uid())and private.permission_allowed(t.organization_id,'central.reply'),'can_price',private.journey_can_price(t.organization_id),'operator_name',(select display_name from public.profiles where id=auth.uid()),
 'organization',(select jsonb_build_object('id',id,'name',name,'slug',slug,'timezone',timezone) from public.organizations where id=t.organization_id),
 'customer',jsonb_build_object('name',(select name from public.customers where id=t.customer_id),'whatsapp',case when(ctx->>'contact_authorized')::boolean and public.company_attendant_permission(t.organization_id,'whatsapp')then (select whatsapp from public.customers where id=t.customer_id) end,'request_count',(select count(*) from public.quote_requests where customer_id=t.customer_id),'previous_requests',coalesce((select jsonb_agg(jsonb_build_object('code',public_code,'state',state,'created_at',created_at)) from(select public_code,state,created_at from public.quote_requests where customer_id=t.customer_id and id<>q.id order by created_at desc limit 5) recent),'[]'::jsonb)),
 'customer_context',case when coalesce(s.share_customer_context,false) or private.company_can_manage(t.organization_id) then(select jsonb_build_object('tags',tags,'preferred_time',preferred_time,'operational_note',operational_note,'origin_context',origin_context) from public.customer_context where customer_id=t.customer_id) else null end,
 'origin',(select jsonb_build_object('source',source,'detail',source_detail) from public.opportunity_context where opportunity_id=q.opportunity_id),
 'manual',jsonb_build_object('id',m.id,'version',m.version,'title',m.title,'snapshot',m.snapshot,'sections',coalesce((select jsonb_agg(jsonb_build_object('key',section_key,'content',content) order by section_key) from public.manual_sections where manual_id=m.id),'[]'::jsonb)),
 'permissions',coalesce((select jsonb_object_agg(action,public.company_attendant_permission(t.organization_id,action)) from unnest(array['price_list','quote_create','quote_send','schedule','reschedule','cancel','whatsapp']) action),'{}'::jsonb),
 'settings',coalesce(to_jsonb(s),jsonb_build_object('revision',1,'quick_reply_edit',false,'share_customer_context',false)),
 'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'kind',a.kind)) from (select user_id,kind::text kind from public.attendant_organizations where organization_id=t.organization_id union select user_id,'own' from public.organization_members where organization_id=t.organization_id and is_attendant) a join public.profiles p on p.id=a.user_id where private.central_eligible(t.organization_id,p.id)and(t.routing_scope<>'company'or private.journey_company_actor(t.organization_id,p.id))),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'number',private.message_number(id),'mine',author_id=auth.uid(),'kind',kind,'name',author_name,'body',body,'at',created_at) order by private.message_number(id)) from public.ticket_messages where ticket_id=t.id),'[]'::jsonb),
 'notes',coalesce((select jsonb_agg(jsonb_build_object('body',n.body,'author',p.display_name,'at',n.created_at) order by n.created_at,n.id) from public.ticket_notes n join public.profiles p on p.id=n.author_id where ticket_id=t.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'author',p.display_name,'from',e.from_assignee,'to',e.to_assignee,'state',e.state,'at',e.created_at) order by e.created_at,e.id) from public.ticket_events e left join public.profiles p on p.id=e.actor_id where ticket_id=t.id),'[]'::jsonb),
 'escalations',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'summary',summary,'question',question,'response',response,'at',created_at,'responded_at',responded_at) order by created_at desc) from public.ticket_escalations where ticket_id=t.id),'[]'::jsonb),
 'financial',jsonb_build_object('operational',false,'label','Preparação: nenhum pagamento processado pela Central','records',coalesce((select jsonb_agg(jsonb_build_object('status',status,'origin',origin,'confirmation_method',confirmation_method,'amount_cents',amount_cents,'confirmed_cents',confirmed_cents)) from public.payments where request_id=q.id),'[]'::jsonb)));
end;$function$;

CREATE OR REPLACE FUNCTION public.central_queue(p_org uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_state text DEFAULT NULL::text, p_mine boolean DEFAULT false, p_offset integer DEFAULT 0, p_view text DEFAULT 'all'::text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin if not private.is_active_user() then raise exception 'central_access_denied' using errcode='42501';end if;
 if coalesce(p_view,'all') not in ('all','general','company','resolved') then raise exception 'invalid_view' using errcode='22023';end if;
 if length(coalesce(p_search,''))>120 then raise exception 'invalid_search' using errcode='22023';end if;
 result=jsonb_build_object('me',auth.uid(),'name',(select display_name from public.profiles where id=auth.uid()),'presence',coalesce((select presence from public.work_sessions where user_id=auth.uid() and ended_at is null),'offline'),
 'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.organizations where private.central_staff(id)),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(x order by case x->>'sla' when 'overdue' then 2 when 'attention' then 1 else 0 end desc,(x->>'priority')::integer desc,x->>'waiting_since',x->>'code') from (
 select jsonb_build_object('code',t.public_code,'unread_count',private.ticket_unread(t.id),'organization_id',t.organization_id,'company',o.name,'customer',c.name,'service',coalesce((select item->>'name' from public.consumer_publications pub cross join lateral jsonb_array_elements(pub.payload->'services') item where pub.id=q.publication_id and item->>'code'=q.service_code),'Serviço'),'source',coalesce(oc.source,'direct'),'request',q.public_code,'routing_scope',t.routing_scope,'routing_reason',t.routing_reason,'desired_start',q.desired_start,'request_state',q.state,'state',t.state,'revision',t.revision,'assignee',t.assignee_id,'assignee_name',pr.display_name,'owner_valid',private.central_eligible(t.organization_id,t.assignee_id),'priority',t.priority,'next_action',t.next_action,'due_at',t.next_due_at,'waiting_since',t.waiting_since,'last_customer_at',t.last_customer_at,'last_staff_at',t.last_staff_at,'created_at',t.created_at,'resolved_at',t.resolved_at,
 'sla',case when t.state in ('resolved','closed','waiting_customer') then 'normal' when t.next_due_at<=now() or(t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.response_minutes)) then 'overdue' when t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.attention_minutes) then 'attention' else 'normal' end,
 'appointment',(select min(starts_at) from public.appointments where request_id=t.request_id and state='confirmed' and starts_at>=now()),'appointment_today',exists(select 1 from public.appointments a where a.request_id=t.request_id and a.state='confirmed' and (a.starts_at at time zone o.timezone)::date=(now() at time zone o.timezone)::date)) x
 from public.tickets t join public.organizations o on o.id=t.organization_id join public.customers c on c.id=t.customer_id join public.quote_requests q on q.id=t.request_id join public.services sv on sv.id=q.service_id left join public.profiles pr on pr.id=t.assignee_id left join public.central_settings s on s.organization_id=o.id left join public.opportunity_context oc on oc.opportunity_id=q.opportunity_id
 where private.central_staff(t.organization_id) and private.journey_ticket_visible(t.id) and(p_org is null or t.organization_id=p_org) and(p_state is null or t.state=p_state) and(p_date is null or (t.created_at at time zone o.timezone)::date=p_date) and(coalesce(p_view,'all')='all' or (p_view='general' and t.state not in ('resolved','closed') and (t.assignee_id is null or not private.central_eligible(t.organization_id,t.assignee_id))) or (p_view='company' and t.state='waiting_company') or (p_view='resolved' and t.state='resolved' and t.resolved_at>now()-interval '7 days')) and(not coalesce(p_mine,false) or t.assignee_id=auth.uid()) and (p_search is null or p_search='' or concat_ws(' ',c.name,o.name,t.public_code,(select item->>'name' from public.consumer_publications pub cross join lateral jsonb_array_elements(pub.payload->'services') item where pub.id=q.publication_id and item->>'code'=q.service_code),oc.source,pr.display_name) ilike '%'||p_search||'%') and(t.state<>'closed' or t.closed_at>now()-interval '7 days') order by case when t.state in ('resolved','closed','waiting_customer') then 0 when t.next_due_at<=now() or(t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.response_minutes)) then 2 when t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.attention_minutes) then 1 else 0 end desc,t.priority desc,t.waiting_since,t.id limit 101 offset greatest(coalesce(p_offset,0),0)) items),'[]'::jsonb));
 result=result||jsonb_build_object('has_more',jsonb_array_length(result->'tickets')>100,'offset',greatest(coalesce(p_offset,0),0));
 return jsonb_set(result,'{tickets}',coalesce((select jsonb_agg(value) from jsonb_array_elements(result->'tickets') with ordinality where ordinality<=100),'[]'::jsonb));end;$function$;

CREATE OR REPLACE FUNCTION private.central_request_context_core(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;c public.customers;
begin select * into q from public.quote_requests where public_code=p_code;select * into c from public.customers where id=q.customer_id and organization_id=q.organization_id;
 return jsonb_build_object('desired_periods',q.desired_periods,'execution',private.execution_request_policy(q),'journey',q.journey,'desired_start',q.desired_start,'help_only',q.help_only,'photo_request',q.photo_request,'photos_received',exists(select 1 from public.attachments where request_id=q.id and state='ready'and created_at>=q.photo_requested_at),'booking',private.consumer_booking_status(q),'branding',(select pub.payload->'branding'from public.consumer_pages page join public.consumer_publications pub on pub.id=page.publication_id where page.organization_id=q.organization_id),'code',q.public_code,'state',q.state,'revision',q.revision,'name',c.name,'notes',q.notes,'requested_items',private.consumer_requested_items(q),'review_alerts',q.review_alerts,'can_manage',private.consumer_access(q.id,true),'is_owner',c.user_id=auth.uid(),'company',(select jsonb_build_object('name',name,'slug',slug) from public.organizations where id=q.organization_id),'current_version',(select public_code from public.quote_versions where id=q.current_version_id),'accepted_version',(select public_code from public.quote_versions where id=q.accepted_version_id),
 'answers',coalesce((select jsonb_agg(jsonb_build_object('label',f->>'label','answer',q.answers->(f->>'code'))) from public.consumer_publications cp cross join lateral jsonb_array_elements(cp.payload->'services') sv cross join lateral jsonb_array_elements(sv->'questions') f where cp.id=q.publication_id and sv->>'code'=q.service_code),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(jsonb_build_object('code',v.public_code,'version',v.version,'kind',v.kind,'desired_start',v.desired_start,'subtotal_cents',coalesce(v.subtotal_cents,v.total_cents),'discount_cents',v.discount_cents,'customer_explanation',v.customer_explanation,'price_mode',v.price_mode,'total_cents',v.total_cents,'execution_mode',v.execution_mode,'execution_max_periods',v.execution_max_periods,'duration_minutes',v.duration_minutes,'expires_at',v.expires_at,'created_at',v.created_at,'items',(select jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.quantity,'unit_cents',i.unit_cents,'price_mode',i.price_mode,'duration_minutes',i.duration_minutes,'discount_cents',i.discount_cents,'source_kind',i.source_kind,'source_code',i.source_code,'public_note',i.public_note) order by i.position) from public.quote_items i where i.version_id=v.id)) order by v.version desc) from public.quote_versions v where v.request_id=q.id and v.state='sent'),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'attendance_revision',a.attendance_revision,'attendance',private.attendance_status(a.id),'starts_at',a.starts_at,'ends_at',a.ends_at,'state',a.state,'execution_group',a.execution_group,'part_number',a.part_number,'service_minutes',a.service_minutes,'work_end',case when a.service_minutes is not null then a.starts_at+make_interval(mins=>a.service_minutes)else a.ends_at end,'execution_state',a.execution_state) order by a.created_at desc) from public.appointments a where a.request_id=q.id),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'mime',a.mime,'size_bytes',a.size_bytes,'state',a.state,'service',a.service_code) order by a.created_at) from public.attachments a where a.request_id=q.id and (a.state='ready' or(a.state='pending' and a.expires_at>now()))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',event,'at',created_at) order by created_at,id) from public.request_events where request_id=q.id),'[]'::jsonb),
 'contact_authorized',exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null));
end;$function$;

CREATE OR REPLACE FUNCTION public.operations_detail(p_org uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare org_ uuid;depth_ int;result_ jsonb; begin org_=p_org;depth_=private.permission_enter(org_,'agenda.read');result_=private.v029_operations_detail(p_org,p_id);result_=result_||jsonb_build_object('attendance',private.attendance_status(p_id),'attachments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'service',a.service_code,'mime',a.mime,'created_at',a.created_at)order by a.created_at)from public.attachments a where a.request_id=(result_->'request'->>'id')::uuid and a.organization_id=p_org and a.state='ready'and private.operations_attachment_access(a.request_id)),'[]'::jsonb));result_=private.permission_projection(org_,'operations_detail',result_);perform private.permission_leave(depth_);return result_;end;$function$;

CREATE OR REPLACE FUNCTION public.operations_agenda(p_org uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare org_ uuid;depth_ int;result_ jsonb; begin org_=p_org;depth_=private.permission_enter(org_,'agenda.read');result_=private.v029_operations_agenda(p_org,p_from,p_to);result_=jsonb_set(result_,'{appointments}',coalesce((select jsonb_agg(v||jsonb_build_object('attendance',private.attendance_status((v->>'id')::uuid)))from jsonb_array_elements(result_->'appointments')v),'[]'::jsonb));result_=private.permission_projection(org_,'operations_agenda',result_);perform private.permission_leave(depth_);return result_;end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_gateway_attachment(p_code text, p_user uuid, p_write boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.attachments;q public.quote_requests;
begin perform pg_advisory_xact_lock(734921501);perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'session_id',case when auth.uid()=p_user then auth.jwt()->>'session_id' else null end)::text,true);
 select * into a from public.attachments where public_code=p_code;
 if a.id is null or not (private.consumer_access(a.request_id,p_write) or(not p_write and (private.central_attachment_access(a.request_id)or private.operations_attachment_access(a.request_id)))) then raise exception 'attachment_access_denied' using errcode='42501';end if;
 select * into q from public.quote_requests where id=a.request_id;
 if p_write and exists(select 1 from public.appointments where request_id=q.id and state='confirmed')then raise exception 'upload_expired_or_closed'using errcode='22023';end if;
 if p_write and (a.state not in ('pending','ready') or(a.state='pending' and a.expires_at<=now()) or q.state not in('draft','submitted','under_review','quoted','declined') or a.uploaded_by<>p_user) then raise exception 'upload_expired_or_closed' using errcode='22023';end if;
 if not p_write and a.state<>'ready' then raise exception 'attachment_not_ready' using errcode='22023';end if;
 return jsonb_build_object('path',a.object_path,'mime',a.mime,'size',a.size_bytes,'state',a.state);
end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_reserve_attachment(p_code text, p_mime text, p_size integer, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;a public.attachments;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_mime,p_size);prior=private.consumer_idem(q.organization_id,'reserve_attachment',p_key,payload);if prior is not null then return prior;end if;
 if exists(select 1 from public.appointments where request_id=q.id and state='confirmed')then raise exception 'attachments_closed'using errcode='22023';end if;
 if q.state not in('draft','submitted','under_review','quoted','declined') then raise exception 'attachments_closed' using errcode='22023';end if;
 if (select count(*) from public.attachments where request_id=q.id and (state='ready' or(state='pending' and expires_at>now())))>=5 then raise exception 'attachment_limit' using errcode='22023';end if;
 insert into public.attachments(organization_id,request_id,uploaded_by,object_path,mime,size_bytes) values(q.organization_id,q.id,auth.uid(),q.organization_id::text||'/'||q.id::text||'/'||gen_random_uuid()::text,p_mime,p_size) returning * into a;
 r=jsonb_build_object('code',a.public_code);perform private.consumer_remember(q.organization_id,'reserve_attachment',p_key,payload,r);return r;
end;$function$;

CREATE OR REPLACE FUNCTION private.central_attachment_access(p_request uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.tickets where request_id=p_request and private.central_staff(organization_id) and private.journey_ticket_visible(id));
$function$;

revoke all on function private.message_number(uuid),private.message_number_assign(),private.ticket_unread(uuid),private.attendance_schedule_guard(),private.attendance_status(uuid),private.operations_attachment_access(uuid) from public,anon,authenticated,service_role;
revoke all on function public.central_mark_read(text,uuid),public.central_unread(uuid),public.consumer_confirm_attendance(text,text,integer),public.operations_checklist(uuid,uuid),public.operations_checklist_save(uuid,uuid,uuid,integer,text,text,boolean,uuid),public.operations_attachment_ticket(uuid,uuid,text),public.consumer_document(text,text,text),public.operations_request_contact(uuid,text) from public,anon;
grant execute on function public.central_mark_read(text,uuid),public.central_unread(uuid),public.consumer_confirm_attendance(text,text,integer),public.operations_checklist(uuid,uuid),public.operations_checklist_save(uuid,uuid,uuid,integer,text,text,boolean,uuid),public.operations_attachment_ticket(uuid,uuid,text),public.consumer_document(text,text,text),public.operations_request_contact(uuid,text) to authenticated;
commit;
