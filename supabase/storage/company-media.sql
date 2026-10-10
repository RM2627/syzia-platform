-- Separate namespace: company presentation images, NEVER customer request files.
-- Apply once to a dedicated TEST project after migration 009.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('company-media','company-media',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy company_media_no_direct_access on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'company-media') with check(bucket_id<>'company-media');
commit;
