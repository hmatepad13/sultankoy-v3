begin;

create unique index if not exists bayiler_isim_unique_idx
on public.bayiler (lower(btrim(isim)));

create unique index if not exists urunler_isim_unique_idx
on public.urunler (lower(btrim(isim)));

create unique index if not exists ciftlikler_isim_unique_idx
on public.ciftlikler (lower(btrim(isim)));

commit;
