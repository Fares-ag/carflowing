-- Storage RLS policies for vehicle-images bucket
-- Run in Supabase SQL Editor

drop policy if exists "vehicle_images_upload" on storage.objects;
create policy "vehicle_images_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'vehicle-images');

drop policy if exists "vehicle_images_select" on storage.objects;
create policy "vehicle_images_select"
on storage.objects for select
to public
using (bucket_id = 'vehicle-images');

drop policy if exists "vehicle_images_update" on storage.objects;
create policy "vehicle_images_update"
on storage.objects for update
to authenticated
using (bucket_id = 'vehicle-images');

drop policy if exists "vehicle_images_delete" on storage.objects;
create policy "vehicle_images_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'vehicle-images');

-- user-avatars (dealer logos, profile avatars)
drop policy if exists "user_avatars_upload" on storage.objects;
create policy "user_avatars_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'user-avatars');

drop policy if exists "user_avatars_select" on storage.objects;
create policy "user_avatars_select"
on storage.objects for select
to public
using (bucket_id = 'user-avatars');

drop policy if exists "user_avatars_update" on storage.objects;
create policy "user_avatars_update"
on storage.objects for update
to authenticated
using (bucket_id = 'user-avatars');

drop policy if exists "user_avatars_delete" on storage.objects;
create policy "user_avatars_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'user-avatars');

-- documents (private bucket)
drop policy if exists "documents_upload" on storage.objects;
create policy "documents_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'documents');

drop policy if exists "documents_select" on storage.objects;
create policy "documents_select"
on storage.objects for select
to authenticated
using (bucket_id = 'documents');

drop policy if exists "documents_update" on storage.objects;
create policy "documents_update"
on storage.objects for update
to authenticated
using (bucket_id = 'documents');

drop policy if exists "documents_delete" on storage.objects;
create policy "documents_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'documents');
