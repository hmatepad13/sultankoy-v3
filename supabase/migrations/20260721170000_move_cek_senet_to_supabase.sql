create table if not exists public.cek_senet_kayitlari (
  id text primary key default gen_random_uuid()::text,
  tur text not null check (tur in ('verilen_cek', 'alinan_cek', 'verilen_senet', 'alinan_senet')),
  tarih date not null,
  duzenleyen text not null,
  tah_tarihi date not null,
  miktar numeric not null check (miktar > 0),
  banka text not null,
  durum text not null default 'bekliyor'
    check (durum in ('bekliyor', 'tahsil_edildi', 'iade', 'iptal', 'karsiliksiz')),
  tahsil_edilme_tarihi date,
  on_yuz_foto text,
  arka_yuz_foto text,
  ekleyen text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cek_senet_kayitlari_tarih_idx
on public.cek_senet_kayitlari (tarih desc, created_at desc);

create index if not exists cek_senet_kayitlari_created_by_idx
on public.cek_senet_kayitlari (created_by);

create or replace function public.app_cek_senet_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cek_senet_set_updated_at on public.cek_senet_kayitlari;
create trigger trg_cek_senet_set_updated_at
before update on public.cek_senet_kayitlari
for each row
execute function public.app_cek_senet_set_updated_at();

alter table public.cek_senet_kayitlari enable row level security;

grant select, insert, update, delete on public.cek_senet_kayitlari to authenticated;

drop policy if exists app_cek_senet_select_authenticated on public.cek_senet_kayitlari;
drop policy if exists app_cek_senet_insert_owner on public.cek_senet_kayitlari;
drop policy if exists app_cek_senet_update_owner_or_admin on public.cek_senet_kayitlari;
drop policy if exists app_cek_senet_delete_owner_or_admin on public.cek_senet_kayitlari;

create policy app_cek_senet_select_authenticated
on public.cek_senet_kayitlari
for select
to authenticated
using (true);

create policy app_cek_senet_insert_owner
on public.cek_senet_kayitlari
for insert
to authenticated
with check (created_by = auth.uid());

create policy app_cek_senet_update_owner_or_admin
on public.cek_senet_kayitlari
for update
to authenticated
using (created_by = auth.uid() or public.is_admin_email())
with check (created_by = auth.uid() or public.is_admin_email());

create policy app_cek_senet_delete_owner_or_admin
on public.cek_senet_kayitlari
for delete
to authenticated
using (created_by = auth.uid() or public.is_admin_email());
