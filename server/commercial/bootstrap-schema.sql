create schema demo_bootstrap;
revoke all on schema demo_bootstrap from public;
-- Dedicated, empty PostgreSQL database only; no Supabase Auth users or real identities.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean not null default false,banned_until timestamptz,raw_user_meta_data jsonb not null default '{}');
create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;$$;
create function auth.uid()returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid;$$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.jwt(),auth.uid()to authenticated,anon;
