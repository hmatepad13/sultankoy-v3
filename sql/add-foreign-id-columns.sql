begin;

alter table public.satis_fisleri
  add column if not exists bayi_id uuid;

alter table public.satis_giris
  add column if not exists bayi_id uuid,
  add column if not exists urun_id uuid;

alter table public.sut_giris
  add column if not exists ciftlik_id uuid;

create index if not exists idx_satis_fisleri_bayi_id
  on public.satis_fisleri (bayi_id);

create index if not exists idx_satis_giris_bayi_id
  on public.satis_giris (bayi_id);

create index if not exists idx_satis_giris_urun_id
  on public.satis_giris (urun_id);

create index if not exists idx_sut_giris_ciftlik_id
  on public.sut_giris (ciftlik_id);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'satis_fisleri'
      and constraint_name = 'satis_fisleri_bayi_id_fkey'
  ) then
    alter table public.satis_fisleri
      add constraint satis_fisleri_bayi_id_fkey
      foreign key (bayi_id) references public.bayiler(id)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'satis_giris'
      and constraint_name = 'satis_giris_bayi_id_fkey'
  ) then
    alter table public.satis_giris
      add constraint satis_giris_bayi_id_fkey
      foreign key (bayi_id) references public.bayiler(id)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'satis_giris'
      and constraint_name = 'satis_giris_urun_id_fkey'
  ) then
    alter table public.satis_giris
      add constraint satis_giris_urun_id_fkey
      foreign key (urun_id) references public.urunler(id)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'sut_giris'
      and constraint_name = 'sut_giris_ciftlik_id_fkey'
  ) then
    alter table public.sut_giris
      add constraint sut_giris_ciftlik_id_fkey
      foreign key (ciftlik_id) references public.ciftlikler(id)
      on update cascade
      on delete set null;
  end if;
end $$;

commit;
