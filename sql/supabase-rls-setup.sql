-- Sultankoy RLS setup
-- Run this in Supabase SQL Editor on a clean or reset database.

begin;

grant usage on schema public to authenticated;

create or replace function public.is_admin_email()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@sistem.local');
$$;

create or replace function public.current_requester_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.matches_requester_email(kayit_ekleyen text)
returns boolean
language sql
stable
as $$
  select
    public.is_admin_email()
    or lower(coalesce(nullif(btrim(kayit_ekleyen), ''), public.current_requester_email())) = public.current_requester_email();
$$;

create or replace function public.can_manage_owned_record(kayit_created_by uuid, kayit_ekleyen text)
returns boolean
language sql
stable
as $$
  select
    public.is_admin_email()
    or auth.uid() = kayit_created_by
    or public.matches_requester_email(kayit_ekleyen);
$$;

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
  generic_tables text[] := array[
    'ciftlikler',
    'bayiler',
    'urunler',
    'cop_kutusu',
    'gider_turleri'
  ];
begin
  foreach tablo in array generic_tables loop
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

do $$
declare
  tablo text;
  policy_kaydi record;
  owned_tables text[] := array[
    'sut_giris',
    'satis_fisleri',
    'satis_giris',
    'giderler',
    'uretim',
    'sevkiyatlar'
  ];
begin
  foreach tablo in array owned_tables loop
    if to_regclass('public.' || tablo) is not null then
      execute format('alter table public.%I enable row level security', tablo);
      execute format('grant select, insert, update, delete on public.%I to authenticated', tablo);

      execute format('drop policy if exists app_select_authenticated on public.%I', tablo);

      for policy_kaydi in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = tablo
          and cmd in ('INSERT', 'UPDATE', 'DELETE')
      loop
        execute format('drop policy if exists %I on public.%I', policy_kaydi.policyname, tablo);
      end loop;

      execute format(
        'create policy app_select_authenticated on public.%I for select to authenticated using (true)',
        tablo
      );
      execute format(
        'create policy app_insert_owner_only on public.%I for insert to authenticated with check (auth.uid() = created_by and public.matches_requester_email(ekleyen))',
        tablo
      );
      execute format(
        'create policy app_update_owner_or_admin on public.%I for update to authenticated using (public.can_manage_owned_record(created_by, ekleyen)) with check (public.can_manage_owned_record(created_by, ekleyen) and (auth.uid() = created_by or public.is_admin_email()))',
        tablo
      );
      execute format(
        'create policy app_delete_owner_or_admin on public.%I for delete to authenticated using (public.can_manage_owned_record(created_by, ekleyen))',
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
with check (public.is_admin_email());

create policy app_permissions_update_admin
on public.kullanici_yetkileri
for update
to authenticated
using (public.is_admin_email())
with check (public.is_admin_email());

create policy app_permissions_delete_admin
on public.kullanici_yetkileri
for delete
to authenticated
using (public.is_admin_email());

commit;
