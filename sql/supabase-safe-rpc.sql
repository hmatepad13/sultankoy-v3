begin;

create unique index if not exists satis_fisleri_fis_no_unique_idx
on public.satis_fisleri (fis_no)
where fis_no is not null
  and btrim(fis_no) <> '';

create index if not exists satis_giris_fis_no_idx
on public.satis_giris (fis_no);

create or replace function public.app_requester_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.app_normalize_username(input_value text)
returns text
language sql
immutable
as $$
  select replace(lower(coalesce(input_value, '')), '@sistem.local', '');
$$;

create or replace function public.app_new_fis_no(prefix text default 'F')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := upper(regexp_replace(coalesce(nullif(btrim(prefix), ''), 'F'), '[^A-Za-z0-9]+', '', 'g'));
  v_candidate text;
begin
  loop
    v_candidate := v_prefix
      || '-'
      || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS')
      || '-'
      || lpad((floor(random() * 1000000))::int::text, 6, '0');

    exit when not exists (
      select 1
      from public.satis_fisleri
      where fis_no = v_candidate
    );
  end loop;

  return v_candidate;
end;
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.app_can_manage_record(target_created_by uuid, target_ekleyen text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_admin()
    or auth.uid() = target_created_by
    or public.app_normalize_username(target_ekleyen) = public.app_normalize_username(public.app_requester_email());
$$;

create or replace function public.app_save_satis_fisi(
  p_fis_id bigint default null,
  p_tarih date default null,
  p_bayi text default null,
  p_toplam_tutar numeric default 0,
  p_tahsilat numeric default 0,
  p_kalan_bakiye numeric default 0,
  p_odeme_turu text default null,
  p_aciklama text default null,
  p_detaylar jsonb default '[]'::jsonb,
  p_fis_gorseli text default null,
  p_fis_no text default null
)
returns table (fis_id bigint, fis_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid := auth.uid();
  v_requester_email text := public.app_requester_email();
  v_existing public.satis_fisleri%rowtype;
  v_fis_no text;
  v_new_id bigint;
  v_inserted_detail_count integer := 0;
begin
  if v_requester_id is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  if p_tarih is null then
    raise exception 'Tarih zorunludur.';
  end if;

  if coalesce(btrim(p_bayi), '') = '' then
    raise exception 'Bayi zorunludur.';
  end if;

  if jsonb_typeof(coalesce(p_detaylar, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_detaylar, '[]'::jsonb)) = 0 then
    raise exception 'En az bir fis detayi gereklidir.';
  end if;

  if p_fis_id is not null then
    select *
    into v_existing
    from public.satis_fisleri
    where id = p_fis_id
    for update;

    if not found then
      raise exception 'Fiş bulunamadi.';
    end if;

    if not public.app_can_manage_record(v_existing.created_by, v_existing.ekleyen) then
      raise exception 'Bu fişi düzenleme yetkiniz yok.';
    end if;

    v_fis_no := coalesce(nullif(v_existing.fis_no, ''), nullif(p_fis_no, ''));
    if v_fis_no is null then
      v_fis_no := public.app_new_fis_no('F');
    end if;

    delete from public.satis_giris as sg
    where sg.fis_no = v_fis_no;

    insert into public.satis_giris (
      fis_no,
      tarih,
      bayi,
      urun,
      birim,
      adet,
      fiyat,
      toplam_kg,
      bos_kova,
      tutar,
      aciklama,
      ekleyen,
      created_by
    )
    select
      v_fis_no,
      p_tarih,
      p_bayi,
      detay.urun,
      detay.birim,
      detay.adet,
      detay.fiyat,
      detay.toplam_kg,
      coalesce(detay.bos_kova, 0),
      detay.tutar,
      coalesce(detay.aciklama, 'Bağlı Fiş: ' || v_fis_no),
      coalesce(v_existing.ekleyen, v_requester_email),
      v_existing.created_by
    from jsonb_to_recordset(p_detaylar) as detay(
      urun text,
      birim numeric,
      adet numeric,
      fiyat numeric,
      toplam_kg numeric,
      bos_kova numeric,
      tutar numeric,
      aciklama text
    )
    where coalesce(btrim(detay.urun), '') <> '';

    get diagnostics v_inserted_detail_count = row_count;
    if v_inserted_detail_count = 0 then
      raise exception 'En az bir gecerli fis detayi gereklidir.';
    end if;

    update public.satis_fisleri
    set
      tarih = p_tarih,
      bayi = p_bayi,
      toplam_tutar = coalesce(p_toplam_tutar, 0),
      tahsilat = coalesce(p_tahsilat, 0),
      kalan_bakiye = coalesce(p_kalan_bakiye, 0),
      odeme_turu = p_odeme_turu,
      aciklama = p_aciklama,
      fis_gorseli = p_fis_gorseli
    where id = v_existing.id;

    return query
    select v_existing.id, v_fis_no;
  else
    if nullif(btrim(coalesce(p_fis_no, '')), '') is not null then
      if exists (
        select 1
        from public.satis_fisleri as sf
        where sf.fis_no = p_fis_no
      ) then
        raise exception 'Ayni fis no zaten var: %', p_fis_no;
      end if;

      v_fis_no := p_fis_no;
    else
      v_fis_no := public.app_new_fis_no('F');
    end if;

    insert into public.satis_fisleri (
      fis_no,
      tarih,
      bayi,
      toplam_tutar,
      tahsilat,
      kalan_bakiye,
      odeme_turu,
      aciklama,
      ekleyen,
      fis_gorseli,
      created_by
    )
    values (
      v_fis_no,
      p_tarih,
      p_bayi,
      coalesce(p_toplam_tutar, 0),
      coalesce(p_tahsilat, 0),
      coalesce(p_kalan_bakiye, 0),
      p_odeme_turu,
      p_aciklama,
      v_requester_email,
      p_fis_gorseli,
      v_requester_id
    )
    returning id into v_new_id;

    insert into public.satis_giris (
      fis_no,
      tarih,
      bayi,
      urun,
      birim,
      adet,
      fiyat,
      toplam_kg,
      bos_kova,
      tutar,
      aciklama,
      ekleyen,
      created_by
    )
    select
      v_fis_no,
      p_tarih,
      p_bayi,
      detay.urun,
      detay.birim,
      detay.adet,
      detay.fiyat,
      detay.toplam_kg,
      coalesce(detay.bos_kova, 0),
      detay.tutar,
      coalesce(detay.aciklama, 'Bağlı Fiş: ' || v_fis_no),
      v_requester_email,
      v_requester_id
    from jsonb_to_recordset(p_detaylar) as detay(
      urun text,
      birim numeric,
      adet numeric,
      fiyat numeric,
      toplam_kg numeric,
      bos_kova numeric,
      tutar numeric,
      aciklama text
    )
    where coalesce(btrim(detay.urun), '') <> '';

    get diagnostics v_inserted_detail_count = row_count;
    if v_inserted_detail_count = 0 then
      raise exception 'En az bir gecerli fis detayi gereklidir.';
    end if;

    return query
    select v_new_id, v_fis_no;
  end if;
end;
$$;

create or replace function public.app_delete_satis_fisi(p_fis_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.satis_fisleri%rowtype;
  v_detaylar jsonb;
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  select *
  into v_existing
  from public.satis_fisleri
  where id = p_fis_id
  for update;

  if not found then
    raise exception 'Fiş bulunamadi.';
  end if;

  if not public.app_can_manage_record(v_existing.created_by, v_existing.ekleyen) then
    raise exception 'Bu fişi silme yetkiniz yok.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(detay)), '[]'::jsonb)
  into v_detaylar
  from public.satis_giris detay
  where detay.fis_no = v_existing.fis_no;

  insert into public.cop_kutusu (tablo_adi, veri, silinme_tarihi)
  values (
    'satis_fisleri',
    to_jsonb(v_existing) || jsonb_build_object('satis_detaylari', v_detaylar),
    now()
  );

  delete from public.satis_giris
  where fis_no = v_existing.fis_no;

  delete from public.satis_fisleri
  where id = v_existing.id;

  return jsonb_build_object(
    'ok', true,
    'fis_id', v_existing.id,
    'fis_no', v_existing.fis_no,
    'fis_gorseli', v_existing.fis_gorseli
  );
end;
$$;

create or replace function public.app_close_period(p_aktif_donem text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid := auth.uid();
  v_requester_email text := public.app_requester_email();
  v_next_date date;
  v_next_donem text;
  v_existing_count integer;
  v_bayi_count integer := 0;
  v_personel_count integer := 0;
begin
  if v_requester_id is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  if not public.app_is_admin() then
    raise exception 'Dönem kapatma sadece admin tarafindan yapilabilir.';
  end if;

  if p_aktif_donem !~ '^\d{4}-\d{2}$' then
    raise exception 'Dönem formati YYYY-MM olmalidir.';
  end if;

  perform pg_advisory_xact_lock(hashtext('app_close_period_' || p_aktif_donem));

  v_next_date := (to_date(p_aktif_donem || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
  v_next_donem := to_char(v_next_date, 'YYYY-MM');

  select count(*)
  into v_existing_count
  from public.satis_fisleri
  where tarih = v_next_date
    and coalesce(odeme_turu, '') in ('DEVIR', 'DEVİR', 'PERSONEL DEVIR', 'PERSONEL DEVİR')
    and coalesce(aciklama, '') ilike p_aktif_donem || '%';

  if v_existing_count > 0 then
    return jsonb_build_object(
      'ok', true,
      'next_donem', v_next_donem,
      'skipped', true,
      'message', 'Bu dönem için devir fişleri zaten oluşturulmuş.'
    );
  end if;

  insert into public.satis_fisleri (
    fis_no,
    tarih,
    bayi,
    toplam_tutar,
    tahsilat,
    kalan_bakiye,
    odeme_turu,
    aciklama,
    ekleyen,
    created_by
  )
  with ordered as (
    select
      id,
      tarih,
      bayi,
      coalesce(kalan_bakiye, 0)::numeric as kalan_bakiye,
      case when coalesce(odeme_turu, '') in ('DEVIR', 'DEVİR') then 1 else 0 end as is_reset
    from public.satis_fisleri
    where to_char(tarih, 'YYYY-MM') <= p_aktif_donem
      and coalesce(bayi, '') <> 'SİSTEM İŞLEMİ'
  ),
  grouped as (
    select
      *,
      sum(is_reset) over (partition by bayi order by tarih, id rows between unbounded preceding and current row) as reset_group
    from ordered
  ),
  balanced as (
    select
      *,
      sum(kalan_bakiye) over (partition by bayi, reset_group order by tarih, id rows between unbounded preceding and current row) as running_balance,
      row_number() over (partition by bayi order by tarih desc, id desc) as rn
    from grouped
  )
  select
    public.app_new_fis_no('DEVIR'),
    v_next_date,
    bayi,
    case when running_balance > 0 then running_balance else 0 end,
    case when running_balance < 0 then abs(running_balance) else 0 end,
    running_balance,
    'DEVİR',
    p_aktif_donem || ' Döneminden Devir',
    v_requester_email,
    v_requester_id
  from balanced
  where rn = 1
    and abs(running_balance) > 0.01;

  get diagnostics v_bayi_count = row_count;

  insert into public.satis_fisleri (
    fis_no,
    tarih,
    bayi,
    toplam_tutar,
    tahsilat,
    kalan_bakiye,
    odeme_turu,
    aciklama,
    ekleyen,
    created_by
  )
  with period_satis as (
    select
      case
        when coalesce(odeme_turu, '') in ('PERSONEL DEVIR', 'PERSONEL DEVİR')
          and coalesce(bayi, '') = 'SİSTEM İŞLEMİ'
          then coalesce(
            nullif(public.app_normalize_username((regexp_match(coalesce(aciklama, ''), '\((.*?)\)'))[1]), ''),
            'bilinmiyor'
          )
        else coalesce(nullif(public.app_normalize_username(ekleyen), ''), 'bilinmiyor')
      end as personel_key,
      coalesce(bayi, '') as bayi,
      coalesce(odeme_turu, '') as odeme_turu,
      coalesce(toplam_tutar, 0)::numeric as toplam_tutar,
      coalesce(tahsilat, 0)::numeric as tahsilat,
      coalesce(kalan_bakiye, 0)::numeric as kalan_bakiye
    from public.satis_fisleri
    where to_char(tarih, 'YYYY-MM') = p_aktif_donem
  ),
  satis_agg as (
    select
      personel_key,
      sum(case when odeme_turu in ('KASAYA DEVIR', 'KASAYA DEVİR') then tahsilat else 0 end) as kasaya_devir,
      sum(case when odeme_turu in ('PERSONEL DEVIR', 'PERSONEL DEVİR') and bayi = 'SİSTEM İŞLEMİ' then toplam_tutar else 0 end) as devir_net,
      sum(case when odeme_turu in ('PERSONEL DEVIR', 'PERSONEL DEVİR') and bayi = 'SİSTEM İŞLEMİ' then kalan_bakiye else 0 end) as devir_acik,
      sum(case when odeme_turu not in ('KASAYA DEVIR', 'KASAYA DEVİR', 'PERSONEL DEVIR', 'PERSONEL DEVİR') and bayi <> 'SİSTEM İŞLEMİ' and toplam_tutar > 0 then toplam_tutar else 0 end) as satis,
      sum(case when odeme_turu not in ('KASAYA DEVIR', 'KASAYA DEVİR', 'PERSONEL DEVIR', 'PERSONEL DEVİR') then tahsilat else 0 end) as tahsilat,
      sum(case when odeme_turu not in ('KASAYA DEVIR', 'KASAYA DEVİR', 'PERSONEL DEVIR', 'PERSONEL DEVİR') then kalan_bakiye else 0 end) as acik_bakiye
    from period_satis
    group by personel_key
  ),
  gider_agg as (
    select
      coalesce(nullif(public.app_normalize_username(ekleyen), ''), 'bilinmiyor') as personel_key,
      sum(coalesce(tutar, 0)::numeric) as gider
    from public.giderler
    where to_char(tarih, 'YYYY-MM') = p_aktif_donem
    group by 1
  ),
  personel_keys as (
    select personel_key from satis_agg
    union
    select personel_key from gider_agg
  ),
  personel_ozet as (
    select
      k.personel_key as isim,
      coalesce(s.devir_net, 0) + (coalesce(s.tahsilat, 0) - coalesce(g.gider, 0) - coalesce(s.kasaya_devir, 0)) as net,
      coalesce(s.devir_acik, 0) + coalesce(s.acik_bakiye, 0) as acik_bakiye
    from personel_keys k
    left join satis_agg s on s.personel_key = k.personel_key
    left join gider_agg g on g.personel_key = k.personel_key
  )
  select
    public.app_new_fis_no('PDEVIR'),
    v_next_date,
    'SİSTEM İŞLEMİ',
    net,
    0,
    acik_bakiye,
    'PERSONEL DEVİR',
    p_aktif_donem || ' Personel Devir (' || isim || ')',
    v_requester_email,
    v_requester_id
  from personel_ozet
  where abs(net) > 0.01
     or abs(acik_bakiye) > 0.01;

  get diagnostics v_personel_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'next_donem', v_next_donem,
    'skipped', false,
    'bayi_count', v_bayi_count,
    'personel_count', v_personel_count
  );
end;
$$;

grant execute on function public.app_requester_email() to authenticated;
grant execute on function public.app_normalize_username(text) to authenticated;
grant execute on function public.app_new_fis_no(text) to authenticated;
grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.app_can_manage_record(uuid, text) to authenticated;
grant execute on function public.app_save_satis_fisi(bigint, date, text, numeric, numeric, numeric, text, text, jsonb, text, text) to authenticated;
grant execute on function public.app_delete_satis_fisi(bigint) to authenticated;
grant execute on function public.app_close_period(text) to authenticated;

commit;
