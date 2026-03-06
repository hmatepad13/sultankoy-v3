-- Sultankoy RLS setup
-- Run this in Supabase SQL Editor.

begin;

grant usage on schema public to authenticated;

create table if not exists public.kullanici_yetkileri (
  username text primary key,
  tabs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_kullanici_yetkileri_updated_at on public.kullanici_yetkileri;
create trigger trg_kullanici_yetkileri_updated_at
before update on public.kullanici_yetkileri
for each row
execute function public.set_updated_at();

do $$
declare
  tablo text;
  tablolar text[] := array[
    'ciftlikler',
    'bayiler',
    'urunler',
    'sut_giris',
    'satis_fisleri',
    'satis_giris',
    'giderler',
    'uretim',
    'cop_kutusu'
  ];
begin
  foreach tablo in array tablolar loop
    if to_regclass('public.' || tablo) is not null then
      execute format('alter table public.%I enable row level security', tablo);
      execute format('grant select, insert, update, delete on public.%I to authenticated', tablo);

      execute format('drop policy if exists app_select_authenticated on public.%I', tablo);
      execute format('drop policy if exists app_insert_authenticated on public.%I', tablo);
      execute format('drop policy if exists app_update_authenticated on public.%I', tablo);
      execute format('drop policy if exists app_delete_authenticated on public.%I', tablo);

      execute format(
        'create policy app_select_authenticated on public.%I for select to authenticated using (true)',
        tablo
      );
      execute format(
        'create policy app_insert_authenticated on public.%I for insert to authenticated with check (true)',
        tablo
      );
      execute format(
        'create policy app_update_authenticated on public.%I for update to authenticated using (true) with check (true)',
        tablo
      );
      execute format(
        'create policy app_delete_authenticated on public.%I for delete to authenticated using (true)',
        tablo
      );
    end if;
  end loop;
end $$;

alter table public.kullanici_yetkileri enable row level security;
grant select on public.kullanici_yetkileri to authenticated;
grant insert, update, delete on public.kullanici_yetkileri to authenticated;

drop policy if exists app_permissions_select_authenticated on public.kullanici_yetkileri;
drop policy if exists app_permissions_insert_admin on public.kullanici_yetkileri;
drop policy if exists app_permissions_update_admin on public.kullanici_yetkileri;
drop policy if exists app_permissions_delete_admin on public.kullanici_yetkileri;

create policy app_permissions_select_authenticated
on public.kullanici_yetkileri
for select
to authenticated
using (true);

create policy app_permissions_insert_admin
on public.kullanici_yetkileri
for insert
to authenticated
with check ((select auth.jwt() ->> 'email') in ('admin@sistem.local'));

create policy app_permissions_update_admin
on public.kullanici_yetkileri
for update
to authenticated
using ((select auth.jwt() ->> 'email') in ('admin@sistem.local'))
with check ((select auth.jwt() ->> 'email') in ('admin@sistem.local'));

create policy app_permissions_delete_admin
on public.kullanici_yetkileri
for delete
to authenticated
using ((select auth.jwt() ->> 'email') in ('admin@sistem.local'));

commit;
