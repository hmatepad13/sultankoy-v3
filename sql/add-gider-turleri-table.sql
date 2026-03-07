begin;

create table if not exists public.gider_turleri (
  id uuid primary key default gen_random_uuid(),
  isim text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists gider_turleri_isim_unique_idx
on public.gider_turleri (lower(btrim(isim)));

insert into public.gider_turleri (isim)
values
  ('Araç Yakıt'),
  ('Süt Ödemesi'),
  ('Yemek'),
  ('Sarf Malzeme'),
  ('Genel Gider'),
  ('Nakliye'),
  ('Maaş'),
  ('Araç Bakım'),
  ('Elektrik Ödemesi'),
  ('Süt Katkıları'),
  ('Tamirat Tadilat'),
  ('Katı Yakacak'),
  ('Sermaye Girişi'),
  ('Kar Paylaşımı'),
  ('Kova Satışı'),
  ('süt nakliye'),
  ('yoğurt nakliye'),
  ('tahsilat'),
  ('banka kesintisi')
on conflict do nothing;

alter table public.gider_turleri enable row level security;

grant select, insert, update, delete on public.gider_turleri to authenticated;

drop policy if exists app_select_authenticated on public.gider_turleri;
drop policy if exists app_insert_authenticated on public.gider_turleri;
drop policy if exists app_update_authenticated on public.gider_turleri;
drop policy if exists app_delete_authenticated on public.gider_turleri;

create policy app_select_authenticated
on public.gider_turleri
for select
to authenticated
using (true);

create policy app_insert_authenticated
on public.gider_turleri
for insert
to authenticated
with check (true);

create policy app_update_authenticated
on public.gider_turleri
for update
to authenticated
using (true)
with check (true);

create policy app_delete_authenticated
on public.gider_turleri
for delete
to authenticated
using (true);

commit;
