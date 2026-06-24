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

  if not public.app_can_close_period() then
    raise exception 'Dönem kapatma yetkiniz yok.';
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
    bayi_id,
    toplam_tutar,
    tahsilat,
    kalan_bakiye,
    odeme_turu,
    aciklama,
    ekleyen,
    created_by
  )
  select
    public.app_new_fis_no('DEVIR'),
    v_next_date,
    account_label,
    output_bayi_id,
    case when balance > 0 then balance else 0 end,
    case when balance < 0 then abs(balance) else 0 end,
    balance,
    'DEVİR',
    p_aktif_donem || ' Döneminden Devir',
    v_requester_email,
    v_requester_id
  from public.app_satis_account_balances(v_next_date, null, null)
  where abs(balance) > 0.01;

  get diagnostics v_bayi_count = row_count;

  insert into public.satis_fisleri (
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
  )
  with aktif_personel as (
    select distinct public.app_normalize_username(username) as personel_key
    from public.profiles
    where coalesce(role, 'calisan') = 'calisan'
      and nullif(public.app_normalize_username(username), '') is not null
      and public.app_normalize_username(username) not in ('admin', 'yusuf')
  ),
  personel_events_raw as (
    select
      sf.*,
      case
        when coalesce(sf.odeme_turu, '') in ('PERSONEL DEVIR', 'PERSONEL DEVİR') then
          coalesce(
            nullif(public.app_normalize_username((regexp_match(coalesce(sf.aciklama, ''), '\((.*?)\)'))[1]), ''),
            'bilinmiyor'
          )
        else coalesce(nullif(public.app_normalize_username(sf.ekleyen), ''), 'bilinmiyor')
      end as personel_key,
      case when coalesce(sf.odeme_turu, '') in ('PERSONEL DEVIR', 'PERSONEL DEVİR') then 1 else 0 end as is_reset
    from public.satis_fisleri sf
    where to_char(sf.tarih, 'YYYY-MM') <= p_aktif_donem
  ),
  personel_events as (
    select raw.*
    from personel_events_raw raw
    join aktif_personel ap on ap.personel_key = raw.personel_key
  ),
  reset_grouped as (
    select
      *,
      sum(is_reset) over (partition by personel_key order by tarih, id rows between unbounded preceding and current row) as reset_group
    from personel_events
  ),
  personel_balanced as (
    select
      personel_key,
      tarih,
      id,
      (
        coalesce(
          max(case when coalesce(odeme_turu, '') in ('PERSONEL DEVIR', 'PERSONEL DEVİR') then toplam_tutar end)
            over (partition by personel_key, reset_group),
          0
        )
        + sum(
          case
            when coalesce(odeme_turu, '') in ('PERSONEL DEVIR', 'PERSONEL DEVİR') then 0
            when coalesce(odeme_turu, '') in ('KASAYA DEVIR', 'KASAYA DEVİR') then -coalesce(tahsilat, 0)::numeric
            when coalesce(odeme_turu, '') in ('DEVIR', 'DEVİR') then 0
            else coalesce(tahsilat, 0)::numeric
          end
        ) over (partition by personel_key, reset_group order by tarih, id rows between unbounded preceding and current row)
      ) as net_balance,
      (
        coalesce(
          max(case when coalesce(odeme_turu, '') in ('PERSONEL DEVIR', 'PERSONEL DEVİR') then kalan_bakiye end)
            over (partition by personel_key, reset_group),
          0
        )
        + sum(
          case
            when coalesce(odeme_turu, '') in ('PERSONEL DEVIR', 'PERSONEL DEVİR') then 0
            when coalesce(odeme_turu, '') in ('DEVIR', 'DEVİR') then 0
            else coalesce(kalan_bakiye, 0)::numeric
          end
        ) over (partition by personel_key, reset_group order by tarih, id rows between unbounded preceding and current row)
      ) as open_balance,
      row_number() over (partition by personel_key order by tarih desc, id desc) as rn
    from reset_grouped
  )
  select
    public.app_new_fis_no('PDEVIR'),
    v_next_date,
    'SİSTEM İŞLEMİ',
    null,
    net_balance,
    0,
    open_balance,
    'PERSONEL DEVİR',
    p_aktif_donem || ' Personel Devir (' || personel_key || ')',
    v_requester_email,
    v_requester_id
  from personel_balanced
  where rn = 1
    and (abs(net_balance) > 0.01 or abs(open_balance) > 0.01);

  get diagnostics v_personel_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'next_donem', v_next_donem,
    'skipped', false,
    'bayi_devir_count', v_bayi_count,
    'personel_devir_count', v_personel_count
  );
end;
$$;

grant execute on function public.app_close_period(text) to authenticated;
