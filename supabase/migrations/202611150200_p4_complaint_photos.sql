-- Photos on complaints (proposed by P1 Naman for P4 Jaymin to review and merge).
--
-- A complaint can carry one photo. Photos live in a PRIVATE bucket: there are no storage
-- policies for it, so students (anon / authenticated) can't list, read or write it. Only the AI
-- service, with the service role key, uploads and creates short-lived signed links for admins.
-- complaints.photo_path is the path inside the bucket, e.g. 2026-11-15/3f2c...e1.jpg.

alter table complaints add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-photos', 'complaint-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
