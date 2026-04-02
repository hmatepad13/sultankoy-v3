begin;

alter table public.sut_giris
  add column if not exists gorsel text;

commit;
