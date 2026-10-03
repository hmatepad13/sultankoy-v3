-- Ekim mutabakatli acilisi korunur. Eski donemler yeni kuralla yeniden yazilmaz.
create table if not exists public.finansal_mantik_yedekleri (
  id text primary key,
  fonksiyonlar jsonb not null,
  yetkiler jsonb not null,
  kayitlar jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.finansal_mantik_yedekleri enable row level security;
revoke all on public.finansal_mantik_yedekleri from public, anon, authenticated;

insert into public.finansal_mantik_yedekleri(id,fonksiyonlar,yetkiler,kayitlar)
select 'net-after-expenses-20261003',
  (select jsonb_object_agg(p.proname,pg_get_functiondef(p.oid))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
     ('app_close_period_core','app_recalculate_future_devirs_for_satis_date')),
  (select jsonb_object_agg(p.proname,to_jsonb(p.proacl))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
     ('app_close_period_core','app_recalculate_future_devirs_for_satis_date')),
  jsonb_build_object(
    'satis_fisleri',(select jsonb_agg(to_jsonb(t) order by id) from public.satis_fisleri t),
    'satis_giris',(select jsonb_agg(to_jsonb(t) order by id) from public.satis_giris t),
    'giderler',(select jsonb_agg(to_jsonb(t) order by id) from public.giderler t),
    'mutabakatlar',(select jsonb_agg(to_jsonb(t)) from public.personel_net_mutabakatlari t),
    'kapanislar',(select jsonb_agg(to_jsonb(t)) from public.personel_hesap_kapanislari t)
  )
on conflict(id) do nothing;

-- Salt-okunur net: son personel devri bir acilistir, onceki olaylari sifirlar.
-- Ayni gun acilis her zaman tahsilat ve giderden once islenir.
create or replace function public.app_personel_net_after_expenses(p_before_date date)
returns table(personel_key text, net_balance numeric, open_balance numeric)
language sql stable security definer set search_path=public as $$
  with aktif_personel as (
    select distinct public.app_normalize_username(username) as personel_key
    from public.profiles
    where coalesce(role,'calisan')='calisan'
      and nullif(public.app_normalize_username(username),'') is not null
      and public.app_normalize_username(username) not in ('admin','yusuf')
      and not exists (
        select 1 from public.personel_hesap_kapanislari k
        where k.personel=public.app_normalize_username(username)
          and k.kapanis_tarihi<=p_before_date
      )
  ), fis_events as (
    select sf.id, sf.tarih,
      case when sf.odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR')
        then public.app_normalize_username((regexp_match(coalesce(sf.aciklama,''),'\((.*?)\)'))[1])
        else public.app_normalize_username(sf.ekleyen) end as personel_key,
      case when sf.odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR') then 1 else 0 end as is_reset,
      case when sf.odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR') then 0 else 1 end as same_day_order,
      case when sf.odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR') then coalesce(sf.toplam_tutar,0)
           when sf.odeme_turu in ('KASAYA DEVIR','KASAYA DEVİR') then -coalesce(sf.tahsilat,0)
           else coalesce(sf.tahsilat,0) end::numeric as net_delta,
      case when sf.odeme_turu in ('KASAYA DEVIR','KASAYA DEVİR') then 0
           else coalesce(sf.kalan_bakiye,0) end::numeric as open_delta
    from public.satis_fisleri sf
    where sf.tarih<p_before_date
      and coalesce(sf.odeme_turu,'') not in ('DEVIR','DEVİR')
      and (coalesce(sf.odeme_turu,'') not in ('PERSONEL DEVIR','PERSONEL DEVİR')
           or sf.bayi='SİSTEM İŞLEMİ')
  ), events as (
    select * from fis_events
    union all
    select g.id,g.tarih,public.app_normalize_username(g.ekleyen),0,2,
      -coalesce(g.tutar,0)::numeric,0::numeric
    from public.giderler g where g.tarih<p_before_date
  ), grouped as (
    select e.*,
      sum(is_reset) over(partition by e.personel_key order by tarih,same_day_order,id
        rows between unbounded preceding and current row) as reset_group
    from events e join aktif_personel ap on ap.personel_key=e.personel_key
  ), balanced as (
    select g.personel_key,
      sum(net_delta) over(partition by g.personel_key,reset_group) as net_balance,
      sum(open_delta) over(partition by g.personel_key,reset_group) as open_balance,
      row_number() over(partition by g.personel_key order by tarih desc,same_day_order desc,id desc) as rn
    from grouped g
  )
  select b.personel_key,b.net_balance,b.open_balance from balanced b where rn=1;
$$;
revoke all on function public.app_personel_net_after_expenses(date) from public,anon,authenticated;

-- Cari devir kodunu degistirmeden yalniz personel hesap bolumunu degistir.
do $$
declare
  v_old text; v_new text; v_start integer; v_end integer;
  v_lock text := 'perform pg_advisory_xact_lock(hashtext(''app_close_period_'' || p_aktif_donem));';
begin
  select fonksiyonlar->>'app_close_period_core' into strict v_old
  from public.finansal_mantik_yedekleri where id='net-after-expenses-20261003';
  if v_old is null then raise exception 'Onceki kapanis fonksiyonu bulunamadi.'; end if;
  execute replace(v_old,'FUNCTION public.app_close_period_core(',
    'FUNCTION public.app_close_period_before_202610_core(');
  v_start:=position('with aktif_personel as (' in v_old);
  v_end:=position('get diagnostics v_personel_count = row_count;' in v_old);
  if v_start=0 or v_end<=v_start or position(v_lock in v_old)=0 then
    raise exception 'Kapanis fonksiyonu beklenen yapida degil; degisiklik iptal.';
  end if;
  v_new:=overlay(v_old placing $replacement$
  select public.app_new_fis_no('PDEVIR'),v_next_date,'SİSTEM İŞLEMİ',null,
    net_balance,0,open_balance,'PERSONEL DEVİR',
    p_aktif_donem || ' Personel Devir (' || personel_key || ')',
    v_requester_email,v_requester_id
  from public.app_personel_net_after_expenses(v_next_date)
  where abs(net_balance)>0.01 or abs(open_balance)>0.01;

  $replacement$ from v_start for v_end-v_start);
  v_new:=replace(v_new,v_lock,$guard$
  if substring(p_aktif_donem from 6 for 2)::integer not between 1 and 12 then
    raise exception 'Gecersiz ay.';
  end if;
  if p_aktif_donem<'2026-10' then
    return public.app_close_period_before_202610_core(p_aktif_donem,p_requester_id,p_requester_email);
  end if;
  $guard$ || v_lock);
  execute v_new;
end;
$$;

-- Gider INSERT/UPDATE/DELETE (geri yukleme dahil) sonraki mevcut devirleri yeniler.
-- Mutabakat oncesi giderler Ekim acilisina tekrar uygulanmaz.
create or replace function public.app_giderler_auto_recalculate_devirs()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_date date;
begin
  if tg_op='UPDATE' and new.tarih is not distinct from old.tarih
     and new.tutar is not distinct from old.tutar
     and new.ekleyen is not distinct from old.ekleyen then return new; end if;
  if tg_op='INSERT' then v_date:=new.tarih;
  elsif tg_op='DELETE' then v_date:=old.tarih;
  else v_date:=least(old.tarih,new.tarih); end if;
  perform public.app_recalculate_future_devirs_for_satis_date(
    greatest(v_date,'2026-10-01'::date));
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.app_giderler_auto_recalculate_devirs() from public,anon,authenticated;
drop trigger if exists trg_giderler_auto_recalculate_devirs on public.giderler;
create trigger trg_giderler_auto_recalculate_devirs
after insert or update or delete on public.giderler
for each row execute function public.app_giderler_auto_recalculate_devirs();

-- Ic fonksiyonlar yalniz yetkili wrapper/trigger tarafindan calistirilir.
revoke all on function public.app_close_period_core(text,uuid,text) from public,anon,authenticated;
revoke all on function public.app_close_period_before_202610_core(text,uuid,text) from public,anon,authenticated;
revoke all on function public.app_recalculate_future_devirs_for_satis_date(date,uuid,text) from public,anon,authenticated;
