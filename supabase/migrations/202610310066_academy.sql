begin;
-- Academy is separate from SaaS identities, memberships and billing. No public table grants.
create schema academy;
revoke all on schema academy from public,anon,authenticated,service_role;
create table academy.notices(id uuid primary key default gen_random_uuid(),terms text not null,privacy text not null,created_at timestamptz not null default now());
create table academy.settings(id boolean primary key default true check(id),revision integer not null default 1,mode text not null default 'waitlist' check(mode in('waitlist','course')),waitlist_enabled boolean not null default false,contact_name text not null default '',contact_email text not null default '',notice_id uuid references academy.notices(id),launch_subject text not null default 'As aulas da SYZIA Academy estão disponíveis',launch_body text not null default 'O minicurso gratuito está disponível. Acesse a Academy para começar no seu ritmo. Nenhuma contratação da SYZIA é necessária.');
insert into academy.settings(id)values(true);
create table academy.courses(id uuid primary key default gen_random_uuid(),revision integer not null default 1,position integer not null default 0,state text not null default 'draft' check(state in('draft','preparing','published','archived')),draft jsonb not null,published jsonb,published_version uuid,updated_at timestamptz not null default now());
create table academy.versions(id uuid primary key default gen_random_uuid(),course_id uuid not null references academy.courses(id),revision integer not null,document jsonb not null,actor uuid not null,created_at timestamptz not null default now());
create table academy.students(id uuid primary key default gen_random_uuid(),email text not null unique check(email=lower(email) and length(email)<=254),name text not null,segment text not null,difficulty text not null,utm jsonb not null default '{}',status text not null default 'pending' check(status in('pending','confirmed','cancelled','invited')),notifications boolean not null default false,notice_id uuid references academy.notices(id),created_at timestamptz not null default now(),confirmed_at timestamptz,last_activity timestamptz not null default now(),last_sent_at timestamptz);
create table academy.tokens(hash text primary key check(hash~'^[a-f0-9]{64}$'),student_id uuid not null references academy.students(id)on delete cascade,kind text not null check(kind in('confirm','login','preferences')),payload jsonb not null default '{}',expires_at timestamptz not null,used_at timestamptz);
create table academy.sessions(hash text primary key check(hash~'^[a-f0-9]{64}$'),student_id uuid not null references academy.students(id)on delete cascade,expires_at timestamptz not null);
create table academy.progress(student_id uuid references academy.students(id)on delete cascade,course_id uuid references academy.courses(id),lesson_id uuid not null,completed boolean not null default true,updated_at timestamptz not null default now(),primary key(student_id,course_id,lesson_id));
create table academy.materials(id uuid primary key,kind text not null check(kind in('image','material')),name text not null,mime text not null,bytes integer not null check(bytes between 1 and 5242880),storage_path text not null unique,created_at timestamptz not null default now());
create table academy.campaigns(id uuid primary key default gen_random_uuid(),actor uuid not null,revision integer not null,subject text not null,body text not null,recipients uuid[] not null,state text not null default 'preview' check(state in('preview','confirmed','complete')),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes');
create table academy.deliveries(id uuid primary key,student_id uuid references academy.students(id)on delete cascade,kind text not null check(kind in('confirm','login','launch')),campaign_id uuid references academy.campaigns(id),payload text,token_expires timestamptz not null,status text not null default 'pending' check(status in('pending','sending','accepted','failed','uncertain','skipped')),error_code text,created_at timestamptz not null default now(),attempted_at timestamptz,finished_at timestamptz);
create unique index academy_launch_once on academy.deliveries(student_id)where kind='launch';
create table academy.limits(key text primary key,count integer not null default 0,expires_at timestamptz not null);
create table academy.events(id bigint generated always as identity primary key,event text not null,actor uuid,subject uuid,detail jsonb not null default '{}',created_at timestamptz not null default now());
create table academy.metrics(day date not null,event text not null,source text not null default '',count bigint not null default 0,primary key(day,event,source));
create index academy_student_filter on academy.students(status,created_at);
create index academy_tokens_expiry on academy.tokens(expires_at);
create index academy_deliveries_status on academy.deliveries(status,created_at);
create function academy.immutable()returns trigger language plpgsql set search_path=''as $$begin raise exception 'academy_immutable';end;$$;
create trigger academy_notice_immutable before update or delete on academy.notices for each row execute function academy.immutable();
create trigger academy_version_immutable before update or delete on academy.versions for each row execute function academy.immutable();
create function academy.allowed()returns boolean language sql stable security definer set search_path=''as $$select private.is_active_user()and private.people_root(auth.uid());$$;
create function academy.validate(d jsonb, publishing boolean default false)returns void language plpgsql security definer set search_path=''as $$
declare m jsonb;l jsonb;ids text[]:='{}';ref text;
begin
 if jsonb_typeof(d)is distinct from 'object'or octet_length(d::text)>200000 or length(coalesce(d->>'title',''))not between 4 and 160 or length(coalesce(d->>'description',''))not between 10 and 6000 or length(coalesce(d->>'audience',''))not between 4 and 1000 or jsonb_typeof(d->'modules') is distinct from 'array' or jsonb_array_length(d->'modules')>20 then raise exception 'academy_course_invalid';end if;
 if jsonb_typeof(d->'title')is distinct from 'string'or jsonb_typeof(d->'description')is distinct from 'string'or jsonb_typeof(d->'audience')is distinct from 'string'or jsonb_typeof(d->'cover')is distinct from 'string'then raise exception 'academy_course_invalid';end if;
 if publishing and(jsonb_array_length(d->'modules')=0 or coalesce(d->>'cover','')='')then raise exception 'academy_course_incomplete';end if;
 if coalesce(d->>'cover','')<>''and not exists(select 1 from academy.materials where id=(d->>'cover')::uuid and kind='image')then raise exception 'academy_material_invalid';end if;
 for m in select value from jsonb_array_elements(d->'modules')loop
  if coalesce(m->>'id','')!~'^[a-f0-9-]{36}$'or m->>'id'=any(ids)or length(coalesce(m->>'title',''))not between 3 and 160 or jsonb_typeof(m->'lessons') is distinct from 'array'or jsonb_array_length(m->'lessons')>50 then raise exception 'academy_course_invalid';end if;ids:=array_append(ids,m->>'id');
  if publishing and jsonb_array_length(m->'lessons')=0 then raise exception 'academy_course_incomplete';end if;
  for l in select value from jsonb_array_elements(m->'lessons')loop
   if coalesce(l->>'id','')!~'^[a-f0-9-]{36}$'or l->>'id'=any(ids)or length(coalesce(l->>'title',''))not between 3 and 160 or length(coalesce(l->>'description',''))>10000 or jsonb_typeof(l->'published') is distinct from 'boolean'or jsonb_typeof(l->'materials') is distinct from 'array'or jsonb_array_length(l->'materials')>10 then raise exception 'academy_lesson_invalid';end if;ids:=array_append(ids,l->>'id');
   if coalesce(l->>'video_id','')<>''and(l->>'video_id')!~'^[A-Za-z0-9_-]{11}$'then raise exception 'academy_video_invalid';end if;
   if (publishing or(l->>'published')::boolean)and(coalesce(l->>'video_id','')=''or length(coalesce(l->>'description',''))<10 or not(l->>'published')::boolean)then raise exception 'academy_course_incomplete';end if;
   for ref in select jsonb_array_elements_text(l->'materials')loop if not exists(select 1 from academy.materials where id=ref::uuid and kind='material')then raise exception 'academy_material_invalid';end if;end loop;
  end loop;
 end loop;
end;$$;
create function academy.visible(d jsonb)returns jsonb language sql immutable set search_path=''as $$
 select jsonb_set(d,'{modules}',coalesce((select jsonb_agg(jsonb_set(m,'{lessons}',coalesce((select jsonb_agg(l)from jsonb_array_elements(m->'lessons')l where l->>'published'='true'),'[]')))from jsonb_array_elements(d->'modules')m),'[]'));
$$;
create function academy.actor(p_hash text)returns uuid language plpgsql security definer set search_path=''as $$declare u uuid;begin select s.student_id into u from academy.sessions s join academy.students p on p.id=s.student_id where s.hash=p_hash and s.expires_at>now()and p.confirmed_at is not null;if u is null then raise exception 'academy_session_required'using errcode='42501';end if;update academy.students set last_activity=now()where id=u;return u;end;$$;
create function public.academy_admin(p_action text,p_data jsonb default '{}')returns jsonb language plpgsql security definer set search_path=''as $$
declare s academy.settings;c academy.courses;r jsonb;d jsonb;v uuid;cid uuid;ids uuid[];part jsonb;m jsonb;l jsonb;mods jsonb;lessons jsonb;found_l boolean:=false;st text;row_count integer;
begin
 if p_action='access'then return jsonb_build_object('allowed',coalesce(academy.allowed(),false));end if;
 if not coalesce(academy.allowed(),false)then raise exception 'access_denied'using errcode='42501';end if;
 select * into s from academy.settings where id=true;
 if p_action='overview'then return jsonb_build_object('settings',to_jsonb(s),'totals',(select jsonb_object_agg(status,n)from(select status,count(*)n from academy.students group by status)x),'dates',coalesce((select jsonb_agg(x)from(select created_at::date as day,count(*) registrations,count(confirmed_at) confirmations from academy.students group by 1 order by 1 desc limit 90)x),'[]'),'segments',coalesce((select jsonb_agg(x)from(select segment,count(*)count from academy.students group by segment order by 2 desc limit 30)x),'[]'),'sources',coalesce((select jsonb_agg(x)from(select coalesce(utm->>'utm_source','Direto')source,count(*)count from academy.students group by 1 order by 2 desc limit 30)x),'[]'),'metrics',coalesce((select jsonb_agg(x)from(select * from academy.metrics where day>=current_date-90 order by day desc)x),'[]'),'deliveries',coalesce((select jsonb_agg(x)from(select id,kind,campaign_id,status,error_code,created_at,finished_at from academy.deliveries order by created_at desc limit 100)x),'[]'),'events',coalesce((select jsonb_agg(x)from(select event,actor,subject,detail,created_at from academy.events order by id desc limit 50)x),'[]'),'notice',(select to_jsonb(n)from academy.notices n where id=s.notice_id));end if;
 if p_action in('students','export')then
  if p_action='export'then insert into academy.events(event,actor)values('students_exported',auth.uid());end if;
  select coalesce(jsonb_agg(x),'[]')into r from(select id,name,email,segment,difficulty,utm,status,notifications,created_at,confirmed_at from academy.students where (coalesce(p_data->>'status','')=''or status=p_data->>'status')and(coalesce(p_data->>'segment','')=''or segment ilike '%'||(p_data->>'segment')||'%')and(coalesce(p_data->>'source','')=''or utm->>'utm_source'=p_data->>'source')and(coalesce(p_data->>'from','')=''or created_at>=(p_data->>'from')::date)and(coalesce(p_data->>'to','')=''or created_at<(p_data->>'to')::date+1)order by created_at desc,id limit 100 offset least(100000,greatest(0,coalesce((p_data->>'offset')::integer,0))))x;return r;
 end if;
 if p_action='courses'then return coalesce((select jsonb_agg(to_jsonb(x)order by position,title)from(select id,revision,state,position,draft->>'title'title,published_version from academy.courses)x),'[]');end if;
 if p_action='materials'then return coalesce((select jsonb_agg(to_jsonb(asset)order by created_at desc)from academy.materials asset),'[]');end if;
 if p_action='material_commit'then
  if p_data->>'kind'not in('image','material')or length(p_data->>'name')not between 1 and 160 or p_data->>'storage_path'<>('assets/'||(p_data->>'id'))or p_data->>'mime'not in('image/webp','application/pdf','text/plain','text/csv')then raise exception 'academy_material_invalid';end if;
  insert into academy.materials(id,kind,name,mime,bytes,storage_path)values((p_data->>'id')::uuid,p_data->>'kind',p_data->>'name',p_data->>'mime',(p_data->>'bytes')::integer,p_data->>'storage_path');insert into academy.events(event,actor,subject)values('material_added',auth.uid(),(p_data->>'id')::uuid);return jsonb_build_object('id',p_data->>'id');
 end if;
 if p_action='material_get'then return(select to_jsonb(asset)from academy.materials asset where id=(p_data->>'id')::uuid);end if;
 if p_action='settings'then
  select * into s from academy.settings where id for update;
  if s.revision is distinct from (p_data->>'revision')::integer then raise exception 'academy_revision_conflict';end if;d:=p_data->'settings';
  if d->>'mode'not in('waitlist','course')or jsonb_typeof(d->'waitlist_enabled') is distinct from 'boolean'or length(coalesce(d->>'contact_name',''))>160 or length(coalesce(d->>'contact_email',''))>254 or length(coalesce(d->>'launch_subject',''))not between 5 and 150 or length(coalesce(d->>'launch_body',''))not between 20 and 4000 then raise exception 'academy_invalid';end if;
  if (d->>'waitlist_enabled')::boolean or d->>'mode'='course'then if length(coalesce(d->>'contact_name',''))<3 or coalesce(d->>'contact_email','')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'or length(coalesce(d->>'terms',''))not between 300 and 20000 or length(coalesce(d->>'privacy',''))not between 300 and 20000 then raise exception 'academy_legal_required';end if;end if;
  if d->>'mode'='course'and not exists(select 1 from academy.courses where state='published'and jsonb_path_exists(published,'$.modules[*].lessons[*] ? (@.published == true)'))then raise exception 'academy_course_incomplete';end if;
  if (d->>'mode'<>s.mode or (not s.waitlist_enabled and(d->>'waitlist_enabled')::boolean))and (p_data->>'confirmed')is distinct from 'true'then raise exception 'academy_confirmation_required';end if;
  v:=s.notice_id;if coalesce(d->>'terms','')<>coalesce((select terms from academy.notices where id=v),'')or coalesce(d->>'privacy','')<>coalesce((select privacy from academy.notices where id=v),'')then insert into academy.notices(terms,privacy)values(d->>'terms',d->>'privacy')returning id into v;end if;
  update academy.settings set mode=d->>'mode',waitlist_enabled=(d->>'waitlist_enabled')::boolean,contact_name=d->>'contact_name',contact_email=d->>'contact_email',launch_subject=d->>'launch_subject',launch_body=d->>'launch_body',notice_id=v,revision=revision+1 where id;
  insert into academy.events(event,actor,detail)values('settings_changed',auth.uid(),jsonb_build_object('mode',d->>'mode','notice',v));return jsonb_build_object('ok',true);
 end if;
 if p_action='course_save'then
  d:=p_data->'document';perform academy.validate(d,false);st:=coalesce(p_data->>'state','draft');if st not in('draft','preparing')then raise exception 'academy_invalid';end if;
  if coalesce(p_data->>'id','')=''then insert into academy.courses(draft,state,position)values(d,st,coalesce((p_data->>'position')::integer,0))returning * into c;
  else select * into c from academy.courses where id=(p_data->>'id')::uuid for update;if not found then raise exception 'academy_not_found';end if;if c.revision is distinct from (p_data->>'revision')::integer then raise exception 'academy_revision_conflict';end if;update academy.courses set draft=d,position=coalesce((p_data->>'position')::integer,position),state=case when state='published'then state else st end,revision=revision+1,updated_at=now()where id=c.id returning * into c;end if;
  insert into academy.events(event,actor,subject)values('course_saved',auth.uid(),c.id);return to_jsonb(c);
 end if;
 if p_action in('course_get','course_duplicate','course_publish','course_archive','lesson_visibility')then
  select * into c from academy.courses where id=(p_data->>'id')::uuid for update;if not found then raise exception 'academy_not_found';end if;
  if p_action='course_get'then return to_jsonb(c);end if;
  if c.revision is distinct from (p_data->>'revision')::integer then raise exception 'academy_revision_conflict';end if;
  if p_action='course_duplicate'then
   d:=jsonb_set(c.draft,'{title}',to_jsonb(left(c.draft->>'title',150)||' · cópia'));mods:='[]';
   for m in select value from jsonb_array_elements(d->'modules')loop lessons:='[]';for l in select value from jsonb_array_elements(m->'lessons')loop lessons:=lessons||jsonb_build_array(l||jsonb_build_object('id',gen_random_uuid(),'published',false));end loop;mods:=mods||jsonb_build_array(m||jsonb_build_object('id',gen_random_uuid(),'lessons',lessons));end loop;d:=jsonb_set(d,'{modules}',mods);
   insert into academy.courses(draft)values(d)returning * into c;
  elsif p_action='course_archive'then
   if s.mode='course'and c.state='published'and not exists(select 1 from academy.courses where id<>c.id and state='published')then raise exception 'academy_return_waitlist';end if;
   update academy.courses set state='archived',published=null,revision=revision+1 where id=c.id returning * into c;
  else
   if (p_data->>'confirmed')is distinct from 'true'then raise exception 'academy_confirmation_required';end if;
   d:=c.draft;
   if p_action='lesson_visibility'then
    mods:='[]';for m in select value from jsonb_array_elements(d->'modules')loop
     lessons:='[]';for l in select value from jsonb_array_elements(m->'lessons')loop
      if l->>'id'=p_data->>'lesson_id'then found_l:=true;l:=jsonb_set(l,'{published}',p_data->'published');part:=l;cid:=(m->>'id')::uuid;end if;
      lessons:=lessons||jsonb_build_array(l);
     end loop;mods:=mods||jsonb_build_array(jsonb_set(m,'{lessons}',lessons));
    end loop;
    if not found_l then raise exception 'academy_not_found';end if;
    d:=jsonb_set(d,'{modules}',mods);perform academy.validate(d,false);
    if c.state='published'then
     -- Publish/unpublish exactly this approved lesson, preserving other draft changes.
     mods:='[]';found_l:=false;
     for m in select value from jsonb_array_elements(c.published->'modules')loop
      lessons:='[]';for l in select value from jsonb_array_elements(m->'lessons')loop
       if l->>'id'=p_data->>'lesson_id'then l:=part;found_l:=true;end if;
       lessons:=lessons||jsonb_build_array(l);
      end loop;
      if (m->>'id')::uuid=cid and not found_l and p_data->>'published'='true'then lessons:=lessons||jsonb_build_array(part);found_l:=true;end if;
      mods:=mods||jsonb_build_array(jsonb_set(m,'{lessons}',lessons));
     end loop;
     if not found_l and p_data->>'published'='true'then
      select value into m from jsonb_array_elements(d->'modules')where value->>'id'=cid::text;
      mods:=mods||jsonb_build_array(jsonb_set(m,'{lessons}',jsonb_build_array(part)));
     end if;
     c.published:=jsonb_set(c.published,'{modules}',mods);
     if s.mode='course'and not exists(select 1 from jsonb_array_elements(c.published->'modules')doc_mod cross join lateral jsonb_array_elements(doc_mod->'lessons')doc_lesson where doc_lesson->>'published'='true')then raise exception 'academy_return_waitlist';end if;
    end if;
   else perform academy.validate(d,true);c.published:=d;c.state:='published';end if;
   if c.published is not null then insert into academy.versions(course_id,revision,document,actor)values(c.id,c.revision+1,c.published,auth.uid())returning id into v;end if;
   update academy.courses set draft=d,published=c.published,published_version=coalesce(v,published_version),state=c.state,revision=revision+1,updated_at=now()where id=c.id returning * into c;
  end if;
  insert into academy.events(event,actor,subject)values(p_action,auth.uid(),c.id);return to_jsonb(c);
 end if;
 if p_action='launch_preview'then
  if s.mode<>'course'then raise exception 'academy_closed';end if;
  select coalesce(array_agg(id),'{}')into ids from(select id from academy.students subscriber where notifications and status='confirmed'and not exists(select 1 from academy.deliveries d where d.student_id=subscriber.id and kind='launch')order by created_at limit 25)x;
  insert into academy.campaigns(actor,revision,subject,body,recipients)values(auth.uid(),s.revision,s.launch_subject,s.launch_body,ids)returning id into v;
  return jsonb_build_object('id',v,'count',cardinality(ids),'subject',s.launch_subject,'body',s.launch_body,'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email))from academy.students where id=any(ids)),'[]'));
 end if;
 if p_action='launch_confirm'then
  if (p_data->>'confirmed')is distinct from 'true'then raise exception 'academy_confirmation_required';end if;
  perform 1 from academy.campaigns where id=(p_data->>'id')::uuid and actor=auth.uid()and ((state='preview'and expires_at>now()and revision=s.revision)or state='confirmed')for update;
  if not found or s.mode<>'course'then raise exception 'academy_preview_expired';end if;
  update academy.campaigns set state='confirmed'where id=(p_data->>'id')::uuid;
  insert into academy.events(event,actor,subject)values('launch_authorized',auth.uid(),(p_data->>'id')::uuid);return jsonb_build_object('ok',true);
 end if;
 if p_action='cleanup'then
  delete from academy.students where (status in('pending','cancelled')and last_activity<now()-interval '30 days')or last_activity<now()-interval '365 days';get diagnostics row_count=row_count;
  delete from academy.sessions where expires_at<now();delete from academy.tokens where expires_at<now()-interval '7 days';delete from academy.limits where expires_at<now();
  update academy.deliveries set payload=null where token_expires<now()-interval '7 days';delete from academy.events where created_at<now()-interval '180 days';delete from academy.metrics where day<current_date-365;
  insert into academy.events(event,actor,detail)values('retention_applied',auth.uid(),jsonb_build_object('removed',row_count));return jsonb_build_object('removed',row_count);
 end if;
 raise exception 'academy_action_invalid';
end;$$;
create function public.academy_service(p_action text,p_data jsonb default '{}')returns jsonb language plpgsql security definer set search_path=''as $$
declare s academy.settings;p academy.students;t academy.tokens;c academy.courses;b academy.campaigns;e academy.deliveries;u uuid;v uuid;r jsonb;d jsonb;limit_n integer;current_n integer;ref text;
begin
 select * into s from academy.settings where id=true;
 if p_action='config'then return jsonb_build_object('mode',s.mode,'waitlist_enabled',s.waitlist_enabled,'contact_name',s.contact_name,'contact_email',s.contact_email,'notice',(select to_jsonb(n)from academy.notices n where id=s.notice_id),'courses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',published->>'title','description',published->>'description'))from academy.courses where state='published'and s.mode='course'),'[]'));end if;
 if p_action='rate'then
  limit_n:=least(10000,greatest(1,(p_data->>'limit')::integer));
  insert into academy.limits(key,count,expires_at)values(p_data->>'key',1,now()+make_interval(secs=>least(86400,greatest(1,(p_data->>'seconds')::integer))))on conflict(key)do update set count=case when academy.limits.expires_at<now()then 1 else academy.limits.count+1 end,expires_at=case when academy.limits.expires_at<now()then excluded.expires_at else academy.limits.expires_at end returning count into current_n;
  return jsonb_build_object('allowed',current_n<=limit_n);
 end if;
 if p_action in('subscribe','login_request')then
  if p_action='subscribe'and(not s.waitlist_enabled or s.notice_id is null)then raise exception 'academy_closed';end if;
  if p_action='login_request'and s.mode<>'course'then raise exception 'academy_closed';end if;
  if coalesce(p_data->>'email','')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'or length(p_data->>'email')>254 then raise exception 'academy_invalid';end if;
  perform pg_advisory_xact_lock(hashtext('academy:'||lower(p_data->>'email')));
  select * into p from academy.students where email=lower(p_data->>'email')for update;
  if p_action='subscribe'and(p.status in('confirmed','invited')or (p_data->>'consent')is distinct from 'true')then return jsonb_build_object('accepted',true);end if;
  if p_action='login_request'and(p.id is null or p.confirmed_at is null)then return jsonb_build_object('accepted',true);end if;
  if p.last_sent_at>now()-interval '15 minutes'then return jsonb_build_object('accepted',true);end if;
  if p.id is null then
   if length(coalesce(p_data->>'name',''))not between 2 and 100 or length(coalesce(p_data->>'segment',''))not between 2 and 80 or length(coalesce(p_data->>'difficulty',''))not between 5 and 600 then raise exception 'academy_invalid';end if;
   insert into academy.students(email,name,segment,difficulty,utm)values(lower(p_data->>'email'),p_data->>'name',p_data->>'segment',p_data->>'difficulty',p_data->'utm')returning * into p;
   insert into academy.events(event,subject)values('registration_pending',p.id);
  end if;
  if p_action='subscribe'and(p_data->>'notice_id')::uuid is distinct from s.notice_id then raise exception 'academy_notice_changed';end if;
  update academy.students set last_sent_at=now()where id=p.id;
  insert into academy.tokens(hash,student_id,kind,payload,expires_at)values(p_data->>'token_hash',p.id,case when p_action='subscribe'then 'confirm'else 'login'end,jsonb_build_object('notice_id',s.notice_id),now()+case when p_action='subscribe'then interval '24 hours'else interval '15 minutes'end);
  insert into academy.tokens(hash,student_id,kind,expires_at)values(p_data->>'preferences_hash',p.id,'preferences',now()+interval '365 days');
  insert into academy.deliveries(id,student_id,kind,payload,token_expires)values((p_data->>'delivery_id')::uuid,p.id,case when p_action='subscribe'then 'confirm'else 'login'end,p_data->>'encrypted',now()+case when p_action='subscribe'then interval '24 hours'else interval '15 minutes'end);
  return jsonb_build_object('accepted',true);
 end if;
 if p_action='consume'then
  select * into t from academy.tokens where hash=p_data->>'hash'and kind in('confirm','login')and used_at is null and expires_at>now()for update;if not found then raise exception 'academy_link_invalid';end if;
  select * into p from academy.students where id=t.student_id for update;
  update academy.tokens set used_at=now()where hash=t.hash;
  if t.kind='confirm'then update academy.students set status='confirmed',notifications=true,confirmed_at=coalesce(confirmed_at,now()),notice_id=(t.payload->>'notice_id')::uuid,last_activity=now()where id=p.id;insert into academy.events(event,subject,detail)values('email_confirmed',p.id,jsonb_build_object('notice_id',t.payload->>'notice_id'));elsif p.confirmed_at is null then raise exception 'academy_link_invalid';end if;
  insert into academy.sessions(hash,student_id,expires_at)values(p_data->>'session_hash',p.id,now()+interval '7 days');return jsonb_build_object('confirmed',true,'name',p.name,'mode',s.mode);
 end if;
 if p_action in('preferences','unsubscribe','delete_student')then
  if coalesce(p_data->>'token_hash','')<>''then select student_id into u from academy.tokens where hash=p_data->>'token_hash'and kind='preferences'and expires_at>now()and used_at is null;if u is null then raise exception 'academy_link_invalid';end if;else u:=academy.actor(p_data->>'session_hash');end if;
  if p_action='preferences'then return(select jsonb_build_object('notifications',notifications,'name',name)from academy.students where id=u);end if;
  if (p_data->>'confirmed')is distinct from 'true'then raise exception 'academy_confirmation_required';end if;
  if p_action='delete_student'then delete from academy.students where id=u;insert into academy.events(event)values('student_deleted');return jsonb_build_object('deleted',true);end if;
  update academy.students set status='cancelled',notifications=false,last_activity=now()where id=u;update academy.tokens set used_at=now()where student_id=u and kind='confirm'and used_at is null;update academy.deliveries set status='skipped',payload=null,finished_at=now()where student_id=u and kind in('launch','confirm')and status='pending';insert into academy.events(event,subject)values('communications_cancelled',u);return jsonb_build_object('notifications',false);
 end if;
 if p_action='logout'then delete from academy.sessions where hash=p_data->>'session_hash';return jsonb_build_object('ok',true);end if;
 if p_action in('student','progress','material')then
  u:=academy.actor(p_data->>'session_hash');if s.mode<>'course'then raise exception 'academy_closed';end if;
  if p_action='student'then return jsonb_build_object('courses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'document',academy.visible(published))order by position)from academy.courses where state='published'and published is not null),'[]'),'progress',coalesce((select jsonb_agg(to_jsonb(x))from(select course_id,lesson_id,completed from academy.progress where student_id=u)x),'[]'),'materials',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'kind',a.kind))from academy.materials a where exists(select 1 from academy.courses live_course cross join lateral jsonb_array_elements(live_course.published->'modules')doc_mod cross join lateral jsonb_array_elements(doc_mod->'lessons')doc_lesson where live_course.state='published'and doc_lesson->>'published'='true'and doc_lesson->'materials'?a.id::text)),'[]'));end if;
  if p_action='progress'then
   select * into c from academy.courses where id=(p_data->>'course_id')::uuid and state='published';
   if not exists(select 1 from jsonb_array_elements(c.published->'modules')doc_mod cross join lateral jsonb_array_elements(doc_mod->'lessons')doc_lesson where doc_lesson->>'id'=p_data->>'lesson_id'and doc_lesson->>'published'='true')or jsonb_typeof(p_data->'completed') is distinct from 'boolean'then raise exception 'academy_not_found';end if;
   insert into academy.progress(student_id,course_id,lesson_id,completed)values(u,c.id,(p_data->>'lesson_id')::uuid,(p_data->>'completed')::boolean)on conflict(student_id,course_id,lesson_id)do update set completed=excluded.completed,updated_at=now();return jsonb_build_object('ok',true);
  end if;
  if not exists(select 1 from academy.courses live_course cross join lateral jsonb_array_elements(live_course.published->'modules')doc_mod cross join lateral jsonb_array_elements(doc_mod->'lessons')doc_lesson where live_course.state='published'and doc_lesson->>'published'='true'and doc_lesson->'materials'? (p_data->>'id'))then raise exception 'academy_not_found';end if;
  return(select to_jsonb(asset)from academy.materials asset where id=(p_data->>'id')::uuid and kind='material');
 end if;
 if p_action='cover'then return(select to_jsonb(asset)from academy.materials asset where id=(p_data->>'id')::uuid and kind='image'and s.mode='course'and exists(select 1 from academy.courses live_course where live_course.state='published'and live_course.published->>'cover'=asset.id::text));end if;
 if p_action='metric'then
  if p_data->>'event'not in('visit','course_access','syzia_interest')or length(coalesce(p_data->>'source',''))>80 then raise exception 'academy_invalid';end if;
  insert into academy.metrics(day,event,source,count)values(current_date,p_data->>'event',coalesce(p_data->>'source',''),1)on conflict(day,event,source)do update set count=academy.metrics.count+1;return jsonb_build_object('ok',true);
 end if;
 if p_action='campaign'then select * into b from academy.campaigns where id=(p_data->>'id')::uuid and state='confirmed'and expires_at>now()and revision=s.revision;if not found or s.mode<>'course'then raise exception 'academy_preview_expired';end if;return jsonb_build_object('campaign',to_jsonb(b),'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'name',name))from academy.students subscriber where id=any(b.recipients)and notifications and status='confirmed'and not exists(select 1 from academy.deliveries mail_row where mail_row.student_id=subscriber.id and mail_row.kind='launch')),'[]'));end if;
 if p_action='queue_launch'then
  select * into b from academy.campaigns where id=(p_data->>'campaign_id')::uuid and state='confirmed'and expires_at>now()and revision=s.revision for update;if not found or s.mode<>'course'then raise exception 'academy_preview_expired';end if;
  select * into p from academy.students where id=(p_data->>'student_id')::uuid and id=any(b.recipients)and notifications and status='confirmed'for update;if not found then return jsonb_build_object('skipped',true);end if;
  insert into academy.deliveries(id,student_id,kind,campaign_id,payload,token_expires)values((p_data->>'id')::uuid,p.id,'launch',b.id,p_data->>'encrypted',now()+interval '7 days')on conflict do nothing;get diagnostics current_n=row_count;
  if current_n=1 then insert into academy.tokens(hash,student_id,kind,expires_at)values(p_data->>'preferences_hash',p.id,'preferences',now()+interval '365 days');end if;return jsonb_build_object('queued',current_n=1);
 end if;
 if p_action='delivery_claim'then
  -- Serial budget reservation across workers. Uncertain attempts are never retried automatically.
  perform pg_advisory_xact_lock(hashtext('academy-mail-budget'));
  update academy.deliveries set status='uncertain',payload=null,error_code='delivery_uncertain',finished_at=now()where status='sending'and attempted_at<now()-interval '2 minutes';
  update academy.deliveries set status='skipped',payload=null,finished_at=now()where status='pending'and(token_expires<=now()or(kind='launch'and s.mode<>'course'));
  if(select count(*)from academy.deliveries where attempted_at>=current_date)>=least(1000,greatest(1,(p_data->>'daily_limit')::integer))or(select count(*)from academy.deliveries where attempted_at>=date_trunc('month',now()))>=least(30000,greatest(1,(p_data->>'monthly_limit')::integer))then return null;end if;
  select * into e from academy.deliveries where status='pending'and(kind<>'launch'or campaign_id=(p_data->>'campaign_id')::uuid)order by created_at for update skip locked limit 1;if not found then return null;end if;
  if e.kind='launch'and not exists(select 1 from academy.students where id=e.student_id and notifications and status='confirmed')then update academy.deliveries set status='skipped',payload=null,finished_at=now()where id=e.id;return null;end if;
  update academy.deliveries set status='sending',attempted_at=now()where id=e.id;return jsonb_build_object('id',e.id,'payload',e.payload);
 end if;
 if p_action='delivery_finish'then
  if p_data->>'status'not in('accepted','failed','uncertain')or coalesce(p_data->>'error_code','')not in('','email_authentication_failed','email_recipient_or_sender_rejected','email_rate_limited','email_not_configured','email_temporary_failure','email_delivery_failed','delivery_uncertain')then raise exception 'academy_invalid';end if;
  update academy.deliveries set status=p_data->>'status',error_code=p_data->>'error_code',payload=null,finished_at=now()where id=(p_data->>'id')::uuid and status='sending'returning * into e;
  if e.kind='launch'and e.status='accepted'then update academy.students set status='invited'where id=e.student_id and notifications and status='confirmed';end if;return jsonb_build_object('ok',true);
 end if;
 raise exception 'academy_action_invalid';
end;$$;
-- A real editable outline, never a fabricated video or a public course.
insert into academy.courses(draft,state)values(jsonb_build_object('title','Do improviso à organização','description','Como organizar seu negócio de prestação de serviços. Um minicurso gratuito para estruturar a rotina e colocar o conhecimento em prática.','audience','Prestadores de serviços, autônomos e pequenos empreendedores.','cover','','modules',(select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'title',x.title,'lessons','[]'::jsonb)order by x.n)from(values(1,'Organizando a base do negócio'),(2,'Presença digital profissional'),(3,'Atendimento e solicitações'),(4,'Agenda e rotina operacional'),(5,'Colocando tudo em prática'))x(n,title))),'preparing');
do $$declare r record;begin for r in select tablename from pg_tables where schemaname='academy'loop execute format('alter table academy.%I enable row level security',r.tablename);execute format('alter table academy.%I force row level security',r.tablename);end loop;end;$$;
revoke all on all tables in schema academy from public,anon,authenticated,service_role;
revoke all on all sequences in schema academy from public,anon,authenticated,service_role;
revoke all on all functions in schema academy from public,anon,authenticated,service_role;
revoke all on function public.academy_admin(text,jsonb),public.academy_service(text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.academy_admin(text,jsonb)to authenticated;
grant execute on function public.academy_service(text,jsonb)to service_role;
-- Dedicated PRIVATE bucket; no new client policies. Backend performs authorized transfers.
do $$begin if to_regclass('storage.buckets')is not null then insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('syzia-academy','syzia-academy',false,5242880,array['image/webp','application/pdf','text/plain','text/csv'])on conflict(id)do nothing;end if;end;$$;
commit;
