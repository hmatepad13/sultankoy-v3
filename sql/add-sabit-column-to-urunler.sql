begin;

alter table public.urunler
  add column if not exists sabit boolean not null default false;

update public.urunler
set sabit = false
where sabit is null;

create index if not exists idx_urunler_sabit
  on public.urunler (sabit);

commit;
