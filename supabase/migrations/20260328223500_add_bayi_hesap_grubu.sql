alter table public.bayiler
add column if not exists hesap_grubu text;

create index if not exists bayiler_hesap_grubu_idx
on public.bayiler (lower(hesap_grubu))
where hesap_grubu is not null;

update public.bayiler
set hesap_grubu = 'Karacadağ peynircilik'
where trim(lower(isim)) in (
  'karacadağ peynircilik otogar',
  'karacadağ peynircilik havaalani',
  'karacadağ peynircilik diclekent'
);

update public.bayiler
set hesap_grubu = 'Bademci'
where trim(lower(isim)) in (
  'bademci fabrika',
  'bademci hava alani',
  'bademci sultan',
  'bademci winston'
);
