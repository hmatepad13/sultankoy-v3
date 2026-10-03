-- Personel hesaplarini ileriye donuk kapatir; finansal fisleri degistirmez.
create table if not exists public.personel_hesap_kapanislari (
  personel text primary key,
  kapanis_tarihi date not null,
  aciklama text not null,
  eski_devirler jsonb not null,
  onceki_kapanis_fonksiyonu text not null,
  created_at timestamptz not null default now()
);
alter table public.personel_hesap_kapanislari enable row level security;
revoke all on public.personel_hesap_kapanislari from anon, authenticated;

insert into public.personel_hesap_kapanislari
  (personel,kapanis_tarihi,aciklama,eski_devirler,onceki_kapanis_fonksiyonu)
select personel, '2026-10-01'::date,
  'Kullanici talebiyle personel hesabi kapatildi; gecmis islemler ve cari borclar korunur. Guncel takip Umit uzerinden devam eder.',
  coalesce((select jsonb_agg(to_jsonb(sf) order by sf.tarih,sf.id)
    from public.satis_fisleri sf
    where sf.odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR')
      and public.app_normalize_username((regexp_match(coalesce(sf.aciklama,''),'\((.*?)\)'))[1]) = personel), '[]'::jsonb),
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='app_close_period_core')
from unnest(array['admin','yusuf','akif','deneme']) as hesap(personel)
on conflict (personel) do nothing;

-- Canli kapanis fonksiyonunun diger islemlerini aynen koru.
do $$
declare v_definition text; v_marker text;
begin
  select pg_get_functiondef(p.oid) into strict v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='app_close_period_core';
  if position('personel_hesap_kapanislari' in v_definition)>0 then return; end if;
  v_marker := 'and public.app_normalize_username(username) not in (''admin'', ''yusuf'')';
  if position(v_marker in v_definition)=0 then
    raise exception 'Kapanis fonksiyonu beklenen yapida degil.';
  end if;
  v_definition := replace(v_definition,v_marker,v_marker || '
      and not exists (
        select 1 from public.personel_hesap_kapanislari kapanis
        where kapanis.personel = public.app_normalize_username(username)
          and kapanis.kapanis_tarihi <= v_next_date
      )');
  execute v_definition;
end;
$$;
