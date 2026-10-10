-- Apply ONLY to a dedicated TEST Supabase after migrations 001–008.
-- Intentionally outside local auth/storage shims. No client upload/download policies.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('consumer-private','consumer-private',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Restrictive guard protects this bucket even if a broad permissive policy exists elsewhere.
create policy consumer_private_no_client_access on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'consumer-private') with check(bucket_id<>'consumer-private');
commit;
