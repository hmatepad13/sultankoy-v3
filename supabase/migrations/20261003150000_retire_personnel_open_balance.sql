-- Personel acik hesabi emekliye ayrildi; musteri cari hesabina dokunulmaz.
-- Gecmis fisler degistirilmez. Ekim ve sonrasi kapanislarda yalniz net aktarilir.
insert into public.finansal_mantik_yedekleri(id,fonksiyonlar,yetkiler,kayitlar)
select 'retire-personnel-open-20261003',
 (select jsonb_object_agg(p.proname,pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('app_close_period_core','app_personel_net_after_expenses')),
 (select jsonb_object_agg(p.proname,to_jsonb(p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('app_close_period_core','app_personel_net_after_expenses')),
 jsonb_build_object('personel_devirleri',(select jsonb_agg(to_jsonb(t) order by id) from public.satis_fisleri t where odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR')))
on conflict(id) do nothing;

-- open_balance sadece eski RPC imzasi uyumlulugu icin sifir sabitidir; hesaplanmaz.
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
      0::numeric as open_delta
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
      row_number() over(partition by g.personel_key order by tarih desc,same_day_order desc,id desc) as rn
    from grouped g
  )
  select b.personel_key,b.net_balance,0::numeric from balanced b where rn=1;
$$;

revoke all on function public.app_personel_net_after_expenses(date) from public,anon,authenticated;

do $$
declare v_old text; v_new text;
begin
 select fonksiyonlar->>'app_close_period_core' into strict v_old
 from public.finansal_mantik_yedekleri where id='retire-personnel-open-20261003';
 if position('net_balance,0,open_balance' in v_old)=0
 or position('where abs(net_balance)>0.01 or abs(open_balance)>0.01' in v_old)=0 then
   raise exception 'Beklenmeyen personel kapanis kodu; islem iptal.';
 end if;
 v_new:=replace(v_old,'net_balance,0,open_balance','net_balance,0,0');
 v_new:=replace(v_new,'where abs(net_balance)>0.01 or abs(open_balance)>0.01','where abs(net_balance)>0.01');
 execute v_new;
end;
$$;
revoke all on function public.app_close_period_core(text,uuid,text) from public,anon,authenticated;
