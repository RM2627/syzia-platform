-- TEMPLATE ONLY. Owner must review/edit before execution in a dedicated environment.
-- Never modify an old version body. Same acceptance_version = editorial; new group = material.
begin;
do $$declare document_kind text='terms'; new_version text='REPLACE_VERSION'; acceptance_group text='REPLACE_ACCEPTANCE_GROUP'; reviewed_title text='REPLACE_TITLE'; reviewed_body text='REPLACE_REVIEWED_BODY';begin
 if new_version like 'REPLACE%' or acceptance_group like 'REPLACE%' or reviewed_body like 'REPLACE%' then raise exception 'Template requires explicit owner review';end if;
 perform pg_advisory_xact_lock(734921501);
 update public.legal_documents set current=false where kind=document_kind and current;
 insert into public.legal_documents(kind,version,acceptance_version,title,body,is_draft,current) values(document_kind,new_version,acceptance_group,reviewed_title,reviewed_body,false,true);
 insert into public.audit_logs(action,entity_table,entity_key,changed_fields) values('legal_document_published','legal_documents',jsonb_build_object('kind',document_kind,'version',new_version),array['current']);
end;$$;
commit;
