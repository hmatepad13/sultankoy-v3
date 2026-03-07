begin;

alter table public.bayiler
  add column if not exists aktif boolean not null default true;

alter table public.urunler
  add column if not exists aktif boolean not null default true;

alter table public.ciftlikler
  add column if not exists aktif boolean not null default true;

update public.bayiler
set aktif = true
where aktif is null;

update public.urunler
set aktif = true
where aktif is null;

update public.ciftlikler
set aktif = true
where aktif is null;

create index if not exists idx_bayiler_aktif
  on public.bayiler (aktif);

create index if not exists idx_urunler_aktif
  on public.urunler (aktif);

create index if not exists idx_ciftlikler_aktif
  on public.ciftlikler (aktif);

commit;
