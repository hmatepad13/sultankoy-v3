begin;

alter table public.giderler
  add column if not exists gorsel text;

commit;
