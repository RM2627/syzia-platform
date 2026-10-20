-- Dedicated demonstration database only; never apply in operational Supabase.
begin;
do $$begin
 if not exists(select 1 from demo_private.identity where singleton and purpose='syzia-commercial-demo-054')then raise exception 'demo_database_required';end if;
end;$$;
alter table demo_private.identity add column schema_version integer not null default 55 check(schema_version=55);
create table demo_private.frozen_media(
 source_id uuid not null,media_id uuid not null,object_path text not null,sha256 text not null,
 mime text not null,bytes bytea not null,created_at timestamptz not null default clock_timestamp(),
 primary key(source_id,media_id,object_path,sha256)
);
alter table demo_private.frozen_media enable row level security;
alter table demo_private.frozen_media force row level security;
revoke all on demo_private.frozen_media from public,anon,authenticated,service_role;
commit;
