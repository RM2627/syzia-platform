// Offline SQL generation only. No database connection and no credentials.
export const rowHash = `encode(sha256(convert_to((to_jsonb(d)-'current')::text,'UTF8')),'hex')`;
export const contractHash = `encode(sha256(convert_to(
 pg_get_functiondef('private.legal_immutable()'::regprocedure)||
 pg_get_functiondef('private.legal_ready(uuid)'::regprocedure)||
 pg_get_functiondef('public.access_legal_accept(text,text)'::regprocedure), 'UTF8')),'hex')`;
export const inspectSQL = `-- Read-only. Run as database owner; contains counts/hashes, no acceptance identities.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SELECT jsonb_build_object(
 'contract_sha256',${contractHash},
 'current',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',d.kind,'version',d.version,
 'acceptance_version',d.acceptance_version,'row_sha256',${rowHash}) ORDER BY d.kind)
 FROM public.legal_documents d WHERE d.current),'[]'::jsonb),
 'acceptances_count',(SELECT count(*) FROM private.legal_acceptances),
 'organizations_requiring_acceptance',(SELECT count(*) FROM private.enterprise_codes WHERE legal_required),
 'organizations_with_legacy_exemption',(SELECT count(*) FROM public.organizations o
 WHERE NOT EXISTS(SELECT 1 FROM private.enterprise_codes c WHERE c.organization_id=o.id AND c.legal_required)),
 'rls',(SELECT jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity))
 FROM pg_class c WHERE c.oid IN ('public.legal_documents'::regclass,'private.legal_acceptances'::regclass))
) AS legal_snapshot;
COMMIT;
`;
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
function safeDo(sql) {
  const start = sql.indexOf("DO $legal050$\n"),
    end = sql.lastIndexOf("END $legal050$;");
  return (
    sql.slice(0, start) +
    "DO " +
    literal(sql.slice(start + "DO $legal050$\n".length, end) + "END") +
    ";" +
    sql.slice(end + "END $legal050$;".length)
  );
}
const json = (value) => literal(JSON.stringify(value)) + "::jsonb";
const prologue = `BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL standard_conforming_strings=on;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Same mutex as access_legal_accept; acquired before any table locks.
SELECT pg_advisory_xact_lock(734921501);
LOCK TABLE public.legal_documents IN SHARE ROW EXCLUSIVE MODE;
`;
const guard = (
  snapshot,
) => `IF ${contractHash} IS DISTINCT FROM ${literal(snapshot.contract_sha256)} THEN
 RAISE EXCEPTION 'legal_contract_changed'; END IF;
IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.legal_documents'::regclass,'private.legal_acceptances'::regclass)
 AND (NOT relrowsecurity OR NOT relforcerowsecurity)) OR NOT EXISTS(
 SELECT 1 FROM pg_trigger WHERE tgrelid='public.legal_documents'::regclass AND tgname='legal_immutable' AND tgenabled='O'
 AND tgfoid='private.legal_immutable()'::regprocedure) THEN RAISE EXCEPTION 'legal_protection_missing'; END IF;
`;
const oldCheck = (
  snapshot,
  current,
) => `FOR e IN SELECT value FROM jsonb_array_elements(${json(snapshot.current)}) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.legal_documents d WHERE d.kind=e->>'kind' AND d.version=e->>'version'
 AND d.acceptance_version=e->>'acceptance_version' AND ${rowHash}=e->>'row_sha256' AND d.current=${current})
 THEN RAISE EXCEPTION 'legal_expected_version_mismatch'; END IF;
END LOOP;`;
const newMatch = `d.kind=n->>'kind' AND d.version=n->>'version' AND d.acceptance_version=n->>'acceptance_version'
 AND d.title=n->>'title' AND d.body=n->>'body' AND NOT d.is_draft`;
export function publicationSQL(snapshot, documents, reviewHash) {
  return safeDo(`-- SYZIA 050 legal publication. Review SHA-256: ${reviewHash}
-- Privileged manual execution only. No schema/trigger/RLS/acceptance edits.
${prologue}DO $legal050$
DECLARE e jsonb; n jsonb; targets jsonb := ${json(documents)};
BEGIN
${guard(snapshot)}
${oldCheck(snapshot, "true")}
IF (SELECT count(*) FROM public.legal_documents WHERE current)<>2 THEN RAISE EXCEPTION 'legal_current_pair_invalid'; END IF;
FOR n IN SELECT value FROM jsonb_array_elements(targets) LOOP
 IF EXISTS(SELECT 1 FROM public.legal_documents WHERE kind=n->>'kind' AND
 (version=n->>'version' OR acceptance_version=n->>'acceptance_version')) OR EXISTS(
 SELECT 1 FROM private.legal_acceptances WHERE terms_acceptance=n->>'acceptance_version' OR privacy_acceptance=n->>'acceptance_version')
 THEN RAISE EXCEPTION 'legal_version_or_acceptance_reused'; END IF;
END LOOP;
UPDATE public.legal_documents SET current=false WHERE current;
INSERT INTO public.legal_documents(kind,version,acceptance_version,title,body,is_draft,current)
 SELECT item.value->>'kind',item.value->>'version',item.value->>'acceptance_version',item.value->>'title',item.value->>'body',false,true
 FROM jsonb_array_elements(targets) AS item(value);
IF (SELECT count(*) FROM public.legal_documents WHERE current)<>2 THEN RAISE EXCEPTION 'legal_current_pair_invalid'; END IF;
END $legal050$;
COMMIT;
`);
}
export function rollbackSQL(snapshot, documents, reviewHash) {
  return safeDo(`-- SYZIA 050 guarded rollback. Review SHA-256: ${reviewHash}
-- Refuses rollback after ANY acceptance of either new version/group. Never deletes history.
${prologue}LOCK TABLE private.legal_acceptances IN SHARE MODE;
DO $legal050$
DECLARE e jsonb; n jsonb; targets jsonb := ${json(documents)};
BEGIN
${guard(snapshot)}
${oldCheck(snapshot, "false")}
IF (SELECT count(*) FROM public.legal_documents WHERE current)<>2 THEN RAISE EXCEPTION 'legal_current_pair_invalid'; END IF;
FOR n IN SELECT value FROM jsonb_array_elements(targets) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.legal_documents d WHERE ${newMatch} AND d.current)
 THEN RAISE EXCEPTION 'legal_rollback_version_mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM private.legal_acceptances WHERE
 (n->>'kind'='terms' AND (terms_version=n->>'version' OR terms_acceptance=n->>'acceptance_version')) OR
 (n->>'kind'='privacy' AND (privacy_version=n->>'version' OR privacy_acceptance=n->>'acceptance_version')))
 THEN RAISE EXCEPTION 'legal_rollback_has_acceptances'; END IF;
END LOOP;
UPDATE public.legal_documents SET current=false WHERE current;
FOR e IN SELECT value FROM jsonb_array_elements(${json(snapshot.current)}) LOOP
 UPDATE public.legal_documents SET current=true WHERE kind=e->>'kind' AND version=e->>'version';
END LOOP;
END $legal050$;
COMMIT;
`);
}
