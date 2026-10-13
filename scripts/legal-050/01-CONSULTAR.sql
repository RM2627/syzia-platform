-- Read-only. Run as database owner; contains counts/hashes, no acceptance identities.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SELECT jsonb_build_object(
 'contract_sha256',encode(sha256(convert_to(
 pg_get_functiondef('private.legal_immutable()'::regprocedure)||
 pg_get_functiondef('private.legal_ready(uuid)'::regprocedure)||
 pg_get_functiondef('public.access_legal_accept(text,text)'::regprocedure), 'UTF8')),'hex'),
 'current',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',d.kind,'version',d.version,
 'acceptance_version',d.acceptance_version,'row_sha256',encode(sha256(convert_to((to_jsonb(d)-'current')::text,'UTF8')),'hex')) ORDER BY d.kind)
 FROM public.legal_documents d WHERE d.current),'[]'::jsonb),
 'acceptances_count',(SELECT count(*) FROM private.legal_acceptances),
 'organizations_requiring_acceptance',(SELECT count(*) FROM private.enterprise_codes WHERE legal_required),
 'organizations_with_legacy_exemption',(SELECT count(*) FROM public.organizations o
 WHERE NOT EXISTS(SELECT 1 FROM private.enterprise_codes c WHERE c.organization_id=o.id AND c.legal_required)),
 'rls',(SELECT jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity))
 FROM pg_class c WHERE c.oid IN ('public.legal_documents'::regclass,'private.legal_acceptances'::regclass))
) AS legal_snapshot;
COMMIT;
