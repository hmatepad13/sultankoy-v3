-- Tek Net hesabi. Cari hesap fonksiyonlari ve finansal kayitlar degistirilmez.
insert into public.finansal_mantik_yedekleri(id,fonksiyonlar,yetkiler,kayitlar)
select 'single-net-20261003',
 (select jsonb_object_agg(p.proname,pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('app_close_period_core','app_close_period_before_202610_core','app_personel_net_after_expenses')),
 (select jsonb_object_agg(p.proname,to_jsonb(p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('app_close_period_core','app_close_period_before_202610_core','app_personel_net_after_expenses')),
 jsonb_build_object('satis_fisleri',(select jsonb_agg(to_jsonb(t) order by id) from public.satis_fisleri t),'giderler',(select jsonb_agg(to_jsonb(t) order by id) from public.giderler t))
on conflict(id) do nothing;

create table if not exists public.net_baslangici (
 personel text primary key check(personel='umit'),
 tarih date not null,
 tutar numeric not null,
 arsiv jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.net_baslangici enable row level security;
revoke all on public.net_baslangici from public,anon,authenticated;

-- Gun basindaki bakiye sabitlenir; bugun ve sonrasi hareketler normal hesaplanir.
-- Ikinci calistirmada baslangic yeniden alinmaz.
insert into public.net_baslangici(personel,tarih,tutar,arsiv)
select 'umit','2026-10-03',
 coalesce((select net_balance from public.app_personel_net_after_expenses('2026-10-03') where personel_key='umit'),0),
 coalesce((select jsonb_object_agg(d.donem,b.net_balance)
 from (select distinct to_char(tarih,'YYYY-MM') as donem from public.satis_fisleri where tarih<'2026-10-01') d
 cross join lateral public.app_personel_net_after_expenses((to_date(d.donem||'-01','YYYY-MM-DD')+interval '1 month')::date) b
 where b.personel_key='umit'),'{}'::jsonb)
where not exists(select 1 from public.net_baslangici where personel='umit');

-- Eski imza (open_balance) artik yok. Yalniz Net hesaplanir.
drop function public.app_personel_net_after_expenses(date);
create function public.app_personel_net_after_expenses(p_before_date date)
returns table(personel_key text,net_balance numeric)
language sql stable security definer set search_path=public as $$
 with baseline as (select * from public.net_baslangici where personel='umit'),
 events as (
  select 0::bigint as id,b.tarih,0 as sira,1 as reset,b.tutar as delta from baseline b
  union all
  select f.id,f.tarih,case when f.odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR') then 0 else 1 end,
   case when f.odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR') then 1 else 0 end,
   case when f.odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR') then f.toplam_tutar else f.tahsilat end
  from public.satis_fisleri f cross join baseline b
  where f.tarih>=b.tarih and f.tarih<p_before_date
   and ((f.bayi='SİSTEM İŞLEMİ' and f.odeme_turu in ('PERSONEL DEVIR','PERSONEL DEVİR') and public.app_normalize_username((regexp_match(coalesce(f.aciklama,''),'\((.*?)\)'))[1])='umit')
    or (f.bayi is distinct from 'SİSTEM İŞLEMİ' and coalesce(f.odeme_turu,'') not in ('DEVIR','DEVİR','PERSONEL DEVIR','PERSONEL DEVİR') and public.app_normalize_username(f.ekleyen)='umit'))
  union all
  select g.id,g.tarih,2,0,-coalesce(g.tutar,0) from public.giderler g cross join baseline b
  where g.tarih>=b.tarih and g.tarih<p_before_date and public.app_normalize_username(g.ekleyen)='umit'
 ), grouped as (
  select *,sum(reset) over(order by tarih,sira,id rows unbounded preceding) as grp from events
 ), balanced as (
  select sum(delta) over(partition by grp) as net,row_number() over(order by tarih desc,sira desc,id desc) as rn from grouped
 )
 select 'umit',case when p_before_date<=b.tarih
  then coalesce((b.arsiv->>to_char(p_before_date-interval '1 month','YYYY-MM'))::numeric,b.tutar)
  else (select net from balanced where rn=1) end from baseline b;
$$;
revoke all on function public.app_personel_net_after_expenses(date) from public,anon,authenticated;

create or replace function public.app_net_balance(p_before_date date)
returns table(personel_key text,net_balance numeric)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Oturum bulunamadi.'; end if;
 return query select * from public.app_personel_net_after_expenses(p_before_date);
end;
$$;
revoke all on function public.app_net_balance(date) from public,anon;
grant execute on function public.app_net_balance(date) to authenticated;

-- Cari devir SQL'i aynen korunur. Eski personel devirleri yeniden yazilmaz.
do $$
declare v_old text; v_new text; v_start integer; v_end integer;
begin
 select fonksiyonlar->>'app_close_period_core' into strict v_old from public.finansal_mantik_yedekleri where id='single-net-20261003';
 v_new:=replace(v_old,$old$  if p_aktif_donem<'2026-10' then
    return public.app_close_period_before_202610_core(p_aktif_donem,p_requester_id,p_requester_email);
  end if;$old$,'');
 if v_new=v_old then raise exception 'Beklenmeyen kapanis korumasi.'; end if;
 v_start:=position('  delete from public.satis_fisleri' in v_new);
 v_start:=position('  delete from public.satis_fisleri' in substring(v_new from v_start+1))+v_start;
 v_end:=position('  get diagnostics v_deleted_personel_count = row_count;' in v_new);
 if v_start<=0 or v_end<=v_start then raise exception 'Personel silme bolumu bulunamadi.'; end if;
 v_new:=overlay(v_new placing '  if v_next_date > (select tarih from public.net_baslangici where personel=''umit'') then'||chr(10)||substring(v_new from v_start for v_end-v_start)||'  end if;'||chr(10) from v_start for v_end-v_start);
 v_new:=replace(v_new,'  where abs(net_balance)>0.01;','  where abs(net_balance)>0.01 and v_next_date > (select tarih from public.net_baslangici where personel=''umit'');');
 v_new:=replace(v_new,'  v_personel_count integer := 0;','  v_personel_count integer := 0;'||chr(10)||'  v_previous_net_write text := current_setting(''app.internal_net_write'',true);');
 v_new:=replace(v_new,'  v_next_date :=','  perform set_config(''app.internal_net_write'',''1'',true);'||chr(10)||'  v_next_date :=');
 v_new:=replace(v_new,'  return jsonb_build_object(','  perform set_config(''app.internal_net_write'',coalesce(v_previous_net_write,''''),true);'||chr(10)||'  return jsonb_build_object(');
 execute v_new;
end;
$$;
drop function if exists public.app_close_period_before_202610_core(text,uuid,text);
revoke all on function public.app_close_period_core(text,uuid,text) from public,anon,authenticated;

-- Eski istemciler yeni sistem/kasa hareketi olusturamaz. Gecmis kayitlar korunur.
create or replace function public.app_guard_archived_net()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if current_user not in ('postgres','supabase_admin') or coalesce(current_setting('app.internal_net_write',true),'')<>'1' then
  if (tg_op in ('UPDATE','DELETE') and old.bayi='SİSTEM İŞLEMİ')
   or (tg_op in ('INSERT','UPDATE') and new.bayi='SİSTEM İŞLEMİ') then
   raise exception 'Sistem Net arsivi yalniz sunucu tarafindan yonetilir.';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
-- SECURITY INVOKER gerekir: yetkili kapanis fonksiyonu ve normal istemci ayrilir.
alter function public.app_guard_archived_net() security invoker;
revoke all on function public.app_guard_archived_net() from public,anon,authenticated;
drop trigger if exists trg_guard_archived_net on public.satis_fisleri;
create trigger trg_guard_archived_net before insert or update or delete on public.satis_fisleri
for each row execute function public.app_guard_archived_net();
