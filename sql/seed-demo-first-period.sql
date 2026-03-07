begin;

lock table public.satis_fisleri in share row exclusive mode;
lock table public.satis_giris in share row exclusive mode;
lock table public.sut_giris in share row exclusive mode;
lock table public.giderler in share row exclusive mode;
lock table public.uretim in share row exclusive mode;

delete from public.satis_giris
where fis_no like 'DEMO-%'
   or aciklama like '[DEMO SEED]%';

delete from public.satis_fisleri
where fis_no like 'DEMO-%'
   or aciklama like '[DEMO SEED]%';

delete from public.sut_giris
where aciklama like '[DEMO SEED]%';

delete from public.giderler
where aciklama like '[DEMO SEED]%';

delete from public.uretim
where aciklama like '[DEMO SEED]%';

do $$
declare
  v_period text := '2026-03';
  v_base_date date := date '2026-03-03';
  v_next_fis_id bigint := coalesce((select max(id) from public.satis_fisleri), 0) + 1;
  v_next_gider_id bigint := coalesce((select max(id) from public.giderler), 0) + 1;
  v_user record;
  v_idx integer := 0;
  v_user_key text;
  v_bayi_ids uuid[];
  v_bayi_names text[];
  v_ciftlik_ids uuid[];
  v_ciftlik_names text[];
  v_bayi_count integer;
  v_ciftlik_count integer;
  v_bayi_id uuid;
  v_bayi_name text;
  v_ciftlik_id uuid;
  v_ciftlik_name text;
  v_urun3_id uuid;
  v_urun3_name text;
  v_urun5_id uuid;
  v_urun5_name text;
  v_qty3 numeric;
  v_qty5 numeric;
  v_price3 numeric;
  v_price5 numeric;
  v_tutar3 numeric;
  v_tutar5 numeric;
  v_toplam numeric;
  v_ilk_tahsilat numeric;
  v_ikinci_tahsilat numeric;
  v_kalan numeric;
  v_fis_no text;
  v_tahsilat_no text;
  v_yogurt_giren numeric;
  v_yogurt_cikan numeric;
  v_yogurt_maliyet numeric;
  v_yogurt_satis numeric;
  v_yogurt_kar numeric;
  v_kaymak_giren numeric;
  v_kaymak_cikan numeric;
  v_kaymak_maliyet numeric;
  v_kaymak_satis numeric;
  v_kaymak_kar numeric;
begin
  select array_agg(id order by isim), array_agg(isim order by isim)
    into v_bayi_ids, v_bayi_names
  from public.bayiler
  where aktif is distinct from false;

  select array_agg(id order by isim), array_agg(isim order by isim)
    into v_ciftlik_ids, v_ciftlik_names
  from public.ciftlikler
  where aktif is distinct from false;

  v_bayi_count := coalesce(array_length(v_bayi_ids, 1), 0);
  v_ciftlik_count := coalesce(array_length(v_ciftlik_ids, 1), 0);

  if v_bayi_count = 0 then
    raise exception 'Aktif bayi kaydi yok.';
  end if;

  if v_ciftlik_count = 0 then
    raise exception 'Aktif ciftlik kaydi yok.';
  end if;

  select id, isim
    into v_urun3_id, v_urun3_name
  from public.urunler
  where aktif is distinct from false
  order by case when lower(isim) like '%3 kg%' then 0 else 1 end, isim
  limit 1;

  select id, isim
    into v_urun5_id, v_urun5_name
  from public.urunler
  where aktif is distinct from false
    and id is distinct from v_urun3_id
  order by case when lower(isim) like '%5 kg%' then 0 else 1 end, isim
  limit 1;

  if v_urun3_id is null then
    raise exception 'Aktif urun kaydi yok.';
  end if;

  if v_urun5_id is null then
    v_urun5_id := v_urun3_id;
    v_urun5_name := v_urun3_name;
  end if;

  if not exists (select 1 from public.profiles) then
    raise exception 'Profiles tablosunda kullanici yok.';
  end if;

  for v_user in
    select
      id,
      coalesce(nullif(username, ''), 'kullanici-' || row_number() over (order by id)) as username
    from public.profiles
    order by coalesce(nullif(username, ''), id::text)
  loop
    v_idx := v_idx + 1;
    v_user_key := lower(v_user.username);

    v_bayi_id := v_bayi_ids[((v_idx - 1) % v_bayi_count) + 1];
    v_bayi_name := v_bayi_names[((v_idx - 1) % v_bayi_count) + 1];
    v_ciftlik_id := v_ciftlik_ids[((v_idx - 1) % v_ciftlik_count) + 1];
    v_ciftlik_name := v_ciftlik_names[((v_idx - 1) % v_ciftlik_count) + 1];

    insert into public.sut_giris (
      tarih,
      ciftlik,
      ciftlik_id,
      kg,
      fiyat,
      toplam_tl,
      aciklama,
      created_by,
      ekleyen
    ) values (
      v_base_date + (v_idx - 1),
      v_ciftlik_name,
      v_ciftlik_id,
      80 + (v_idx * 12),
      29 + v_idx,
      (80 + (v_idx * 12)) * (29 + v_idx),
      format('[DEMO SEED] Sut girisi - %s', v_user_key),
      v_user.id,
      v_user_key
    );

    insert into public.giderler (
      id,
      tarih,
      tur,
      aciklama,
      tutar,
      ekleyen,
      created_by
    ) values (
      v_next_gider_id,
      v_base_date + (v_idx - 1),
      'Genel Gider',
      format('[DEMO SEED] Genel gider - %s', v_user_key),
      250 + (v_idx * 110),
      v_user_key,
      v_user.id
    );
    v_next_gider_id := v_next_gider_id + 1;

    insert into public.giderler (
      id,
      tarih,
      tur,
      aciklama,
      tutar,
      ekleyen,
      created_by
    ) values (
      v_next_gider_id,
      v_base_date + v_idx,
      format('Sut Odemesi %s', v_ciftlik_name),
      format('[DEMO SEED] Sut odemesi - %s', v_user_key),
      300 + (v_idx * 90),
      v_user_key,
      v_user.id
    );
    v_next_gider_id := v_next_gider_id + 1;

    v_yogurt_giren := 100 + (v_idx * 14);
    v_yogurt_cikan := 94 + (v_idx * 13);
    v_yogurt_maliyet := 3400 + (v_idx * 420);
    v_yogurt_satis := 3950 + (v_idx * 510);
    v_yogurt_kar := v_yogurt_satis - v_yogurt_maliyet;

    insert into public.uretim (
      tarih,
      cig_sut,
      sut_tozu,
      tereyag,
      su,
      sut_fiyat,
      sut_tozu_fiyat,
      tereyag_fiyat,
      katki_kg,
      katki_fiyat,
      kova_3_adet,
      kova_3_fiyat,
      kova_5_adet,
      kova_5_fiyat,
      cikti_3kg,
      satis_3_fiyat,
      cikti_5kg,
      satis_5_fiyat,
      toplam_kg,
      toplam_maliyet,
      kar,
      aciklama,
      ekleyen,
      created_by,
      uretim_tipi
    ) values (
      v_base_date + (v_idx - 1),
      90 + (v_idx * 10),
      2 + v_idx,
      3 + v_idx,
      6 + v_idx,
      30,
      90,
      220,
      1 + (v_idx * 0.25),
      180,
      10 + v_idx,
      8,
      5 + v_idx,
      10,
      18 + v_idx,
      150 + (v_idx * 5),
      8 + v_idx,
      240 + (v_idx * 5),
      v_yogurt_giren,
      v_yogurt_maliyet,
      v_yogurt_kar,
      format(
        '[DEMO SEED] Yogurt uretimi - %s%s[URETIM_META]%s',
        v_user_key,
        E'\n',
        jsonb_build_object(
          'uretim_tipi', 'yogurt',
          'su_fiyat', 3,
          'cikan_toplam_kg', v_yogurt_cikan
        )::text
      ),
      v_user_key,
      v_user.id,
      'yogurt'
    );

    v_kaymak_giren := 24 + (v_idx * 3);
    v_kaymak_cikan := 19 + (v_idx * 2);
    v_kaymak_maliyet := 1850 + (v_idx * 240);
    v_kaymak_satis := 2240 + (v_idx * 310);
    v_kaymak_kar := v_kaymak_satis - v_kaymak_maliyet;

    insert into public.uretim (
      tarih,
      cig_sut,
      tereyag,
      katki_kg,
      sut_fiyat,
      tereyag_fiyat,
      katki_fiyat,
      cikti_3kg,
      satis_3_fiyat,
      toplam_kg,
      toplam_maliyet,
      kar,
      aciklama,
      ekleyen,
      created_by,
      uretim_tipi
    ) values (
      v_base_date + (v_idx - 1) + 1,
      14 + v_idx,
      2 + v_idx,
      1,
      32,
      220,
      180,
      3 + v_idx,
      310 + (v_idx * 10),
      v_kaymak_giren,
      v_kaymak_maliyet,
      v_kaymak_kar,
      format(
        '[DEMO SEED] Sut kaymagi uretimi - %s%s[URETIM_META]%s',
        v_user_key,
        E'\n',
        jsonb_build_object(
          'uretim_tipi', 'sut_kaymagi',
          'krema', 7 + v_idx,
          'krema_fiyat', 45,
          'diger_kg', 1 + (v_idx * 0.3),
          'diger_fiyat', 20,
          'cikti_2kg', 2 + v_idx,
          'satis_2_fiyat', 220 + (v_idx * 10),
          'cikan_toplam_kg', v_kaymak_cikan
        )::text
      ),
      v_user_key,
      v_user.id,
      'sut_kaymagi'
    );

    v_qty3 := 4 + v_idx;
    v_qty5 := 1 + (v_idx % 3);
    v_price3 := 145 + (v_idx * 4);
    v_price5 := 235 + (v_idx * 6);
    v_tutar3 := v_qty3 * v_price3;
    v_tutar5 := v_qty5 * v_price5;
    v_toplam := v_tutar3 + v_tutar5;
    v_ilk_tahsilat := round(v_toplam * case when v_idx % 2 = 0 then 0.35 else 0.15 end);
    v_kalan := v_toplam - v_ilk_tahsilat;
    v_fis_no := format('DEMO-%s-%s', replace(v_period, '-', ''), lpad(v_idx::text, 3, '0'));

    insert into public.satis_fisleri (
      id,
      fis_no,
      tarih,
      bayi,
      bayi_id,
      toplam_tutar,
      tahsilat,
      kalan_bakiye,
      odeme_turu,
      aciklama,
      ekleyen,
      created_by
    ) values (
      v_next_fis_id,
      v_fis_no,
      v_base_date + (v_idx - 1) + 2,
      v_bayi_name,
      v_bayi_id,
      v_toplam,
      v_ilk_tahsilat,
      v_kalan,
      case when v_kalan > 0 then 'ACIK HESAP' else 'PESIN' end,
      format('[DEMO SEED] Demo satis - %s', v_user_key),
      v_user_key,
      v_user.id
    );
    v_next_fis_id := v_next_fis_id + 1;

    insert into public.satis_giris (
      fis_no,
      tarih,
      bayi,
      bayi_id,
      urun,
      urun_id,
      birim,
      adet,
      fiyat,
      toplam_kg,
      bos_kova,
      tutar,
      aciklama,
      ekleyen,
      created_by
    ) values
    (
      v_fis_no,
      v_base_date + (v_idx - 1) + 2,
      v_bayi_name,
      v_bayi_id,
      v_urun3_name,
      v_urun3_id,
      3,
      v_qty3,
      v_price3,
      v_qty3 * 3,
      0,
      v_tutar3,
      format('[DEMO SEED] Bagli Fis: %s', v_fis_no),
      v_user_key,
      v_user.id
    ),
    (
      v_fis_no,
      v_base_date + (v_idx - 1) + 2,
      v_bayi_name,
      v_bayi_id,
      v_urun5_name,
      v_urun5_id,
      5,
      v_qty5,
      v_price5,
      v_qty5 * 5,
      0,
      v_tutar5,
      format('[DEMO SEED] Bagli Fis: %s', v_fis_no),
      v_user_key,
      v_user.id
    );

    if v_kalan > 0 then
      v_ikinci_tahsilat := least(v_kalan, round(v_toplam * 0.25));
      v_tahsilat_no := format('DEMO-T-%s-%s', replace(v_period, '-', ''), lpad(v_idx::text, 3, '0'));

      insert into public.satis_fisleri (
        id,
        fis_no,
        tarih,
        bayi,
        bayi_id,
        toplam_tutar,
        tahsilat,
        kalan_bakiye,
        odeme_turu,
        aciklama,
        ekleyen,
        created_by
      ) values (
        v_next_fis_id,
        v_tahsilat_no,
        v_base_date + (v_idx - 1) + 4,
        v_bayi_name,
        v_bayi_id,
        0,
        v_ikinci_tahsilat,
        -v_ikinci_tahsilat,
        'PESIN',
        format('[DEMO SEED] [Sadece Tahsilat] - Demo tahsilat - %s', v_user_key),
        v_user_key,
        v_user.id
      );
      v_next_fis_id := v_next_fis_id + 1;
    end if;
  end loop;
end $$;

commit;
