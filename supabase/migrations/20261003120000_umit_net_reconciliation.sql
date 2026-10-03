-- Net/kasa mutabakati: yalniz 2026-10 personel acilis devri.
-- Eski fis snapshot'i geri donus ve denetim icin saklanir.
create table if not exists public.personel_net_mutabakatlari (
  id text primary key,
  personel text not null,
  devir_tarihi date not null,
  fark numeric not null,
  aciklama text not null,
  onceki_fis jsonb not null,
  created_at timestamptz not null default now(),
  unique(personel, devir_tarihi)
);
alter table public.personel_net_mutabakatlari enable row level security;
revoke all on public.personel_net_mutabakatlari from anon, authenticated;

create or replace function public.app_personel_net_mutabakatini_uygula()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fark numeric;
begin
  if new.odeme_turu in ('PERSONEL DEVIR', 'PERSONEL DEVİR')
     and new.bayi = 'SİSTEM İŞLEMİ' then
    select fark into v_fark from public.personel_net_mutabakatlari
    where devir_tarihi = new.tarih
      and personel = public.app_normalize_username(
        (regexp_match(coalesce(new.aciklama, ''), '\((.*?)\)'))[1]);
    if found then new.toplam_tutar := new.toplam_tutar + v_fark; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.app_personel_net_mutabakatini_uygula() from public;
drop trigger if exists personel_net_mutabakati on public.satis_fisleri;
create trigger personel_net_mutabakati before insert on public.satis_fisleri
for each row execute function public.app_personel_net_mutabakatini_uygula();

do $$
declare v_fis public.satis_fisleri%rowtype;
begin
  if exists (select 1 from public.personel_net_mutabakatlari
             where id = 'umit-20261001-net-6305000') then return; end if;
  select * into strict v_fis from public.satis_fisleri
  where tarih = '2026-10-01' and bayi = 'SİSTEM İŞLEMİ'
    and odeme_turu in ('PERSONEL DEVIR', 'PERSONEL DEVİR')
    and aciklama = '2026-09 Personel Devir (umit)' for update;
  if v_fis.toplam_tutar <> 7133547 then
    raise exception 'Beklenen devir degisti; mutabakat iptal edildi.';
  end if;
  insert into public.personel_net_mutabakatlari
    (id,personel,devir_tarihi,fark,aciklama,onceki_fis)
  values ('umit-20261001-net-6305000','umit','2026-10-01',-6305000,
    'Kullanici onayli gecmis net/kasa bakiye mutabakati. Satis, tahsilat, gider ve cari borc degismez.',
    to_jsonb(v_fis));
  update public.satis_fisleri set toplam_tutar = toplam_tutar - 6305000
  where id = v_fis.id;
end;
$$;
