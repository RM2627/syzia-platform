begin;
create table public.organization_user_guides (
 organization_id uuid not null references public.organizations(id),user_id uuid not null references public.profiles(id),
 status text not null default 'not_started' check(status in ('not_started','in_progress','skipped','completed')),
 step integer not null default 0 check(step between 0 and 4),revision integer not null default 1 check(revision>0),
 completed_at timestamptz,skipped_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(organization_id,user_id),check((status='completed')=(completed_at is not null)),check(status<>'completed' or step=4)
);
alter table public.organization_user_guides enable row level security;
alter table public.organization_user_guides force row level security;
revoke all on public.organization_user_guides from public,anon,authenticated;
grant select on public.organization_user_guides to authenticated;
create policy organization_user_guides_read on public.organization_user_guides for select to authenticated using(user_id=auth.uid() and private.is_org_admin(organization_id));
create trigger organization_user_guides_audit after insert or update or delete on public.organization_user_guides for each row execute function private.company_audit();
create trigger organization_user_guides_updated before update on public.organization_user_guides for each row execute function private.set_updated_at();
create function public.onboarding_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.company_settings;checks jsonb;items jsonb;path text;human boolean;guide jsonb;
begin
 if not private.is_org_admin(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select * into c from public.company_settings where organization_id=p_org;checks=private.company_checklist(p_org);path='/painel/'||p_org;human=coalesce((c.support_configured or c.human_enabled) and c.support_mode in ('shared','mixed'),false);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'href',path||href,'complete',coalesce(complete,false),'required',required,'note',note) order by position),'[]') into items from (values
 (1,'company','Dados da empresa','/configuracao',coalesce(length(btrim(c.description))>=10 and length(btrim(c.service_regions))>=2 and length(btrim(c.payment_methods))>=2,false),true,'Apresente seu negócio e as informações comerciais.'),
 (2,'branding','Identidade visual','/consumidor#identidade',exists(select 1 from public.company_branding b join public.company_media l on l.id=b.logo_id and l.organization_id=p_org and l.state='ready' join public.company_media v on v.id=b.cover_id and v.organization_id=p_org and v.state='ready' where b.organization_id=p_org),false,'Recomendado: logo e capa deixam sua página com a sua cara.'),
 (3,'services','Serviços','/servicos',exists(select 1 from public.services where organization_id=p_org and active),true,'Cadastre o que sua empresa oferece.'),
 (4,'prices','Preços e modalidades','/servicos',exists(select 1 from public.services where organization_id=p_org and active) and not exists(select 1 from public.services where organization_id=p_org and active and (price_mode<>'quote' and price_cents is null)),true,'Preço fixo, a partir de ou sob consulta.'),
 (5,'hours','Horários','/configuracao#horarios',coalesce(jsonb_array_length(c.business_hours)>0,false),true,'Defina os horários em que a empresa atende.'),
 (6,'schedule','Agenda e disponibilidade','/consumidor#disponibilidade',exists(select 1 from public.schedule_resources where organization_id=p_org and active),exists(select 1 from public.services where organization_id=p_org and active and direct_booking),'Necessário quando houver agendamento online. Revise antecedência e intervalos.'),
 (7,'portfolio','Portfólio','/consumidor#portfolio',exists(select 1 from public.portfolio_items where organization_id=p_org and active),false,'Opcional: mostre seu trabalho com imagens autorizadas.'),
 (8,'page','Página pública','/consumidor#publicacao',exists(select 1 from public.consumer_pages where organization_id=p_org and enabled and publication_id is not null),true,'Revise o conteúdo antes de disponibilizá-lo na página da empresa.'),
 (9,'publication','Publicação e prontidão','/consumidor#publicacao',exists(select 1 from public.consumer_pages p join public.consumer_publications v on v.id=p.publication_id join public.manual_versions m on m.id=v.manual_id where p.organization_id=p_org and p.enabled and m.source_revision=c.operational_revision),true,'Rascunhos não substituem a versão aprovada para o consumidor.'),
 (10,'manual','Manual de Atendimento','/manual',coalesce((checks->>'manual_published')::boolean,false),human,'Para o atendimento humano: você orienta, nossa equipe segue.'),
 (11,'faq','FAQ','/faq',coalesce((checks->>'faq')::boolean,false),human,'Respostas claras às dúvidas recorrentes.'),
 (12,'rules','Regras empresariais','/regras',coalesce((checks->>'rules')::boolean,false),human,'Defina como agir em cancelamentos, prazos e exceções.'),
 (13,'autonomy','Autonomia da equipe','/autonomia',coalesce((checks->>'autonomy')::boolean,false),human,'Você decide os limites. Fora deles, a equipe consulta a empresa.'),
 (14,'human_ready','Prontidão do atendimento','/prontidao',coalesce(c.human_enabled,false) and not exists(select 1 from jsonb_each(checks) where value<>'true'::jsonb),human,'Revise manual, regras, equipe e disponibilidade antes de ativar.')
 ) x(position,id,label,href,complete,required,note) where position<10 or human;
 select to_jsonb(g)-array['user_id','organization_id'] into guide from public.organization_user_guides g where organization_id=p_org and user_id=auth.uid();
 return jsonb_build_object('organization_id',p_org,'items',items,'shared_support',human,'ready',not exists(select 1 from jsonb_array_elements(items)i where (i->>'required')::boolean and not(i->>'complete')::boolean),
 'guide',coalesce(guide,jsonb_build_object('status','not_started','step',0,'revision',0)));
end;$$;
create function public.onboarding_act(p_org uuid,p_action text,p_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.organization_user_guides;payload jsonb;prior jsonb;result jsonb;
begin
 perform private.company_lock(p_org);payload=jsonb_build_array(p_action,p_revision);prior=private.consumer_idem(p_org,'onboarding',p_key,payload);if prior is not null then return prior;end if;
 select * into g from public.organization_user_guides where organization_id=p_org and user_id=auth.uid() for update;
 if coalesce(g.revision,0) is distinct from p_revision then raise exception 'guide_revision_conflict' using errcode='40001';end if;
 if g.user_id is null then insert into public.organization_user_guides(organization_id,user_id) values(p_org,auth.uid()) returning * into g;end if;
 case p_action
 when 'start' then if g.status<>'not_started' then raise exception 'guide_invalid_transition' using errcode='22023';end if;g.status='in_progress';g.step=0;
 when 'restart' then g.status='in_progress';g.step=0;g.completed_at=null;g.skipped_at=null;
 when 'next' then if g.status<>'in_progress' or g.step>=4 then raise exception 'guide_invalid_transition' using errcode='22023';end if;g.step=g.step+1;
 when 'previous' then if g.status<>'in_progress' or g.step<=0 then raise exception 'guide_invalid_transition' using errcode='22023';end if;g.step=g.step-1;
 when 'skip' then if g.status not in ('not_started','in_progress') then raise exception 'guide_invalid_transition' using errcode='22023';end if;g.status='skipped';g.skipped_at=clock_timestamp();
 when 'complete' then if g.status<>'in_progress' or g.step<>4 then raise exception 'guide_invalid_transition' using errcode='22023';end if;g.status='completed';g.completed_at=clock_timestamp();
 else raise exception 'guide_invalid_transition' using errcode='22023';end case;
 update public.organization_user_guides set status=g.status,step=g.step,completed_at=g.completed_at,skipped_at=g.skipped_at,revision=revision+1 where organization_id=p_org and user_id=auth.uid();
 result=public.onboarding_context(p_org);perform private.consumer_remember(p_org,'onboarding',p_key,payload,result);return result;
end;$$;
revoke all on function public.onboarding_context(uuid),public.onboarding_act(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.onboarding_context(uuid),public.onboarding_act(uuid,text,integer,uuid) to authenticated;
commit;
