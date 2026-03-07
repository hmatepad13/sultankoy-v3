begin;

create or replace function public.is_admin_email()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@sistem.local');
$$;

create or replace function public.can_delete_owned_record(kayit_ekleyen text)
returns boolean
language sql
stable
as $$
  select
    public.is_admin_email()
    or lower(coalesce(kayit_ekleyen, '')) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

do $$
declare
  tablo text;
  tablolar text[] := array[
    'satis_fisleri',
    'satis_giris',
    'sut_giris',
    'giderler',
    'uretim'
  ];
begin
  foreach tablo in array tablolar loop
    if to_regclass('public.' || tablo) is not null then
      execute format('alter table public.%I enable row level security', tablo);

      execute format('drop policy if exists app_delete_authenticated on public.%I', tablo);
      execute format('drop policy if exists app_delete_owner_or_admin on public.%I', tablo);

      execute format(
        'create policy app_delete_owner_or_admin on public.%I for delete to authenticated using (public.can_delete_owned_record(ekleyen))',
        tablo
      );
    end if;
  end loop;
end $$;

commit;
