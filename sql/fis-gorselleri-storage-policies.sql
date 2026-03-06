begin;

drop policy if exists fis_gorselleri_select_authenticated on storage.objects;
drop policy if exists fis_gorselleri_insert_authenticated on storage.objects;
drop policy if exists fis_gorselleri_update_authenticated on storage.objects;
drop policy if exists fis_gorselleri_delete_authenticated on storage.objects;

create policy fis_gorselleri_select_authenticated
on storage.objects
for select
to authenticated
using (bucket_id = 'fis_gorselleri');

create policy fis_gorselleri_insert_authenticated
on storage.objects
for insert
to authenticated
with check (bucket_id = 'fis_gorselleri');

create policy fis_gorselleri_update_authenticated
on storage.objects
for update
to authenticated
using (bucket_id = 'fis_gorselleri')
with check (bucket_id = 'fis_gorselleri');

create policy fis_gorselleri_delete_authenticated
on storage.objects
for delete
to authenticated
using (bucket_id = 'fis_gorselleri');

commit;
