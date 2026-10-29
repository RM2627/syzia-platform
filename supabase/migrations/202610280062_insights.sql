-- SYZIA 061 / A: editorial storage, explicit access, immutable published snapshots.
begin;
create table private.insights_editors(user_id uuid primary key references public.profiles(id),granted_by uuid not null,created_at timestamptz not null default now());
create table private.insights_posts(id uuid primary key default gen_random_uuid(),revision integer not null default 1,state text not null default 'draft' check(state in('draft','scheduled','published','archived')),draft jsonb not null,published jsonb,published_at timestamptz,updated_at timestamptz not null default now(),scheduled_at timestamptz,scheduled_revision integer,schedule_attempts integer not null default 0,schedule_retry_at timestamptz,schedule_error text,author_id uuid not null,unique(id,revision));
create unique index insights_published_slug on private.insights_posts((published->>'slug'))where published is not null;
create table private.insights_versions(post_id uuid not null references private.insights_posts(id),revision integer not null,document jsonb not null,actor_id uuid not null,created_at timestamptz not null default now(),primary key(post_id,revision));
create table private.insights_redirects(slug text primary key,post_id uuid not null references private.insights_posts(id));
create table private.insights_taxonomy(kind text not null check(kind in('category','tag','author')),name text not null check(length(trim(name))between 2 and 80),primary key(kind,name));
create table private.insights_media(id uuid primary key default gen_random_uuid(),body bytea not null check(octet_length(body)between 16 and 400000 and substring(body from 1 for 4)=decode('52494646','hex')and substring(body from 9 for 4)=decode('57454250','hex')),alt text not null check(length(trim(alt))between 2 and 240),width integer not null check(width between 1 and 1920),height integer not null check(height between 1 and 1920),actor_id uuid not null,created_at timestamptz not null default now());
create table private.insights_likes(post_id uuid not null references private.insights_posts(id),visitor text not null check(visitor~'^[a-f0-9]{64}$'),created_at timestamptz not null default now(),primary key(post_id,visitor));
create table private.insights_events(id bigint generated always as identity primary key,post_id uuid not null references private.insights_posts(id),visitor text not null,event text not null check(event in('view','share_intent','cta','lead')),bucket timestamptz not null,category text not null,created_at timestamptz not null default now(),unique(post_id,visitor,event,bucket));
create table private.insights_origins(lead_id uuid primary key references private.acquisition_leads(id),post_id uuid references private.insights_posts(id),category text not null,cta text not null,utm jsonb not null default '{}',consent_version text not null,created_at timestamptz not null default now());
create table private.insights_audit(id bigint generated always as identity primary key,post_id uuid,actor_id uuid,event text not null,revision integer,created_at timestamptz not null default now());
do $$declare n text;begin foreach n in array array['insights_editors','insights_posts','insights_versions','insights_redirects','insights_taxonomy','insights_media','insights_likes','insights_events','insights_origins','insights_audit']loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);end loop;end;$$;
create trigger insights_version_immutable before update or delete on private.insights_versions for each row execute function private.consumer_deny_immutable();
create function private.insights_allowed()returns boolean language sql stable security definer set search_path=''as $$select private.is_active_user()and(private.people_root(auth.uid())or exists(select 1 from private.insights_editors where user_id=auth.uid()));$$;
create function private.insights_validate(d jsonb)returns void language plpgsql security definer set search_path=''as $$declare b jsonb;begin
 perform private.company_keys(d,array['title','slug','summary','category','author','tags','blocks','cover','seo_title','seo_description','featured','kind','toc']);
 if length(trim(coalesce(d->>'title','')))not between 8 and 160 or coalesce(d->>'slug','')!~'^[a-z0-9]+(-[a-z0-9]+)*$'or length(d->>'slug')>120 or d->>'slug'=any(array['api','media','assets','sitemap.xml','robots.txt','categoria'])or length(trim(coalesce(d->>'summary','')))not between 20 and 400 or jsonb_typeof(d->'blocks')is distinct from 'array' or jsonb_array_length(d->'blocks')not between 1 and 100 or octet_length(d::text)>180000 then raise exception 'insights_document_invalid';end if;
 if not exists(select 1 from private.insights_taxonomy where kind='category'and name=d->>'category')or not exists(select 1 from private.insights_taxonomy where kind='author'and name=d->>'author')then raise exception 'insights_taxonomy_required';end if;
 if jsonb_typeof(d->'tags')is distinct from 'array'or jsonb_array_length(d->'tags')>12 or exists(select 1 from jsonb_array_elements_text(d->'tags') t where not exists(select 1 from private.insights_taxonomy where kind='tag'and name=t))then raise exception 'insights_tags_invalid';end if;
 if coalesce(d->>'kind','article')not in('article','guide','material')then raise exception 'insights_kind_invalid';end if;
 if coalesce(d->>'cover','')<>''and not exists(select 1 from private.insights_media where id::text=d->>'cover')then raise exception 'insights_media_missing';end if;
 for b in select value from jsonb_array_elements(d->'blocks')loop
 perform private.company_keys(b,array['type','text','level','bold','italic','url','alt','caption','media']);
 if coalesce(b->>'type','')not in('paragraph','heading','list','quote','callout','table','image','link','cta')or length(coalesce(b->>'text',''))>12000 then raise exception 'insights_block_invalid';end if;
 if b->>'type'='image'and(length(trim(coalesce(b->>'alt','')))<2 or not exists(select 1 from private.insights_media where id::text=b->>'media'))then raise exception 'insights_media_missing';end if;
 if b->>'type' in('link','cta')and(coalesce(b->>'url','')!~'^(https://[^ /]+|/[^/])'or b->>'url'~'[\s\\<>"'']')then raise exception 'insights_link_invalid';end if;
 end loop;
end;$$;
create function private.insights_publish(p_id uuid,p_revision integer)returns void language plpgsql security definer set search_path=''as $$declare p private.insights_posts;begin
 select *into p from private.insights_posts where id=p_id for update;
 if p.id is null or p.revision<>p_revision then raise exception 'insights_revision_conflict';end if;
 perform private.insights_validate(p.draft);
 if exists(select 1 from private.insights_redirects where slug=p.draft->>'slug'and post_id<>p.id)then raise exception 'insights_slug_reserved';end if;
 if p.published is not null and p.published->>'slug'<>p.draft->>'slug'then insert into private.insights_redirects values(p.published->>'slug',p.id)on conflict(slug)do nothing;end if;
 update private.insights_posts set revision=revision+1,published=draft,state='published',published_at=coalesce(published_at,now()),scheduled_at=null,scheduled_revision=null,schedule_attempts=0,schedule_retry_at=null,schedule_error=null,updated_at=now()where id=p.id;
 insert into private.insights_versions values(p.id,p.revision+1,p.draft,coalesce(auth.uid(),p.author_id),now());
 insert into private.insights_audit(post_id,actor_id,event,revision)values(p.id,auth.uid(),'published',p.revision+1);
end;$$;
create function public.insights_editor(p_action text,p_data jsonb default '{}')returns jsonb language plpgsql security definer set search_path=''as $$
declare p private.insights_posts;d jsonb;id_ uuid;begin
 if p_action='access'then return jsonb_build_object('allowed',private.insights_allowed(),'root',private.is_active_user()and private.people_root(auth.uid()));end if;
 if not private.insights_allowed()then raise exception 'access_denied'using errcode='42501';end if;
 if p_action='grant'then
 if not private.people_root(auth.uid())then raise exception 'access_denied'using errcode='42501';end if;
 if (p_data->>'enabled')::boolean then insert into private.insights_editors values((p_data->>'user_id')::uuid,auth.uid(),now())on conflict do nothing;else delete from private.insights_editors where user_id=(p_data->>'user_id')::uuid;end if;return '{}';
 elsif p_action='list'then return jsonb_build_object('posts',coalesce((select jsonb_agg(to_jsonb(x)-'published')from private.insights_posts x),'[]'),'taxonomy',coalesce((select jsonb_agg(to_jsonb(t))from private.insights_taxonomy t),'[]'));
 elsif p_action='taxonomy'then
 if p_data->>'operation'='delete'then
 if exists(select 1 from private.insights_posts where draft::text like '%'||(p_data->>'name')||'%'or published::text like '%'||(p_data->>'name')||'%')then raise exception 'insights_taxonomy_in_use';end if;
 delete from private.insights_taxonomy where kind=p_data->>'kind'and name=p_data->>'name';
 else insert into private.insights_taxonomy values(p_data->>'kind',trim(p_data->>'name'))on conflict do nothing;end if;return '{}';
 elsif p_action='media_add'then
 insert into private.insights_media(body,alt,width,height,actor_id)values(decode(p_data->>'body','base64'),p_data->>'alt',(p_data->>'width')::int,(p_data->>'height')::int,auth.uid())returning id into id_;return jsonb_build_object('id',id_);
 elsif p_action='media_list'then return coalesce((select jsonb_agg(to_jsonb(m)-'body'-'actor_id' order by created_at desc)from private.insights_media m),'[]');
 elsif p_action='media_get'then return(select jsonb_build_object('body',encode(body,'base64'),'alt',alt)from private.insights_media where id=(p_data->>'id')::uuid);
 elsif p_action='media_delete'then
 if exists(select 1 from private.insights_posts where draft::text like '%'||(p_data->>'id')||'%'or published::text like '%'||(p_data->>'id')||'%')or exists(select 1 from private.insights_versions where document::text like '%'||(p_data->>'id')||'%')then raise exception 'insights_media_in_use';end if;
 delete from private.insights_media where id=(p_data->>'id')::uuid;return '{}';
 elsif p_action='stats'then
 return jsonb_build_object('measurement','first-party consented browser identifiers; not people','rows',coalesce((select jsonb_agg(to_jsonb(s))from(
 select post_.id post_id,coalesce(post_.published,post_.draft)->>'category'category,count(*)filter(where e.event='view')views,count(distinct e.visitor)filter(where e.event='view')estimated_visitors,count(*)filter(where e.event='share_intent')share_intents,count(*)filter(where e.event='cta')cta_intents,
 (select count(*)from private.insights_likes l where l.post_id=post_.id)likes,
 (select count(*)from private.insights_origins o where o.post_id=post_.id and o.created_at>=greatest(coalesce((p_data->>'from')::timestamptz,now()-interval '30 days'),now()-interval '90 days')and o.created_at<coalesce((p_data->>'to')::timestamptz,now()))leads,
 count(distinct e.visitor)filter(where e.event='view'and exists(select 1 from private.insights_events le where le.post_id=post_.id and le.visitor=e.visitor and le.event='lead'and le.created_at>=e.created_at and le.created_at<coalesce((p_data->>'to')::timestamptz,now()))) measured_lead_visitors
 from private.insights_posts post_ left join private.insights_events e on e.post_id=post_.id and e.created_at>=greatest(coalesce((p_data->>'from')::timestamptz,now()-interval '30 days'),now()-interval '90 days')and e.created_at<coalesce((p_data->>'to')::timestamptz,now())where(nullif(p_data->>'category','')is null or coalesce(post_.published,post_.draft)->>'category'=p_data->>'category')group by post_.id)s),'[]'));
 elsif p_action='create'then
 d=p_data->'document';perform private.insights_validate(d);
 insert into private.insights_posts(draft,author_id)values(d,auth.uid())returning *into p;
 insert into private.insights_versions values(p.id,p.revision,p.draft,auth.uid(),now());return to_jsonb(p);
 end if;
 select *into p from private.insights_posts where id=(p_data->>'id')::uuid for update;
 if p.id is null then raise exception 'insights_not_found';end if;
 if p_action='get'then return to_jsonb(p)||jsonb_build_object('versions',coalesce((select jsonb_agg(jsonb_build_object('revision',revision,'created_at',created_at)order by revision desc)from private.insights_versions where post_id=p.id),'[]'));end if;
 if p.revision is distinct from (p_data->>'revision')::int then raise exception 'insights_revision_conflict';end if;
 if p_action in('save','restore')then
 if p_action='restore'then select document into d from private.insights_versions where post_id=p.id and revision=(p_data->>'restore_revision')::int;else d=p_data->'document';end if;
 perform private.insights_validate(d);
 update private.insights_posts set draft=d,revision=revision+1,updated_at=now(),scheduled_at=null,scheduled_revision=null,state=case when state='scheduled'then 'draft'else state end where id=p.id returning *into p;
 insert into private.insights_versions values(p.id,p.revision,p.draft,auth.uid(),now());
 elsif p_action='publish'then perform private.insights_publish(p.id,p.revision);
 elsif p_action='schedule'then
 if p_data->>'at' is null or (p_data->>'at')::timestamptz<=now()or not isfinite((p_data->>'at')::timestamptz)then raise exception 'insights_schedule_invalid';end if;
 perform private.insights_validate(p.draft);
 update private.insights_posts set revision=revision+1,scheduled_at=(p_data->>'at')::timestamptz,scheduled_revision=revision+1,schedule_attempts=0,schedule_retry_at=null,schedule_error=null,state='scheduled'where id=p.id;
 elsif p_action in('unpublish','archive')then update private.insights_posts set revision=revision+1,published=null,scheduled_at=null,scheduled_revision=null,state=case when p_action='archive'then 'archived'else 'draft'end where id=p.id;
 else raise exception 'insights_action_invalid';end if;
 if p_action in('schedule','unpublish','archive')then insert into private.insights_versions values(p.id,p.revision+1,p.draft,auth.uid(),now());end if;
 insert into private.insights_audit(post_id,actor_id,event,revision)values(p.id,auth.uid(),p_action,p.revision);
 return(select to_jsonb(x)from private.insights_posts x where id=p.id);
end;$$;
create function public.insights_service(p_action text,p_data jsonb default '{}')returns jsonb language plpgsql security definer set search_path=''as $$
declare p private.insights_posts;visitor_ text=p_data->>'visitor';event_ text=p_data->>'event';key_ uuid;lead_ uuid;done_ int=0;failed_ int=0;begin
 if p_action='catalog'then return jsonb_build_object('posts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'document',published,'cover_alt',(select alt from private.insights_media m where m.id::text=published->>'cover'),'published_at',published_at,'updated_at',(select max(created_at)from private.insights_audit a where a.post_id=insights_posts.id and a.event='published')))from private.insights_posts where published is not null),'[]'),'popular',coalesce((select jsonb_agg(post_id)from(select post_id from private.insights_events where event='view'and created_at>=now()-interval '30 days'group by post_id order by count(*)desc limit 5)x),'[]'),'redirects',coalesce((select jsonb_object_agg(r.slug,post_.published->>'slug')from private.insights_redirects r join private.insights_posts post_ on post_.id=r.post_id where post_.published is not null),'{}'));
 elsif p_action='media'then
 if not exists(select 1 from private.insights_posts where published is not null and published::text like '%'||(p_data->>'id')||'%')then raise exception 'insights_not_found';end if;
 return(select jsonb_build_object('body',encode(body,'base64'),'width',width,'height',height,'alt',alt)from private.insights_media where id::text=p_data->>'id');
 elsif p_action='tick'then
 for p in select *from private.insights_posts where scheduled_at<=now()and(schedule_retry_at is null or schedule_retry_at<=now())order by scheduled_at for update skip locked limit 20 loop
 begin perform private.insights_publish(p.id,p.scheduled_revision);done_=done_+1;exception when others then failed_=failed_+1;update private.insights_posts set schedule_attempts=schedule_attempts+1,schedule_retry_at=now()+make_interval(mins=>least(60,1+schedule_attempts*5)),schedule_error='publication_validation_failed'where id=p.id;insert into private.insights_audit(post_id,event,revision)values(p.id,'schedule_failed',p.revision);end;
 end loop;
 delete from private.insights_events where created_at<now()-interval '90 days';
 return jsonb_build_object('published',done_,'failed',failed_);
 end if;
 select *into p from private.insights_posts where id::text=p_data->>'id'and published is not null;
 if p.id is null then raise exception 'insights_not_found';end if;
 if p_action='likes'then return jsonb_build_object('count',(select count(*)from private.insights_likes where post_id=p.id),'liked',exists(select 1 from private.insights_likes where post_id=p.id and visitor=visitor_));end if;
 if coalesce(visitor_,'')!~'^[a-f0-9]{64}$'then raise exception 'insights_visitor_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(visitor_,61));
 if (select count(*)from private.insights_events where visitor=visitor_ and created_at>now()-interval '1 minute')>=20 then raise exception 'insights_rate_limited';end if;
 if p_action='like'then
 if (p_data->>'liked')::boolean then insert into private.insights_likes(post_id,visitor)values(p.id,visitor_)on conflict do nothing;else delete from private.insights_likes where post_id=p.id and visitor=visitor_;end if;
 return jsonb_build_object('count',(select count(*)from private.insights_likes where post_id=p.id),'liked',exists(select 1 from private.insights_likes where post_id=p.id and visitor=visitor_));
 elsif p_action='event'and event_ in('view','share_intent','cta')then
 insert into private.insights_events(post_id,visitor,event,bucket,category)values(p.id,visitor_,event_,date_bin(interval '30 minutes',now(),'2000-01-01'::timestamptz),p.published->>'category')on conflict do nothing;return '{}';
 elsif p_action='lead'then
 if p_data->>'consent' is distinct from 'true'or length(trim(coalesce(p_data->>'name','')))not between 2 and 120 or coalesce(p_data->>'email','')!~'^[^\s@]+@[^\s@]+\.[^\s@]+$'or length(p_data->>'email')>254 or length(coalesce(p_data->>'need',''))>1000 or length(coalesce(p_data->>'segment',''))>120 then raise exception 'insights_lead_invalid';end if;
 perform pg_advisory_xact_lock(734921501);
 key_=(p_data->>'key')::uuid;
 select id into lead_ from private.acquisition_leads where lower(email)=lower(trim(p_data->>'email'))order by created_at limit 1;
 if lead_ is null then
 insert into private.acquisition_leads(request_key,name,company,phone,email,interest)values(key_,trim(p_data->>'name'),null,null,lower(trim(p_data->>'email')),nullif(trim(concat_ws(': ',nullif(p_data->>'segment',''),nullif(p_data->>'need',''))),''))returning id into lead_;
 insert into private.acquisition_events(lead_id,event)values(lead_,'lead_received');end if;
 insert into private.insights_origins(lead_id,post_id,category,cta,utm,consent_version)values(lead_,p.id,p.published->>'category','article-interest',coalesce(p_data->'utm','{}'),'insights-contact-v1')on conflict do nothing;
 insert into private.insights_events(post_id,visitor,event,bucket,category)values(p.id,visitor_,'lead','2000-01-01'::timestamptz,p.published->>'category')on conflict do nothing;
 return jsonb_build_object('received',true);
 end if;raise exception 'insights_action_invalid';
end;$$;
revoke all on function private.insights_allowed(),private.insights_validate(jsonb),private.insights_publish(uuid,integer),public.insights_editor(text,jsonb),public.insights_service(text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.insights_editor(text,jsonb)to authenticated;
grant execute on function public.insights_service(text,jsonb)to service_role;
insert into private.insights_taxonomy values('author','Equipe SYZIA'),('category','Gestão e rotina'),('category','Presença digital'),('category','Atendimento'),('category','Agendamentos e atendimento'),('category','Orçamentos e precificação'),('category','Presença digital e portfólio'),('category','Gestão de serviços'),('category','Guias por profissão'),('tag','Serviços'),('tag','Organização'),('tag','Apresentação profissional');
commit;
