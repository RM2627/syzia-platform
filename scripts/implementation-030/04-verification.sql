create function private.document_normalize(p_kind text,p_document text) returns text language plpgsql immutable set search_path='' as $$
declare d text;i int;j int;n int;s int;v int;weight int;begin
 if p_document is null or length(p_document)>32 or p_document!~'^[A-Za-z0-9 ./-]+$' then return null;end if;
 d=upper(regexp_replace(p_document,'[ ./-]','','g'));
 if p_kind='CPF' then
 if d!~'^[0-9]{11}$' or d=repeat(left(d,1),11)then return null;end if;
 for n in 9..10 loop s=0;for i in 1..n loop s=s+substring(d,i,1)::int*(n+2-i);end loop;v=11-(s%11);if v>=10 then v=0;end if;if substring(d,n+1,1)::int<>v then return null;end if;end loop;
 elsif p_kind='CNPJ' then
 if d!~'^[A-Z0-9]{12}[0-9]{2}$'or d=repeat(left(d,1),14)then return null;end if;
 -- RFB algorithm: ASCII value minus 48, weights 2..9 from right to left; old numeric CNPJs remain valid.
 for n in 12..13 loop s=0;weight=2;for i in reverse n..1 loop s=s+(ascii(substring(d,i,1))-48)*weight;weight=case when weight=9 then 2 else weight+1 end;end loop;v=11-(s%11);if v>=10 then v=0;end if;if substring(d,n+1,1)::int<>v then return null;end if;end loop;
 else return null;end if;return d;
end;$$;
create function private.verification_new_org() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.organization_verifications(organization_id)values(new.id)on conflict do nothing;return new;end;$$;
create trigger verification_new_org after insert on public.organizations for each row execute function private.verification_new_org();
create function private.verification_first_admin() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.role='admin_empresa' and not exists(select 1 from private.enterprise_accounts where organization_id=new.organization_id and role='admin_empresa' and activated_at is not null)and not private.support_responsible(new.organization_id)then
 update private.organization_verifications set required=true,state=case when state='legacy'then 'pending'else state end where organization_id=new.organization_id;end if;return new;end;$$;
create trigger verification_first_admin before insert on private.enterprise_accounts for each row execute function private.verification_first_admin();
create function private.verification_administrator(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.access_base_active() and private.access_session_valid(false) and private.access_scope(p_org) and private.legal_ready(p_org) and exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.role='admin_empresa' and m.status='active' and o.status='active');$$;
create function public.access_verification_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare v private.organization_verifications;why text;begin
 if not private.verification_administrator(p_org) and not (private.has_global_role('super_admin')and private.access_scope(p_org))then raise exception 'access_denied' using errcode='42501';end if;
 select * into v from private.organization_verifications where organization_id=p_org;why=private.trial_eligibility(p_org);
 return jsonb_build_object('state',v.state,'required',v.required,'kind',v.kind,'masked',v.masked,'revision',v.revision,'eligibility',case when private.internal_exemption(p_org)is not null then 'not_applicable' when why='eligible'then 'eligible' when why in('previous_grant','previous_identity')then 'unavailable'else 'review_required'end,'verified_at',v.verified_at,'basis','structure_and_internal_history');
end;$$;
create function public.access_verify_document(p_org uuid,p_kind text,p_document text,p_revision int,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d text;fp bytea;v private.organization_verifications;prior private.verification_commands;k text;why text;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);
 if not private.verification_administrator(p_org)then raise exception 'access_denied' using errcode='42501';end if;
 d=private.document_normalize(p_kind,p_document);if d is null or p_key is null then raise exception 'document_invalid' using errcode='22023';end if;
 fp=private.trial_fingerprint('registration','BR:'||p_kind||':'||d);
 select * into prior from private.verification_commands where organization_id=p_org and actor_id=auth.uid() and key=p_key;
 if found then if prior.fingerprint<>fp then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 select * into v from private.organization_verifications where organization_id=p_org for update;
 if v.revision is distinct from p_revision then raise exception 'verification_revision_conflict' using errcode='40001';end if;
 if v.state='verified' and v.fingerprint is distinct from fp then raise exception 'verification_review_required';end if;
 if not exists(select 1 from private.organization_exemptions where organization_id=p_org and state='active') then
 foreach k in array case when p_kind='CPF'then array['business','responsible']else array['business']end loop
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref) values(p_org,k,private.trial_fingerprint(k,'BR:'||p_kind||':'||d),auth.uid(),'self_declared_structure_030')on conflict do nothing;
 insert into private.trial_claims select id,k,private.trial_fingerprint(k,'BR:'||p_kind||':'||d)from private.trial_grants where organization_id=p_org on conflict do nothing;
 end loop;
 insert into private.trial_consumed_keys select distinct on(c.kind,c.fingerprint)c.kind,c.fingerprint,c.grant_id from private.trial_claims c join private.trial_grants g on g.id=c.grant_id where g.organization_id=p_org order by c.kind,c.fingerprint,c.grant_id on conflict do nothing;
 end if;
 why=private.trial_eligibility(p_org);
 update private.organization_verifications set state=case when why in('manual_policy','previous_review')then 'review'else 'verified'end,kind=p_kind,masked=case when p_kind='CPF'then '***.***.***-'else '**.***.***/****-'end||right(d,2),fingerprint=fp,verified_by=auth.uid(),verified_at=clock_timestamp(),revision=revision+1 where organization_id=p_org;
 perform private.access_audit(p_org,auth.uid(),'registration_structure_checked',p_org);
 r=public.access_verification_context(p_org);insert into private.verification_commands values(p_org,auth.uid(),p_key,fp,r);return r;
end;$$;
create function public.access_verification_review(p_org uuid,p_revision int,p_approve boolean,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('global');
 if p_approve is null or p_reason is null or length(btrim(p_reason))not between 15 and 500 then raise exception 'verification_reason_required';end if;
 update private.organization_verifications set state=case when p_approve then 'verified'else 'review'end,review_reason=btrim(p_reason),verified_by=auth.uid(),verified_at=clock_timestamp(),revision=revision+1 where organization_id=p_org and revision=p_revision and fingerprint is not null;
 if not found then raise exception 'verification_revision_conflict' using errcode='40001';end if;
 perform private.access_audit(p_org,auth.uid(),case when p_approve then 'registration_review_approved'else 'registration_review_retained'end,p_org);
 return public.access_verification_context(p_org);
end;$$;
-- Normal sessions remain valid while legal/document onboarding is pending, but operation is gated separately.
create or replace function public.access_session(p_activity boolean default false,p_logout boolean default false)returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.enterprise_sessions;begin
 if p_logout then update private.enterprise_sessions set revoked=true where user_id=auth.uid()and session_id::text=auth.jwt()->>'session_id';return '{}'::jsonb;end if;
 if auth.uid()is null then raise exception 'session_expired'using errcode='42501';end if;
 if not private.access_base_active()then raise exception 'account_inactive'using errcode='42501';end if;
 select * into s from private.enterprise_sessions where user_id=auth.uid()and session_id::text=auth.jwt()->>'session_id';
 if s.organization_id is not null and exists(select 1 from public.organizations where id=s.organization_id and status<>'active')then raise exception 'organization_suspended'using errcode='42501';end if;
 if not private.access_session_valid(false)then raise exception 'session_expired'using errcode='42501';end if;
 if p_activity then update private.enterprise_sessions set last_activity=clock_timestamp()where session_id=s.session_id returning * into s;end if;
 return jsonb_build_object('idle_seconds',(select idle_seconds from private.access_policy),'warning_seconds',(select warning_seconds from private.access_policy),'last_activity',s.last_activity,'organization_id',s.organization_id,'organization_name',(select name from public.organizations where id=s.organization_id),
 'legal_required',s.organization_id is not null and not private.legal_ready(s.organization_id),'verification_required',s.organization_id is not null and not private.verification_ready(s.organization_id),
 'can_accept',exists(select 1 from public.organization_members where organization_id=s.organization_id and user_id=auth.uid()and role='admin_empresa'and status='active'));
end;$$;
-- An unverified new responsible ADM does not prematurely terminate VIRELOQ management.
do $$declare d text;begin
 d=pg_get_functiondef('private.support_responsible(uuid,uuid)'::regprocedure);d=replace(d,'select exists(select 1','select private.verification_ready(p_org) and exists(select 1');execute d;
 d=pg_get_functiondef('private.is_org_admin(uuid)'::regprocedure);d=replace(d,'select private.access_base_admin(p_org)','select private.verification_ready(p_org) and private.access_base_admin(p_org)');execute d;
end;$$;
