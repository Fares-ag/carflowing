-- Restrict documents bucket so users can only access their own folder (path: {user_id}/...)
drop policy if exists "documents_upload" on storage.objects;
create policy "documents_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "documents_select" on storage.objects;
create policy "documents_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "documents_update" on storage.objects;
create policy "documents_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "documents_delete" on storage.objects;
create policy "documents_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
