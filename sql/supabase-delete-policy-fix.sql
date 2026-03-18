begin;

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

do $$
declare
  tablo text;
  policy_kaydi record;
  tablolar text[] := array[
    'satis_fisleri',
    'satis_giris',
    'sut_giris',
    'giderler',
    'uretim',
    'sevkiyatlar'
  ];
begin
  foreach tablo in array tablolar loop
    if to_regclass('public.' || tablo) is not null then
      execute format('alter table public.%I enable row level security', tablo);

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

commit;
