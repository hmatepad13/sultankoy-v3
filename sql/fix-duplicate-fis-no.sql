begin;

lock table public.satis_fisleri in share row exclusive mode;
lock table public.satis_giris in share row exclusive mode;

do $$
declare
  v_conflict record;
begin
  for v_conflict in
    with duplicate_fisler as (
      select fis_no
      from public.satis_fisleri
      where fis_no is not null
        and btrim(fis_no) <> ''
      group by fis_no
      having count(*) > 1
    )
    select
      d.fis_no,
      count(g.*) as detay_sayisi
    from duplicate_fisler d
    left join public.satis_giris g
      on g.fis_no = d.fis_no
    group by d.fis_no
  loop
    if v_conflict.detay_sayisi > 0 then
      raise exception
        'fis_no % birden fazla fis kaydinda kullaniliyor ve buna bagli % satis detayi var. Manuel inceleme gerekli.',
        v_conflict.fis_no,
        v_conflict.detay_sayisi;
    end if;
  end loop;
end $$;

with ranked as (
  select
    id,
    fis_no,
    row_number() over (
      partition by fis_no
      order by created_at nulls first, id
    ) as rn
  from public.satis_fisleri
  where fis_no is not null
    and btrim(fis_no) <> ''
)
update public.satis_fisleri as fis
set fis_no = ranked.fis_no || '-DUP-' || fis.id::text
from ranked
where fis.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists satis_fisleri_fis_no_unique_idx
on public.satis_fisleri (fis_no)
where fis_no is not null
  and btrim(fis_no) <> '';

create index if not exists satis_giris_fis_no_idx
on public.satis_giris (fis_no);

commit;
