create or replace function public.app_satis_account_balances(
  p_before_date date default null,
  p_override_bayi_id uuid default null,
  p_override_hesap_grubu text default null
)
returns table (
  account_key text,
  account_label text,
  output_bayi_id uuid,
  balance numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bayi_state as (
    select
      b.id,
      b.isim,
      case
        when p_override_bayi_id is not null and b.id = p_override_bayi_id
          then nullif(btrim(p_override_hesap_grubu), '')
        else nullif(btrim(b.hesap_grubu), '')
      end as hesap_grubu
    from public.bayiler b
  ),
  matched as (
    select
      sf.id,
      sf.tarih,
      sf.bayi,
      sf.bayi_id,
      coalesce(b_id.id, b_name.id) as matched_bayi_id,
      coalesce(b_id.isim, b_name.isim, sf.bayi) as matched_bayi_name,
      coalesce(b_id.hesap_grubu, b_name.hesap_grubu) as hesap_grubu,
      coalesce(sf.kalan_bakiye, 0)::numeric as kalan_bakiye,
      coalesce(sf.odeme_turu, '') in ('DEVIR', 'DEVİR') as is_devir
    from public.satis_fisleri sf
    left join bayi_state b_id on b_id.id = sf.bayi_id
    left join bayi_state b_name
      on sf.bayi_id is null
     and public.app_normalize_username(btrim(sf.bayi)) = public.app_normalize_username(btrim(b_name.isim))
    where (p_before_date is null or sf.tarih < p_before_date)
      and coalesce(sf.bayi, '') <> 'SİSTEM İŞLEMİ'
  ),
  events as (
    select
      id,
      tarih,
      coalesce(hesap_grubu, matched_bayi_name, bayi) as account_label,
      ('hesap:' || public.app_normalize_username(btrim(coalesce(hesap_grubu, matched_bayi_name, bayi)))) as account_key,
      case when hesap_grubu is null then matched_bayi_id else null end as output_bayi_id,
      case
        when matched_bayi_id is not null then 'id:' || matched_bayi_id::text
        else 'isim:' || public.app_normalize_username(btrim(coalesce(bayi, '')))
      end as source_key,
      kalan_bakiye,
      is_devir and matched_bayi_id is null as is_group_reset,
      is_devir and matched_bayi_id is not null as is_source_reset
    from matched
    where coalesce(hesap_grubu, matched_bayi_name, bayi) is not null
      and btrim(coalesce(hesap_grubu, matched_bayi_name, bayi)) <> ''
  ),
  segmented as (
    select
      *,
      sum(case when is_group_reset then 1 else 0 end)
        over (partition by account_key order by tarih, id rows between unbounded preceding and current row) as full_reset_group
    from events
  ),
  source_segmented as (
    select
      *,
      sum(case when is_source_reset then 1 else 0 end)
        over (partition by account_key, full_reset_group, source_key order by tarih, id rows between unbounded preceding and current row) as source_reset_group
    from segmented
  ),
  balanced as (
    select
      *,
      coalesce(
        max(kalan_bakiye) filter (where is_group_reset)
          over (partition by account_key, full_reset_group),
        0
      ) as base_balance,
      sum(case when is_group_reset then 0 else kalan_bakiye end)
        over (
          partition by account_key, full_reset_group, source_key, source_reset_group
          order by tarih, id
          rows between unbounded preceding and current row
        ) as source_balance,
      row_number()
        over (partition by account_key order by tarih desc, id desc) as account_rn,
      row_number()
        over (partition by account_key, full_reset_group, source_key order by tarih desc, id desc) as source_rn
    from source_segmented
  ),
  latest_segments as (
    select distinct account_key, full_reset_group
    from balanced
    where account_rn = 1
  ),
  latest_sources as (
    select b.*
    from balanced b
    join latest_segments ls
      on ls.account_key = b.account_key
     and ls.full_reset_group = b.full_reset_group
    where b.source_rn = 1
  )
  select
    latest_sources.account_key,
    max(latest_sources.account_label) as account_label,
    max(latest_sources.output_bayi_id::text)::uuid as output_bayi_id,
    max(latest_sources.base_balance) + coalesce(sum(latest_sources.source_balance), 0) as balance
  from latest_sources
  group by latest_sources.account_key;
$$;

create or replace function public.app_preview_bayi_group(
  p_bayi_id uuid,
  p_hesap_grubu text,
  p_aktif_donem text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bayi record;
  v_old_group text;
  v_new_group text := nullif(btrim(p_hesap_grubu), '');
  v_old_label text;
  v_new_label text;
  v_old_key text;
  v_new_key text;
  v_old_group_norm text;
  v_new_group_norm text;
  v_until_date date := null;
  v_before_total numeric := 0;
  v_after_total numeric := 0;
  v_members jsonb := '[]'::jsonb;
  v_devir_dates jsonb := '[]'::jsonb;
  v_needs_devir_fix boolean := false;
  v_split_blocked boolean := false;
  v_can_apply boolean := true;
  v_block_reason text := null;
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  select *
  into v_bayi
  from public.bayiler
  where id = p_bayi_id;

  if not found then
    raise exception 'Müşteri bulunamadı.';
  end if;

  if p_aktif_donem is not null and p_aktif_donem <> '' then
    if p_aktif_donem !~ '^\d{4}-\d{2}$' then
      raise exception 'Dönem formati YYYY-MM olmalidir.';
    end if;
    v_until_date := (to_date(p_aktif_donem || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
  end if;

  v_old_group := nullif(btrim(v_bayi.hesap_grubu), '');
  v_old_group_norm := public.app_normalize_username(coalesce(v_old_group, ''));
  v_new_group_norm := public.app_normalize_username(coalesce(v_new_group, ''));
  v_old_label := coalesce(v_old_group, v_bayi.isim);
  v_new_label := coalesce(v_new_group, v_bayi.isim);
  v_old_key := 'hesap:' || public.app_normalize_username(btrim(v_old_label));
  v_new_key := 'hesap:' || public.app_normalize_username(btrim(v_new_label));

  if v_old_group is not null and v_old_group_norm <> v_new_group_norm then
    select exists(
      select 1
      from public.satis_fisleri sf
      where sf.bayi_id is null
        and coalesce(sf.odeme_turu, '') in ('DEVIR', 'DEVİR')
        and public.app_normalize_username(btrim(sf.bayi)) = v_old_group_norm
    )
    into v_split_blocked;

    if v_split_blocked then
      v_can_apply := false;
      v_block_reason := 'Bu müşteri mevcut gruptan ayrılıyor. Eski grupta grup devri olduğu için borcu şubelere otomatik paylaştırmak güvenli değil.';
    end if;
  end if;

  with keys as (
    select distinct unnest(array[v_old_key, v_new_key]) as account_key
  )
  select coalesce(sum(b.balance), 0)
  into v_before_total
  from public.app_satis_account_balances(v_until_date, null, null) b
  join keys k on k.account_key = b.account_key;

  with keys as (
    select distinct unnest(array[v_old_key, v_new_key]) as account_key
  )
  select coalesce(sum(b.balance), 0)
  into v_after_total
  from public.app_satis_account_balances(v_until_date, p_bayi_id, v_new_group) b
  join keys k on k.account_key = b.account_key;

  if v_new_group is null then
    select jsonb_build_array(jsonb_build_object('id', v_bayi.id, 'isim', v_bayi.isim, 'aktif', v_bayi.aktif))
    into v_members;
  else
    select coalesce(
      jsonb_agg(jsonb_build_object('id', b.id, 'isim', b.isim, 'aktif', b.aktif) order by b.isim),
      '[]'::jsonb
    )
    into v_members
    from public.bayiler b
    where b.id = p_bayi_id
       or public.app_normalize_username(btrim(coalesce(b.hesap_grubu, ''))) = v_new_group_norm;

    with member_ids as (
      select array_agg(b.id) as ids
      from public.bayiler b
      where b.id = p_bayi_id
         or public.app_normalize_username(btrim(coalesce(b.hesap_grubu, ''))) = v_new_group_norm
    ),
    devirler as (
      select
        sf.tarih,
        count(*) filter (where coalesce(sf.bayi_id, b_name.id) = any(member_ids.ids)) as branch_count,
        count(*) filter (
          where coalesce(sf.bayi_id, b_name.id) is null
            and public.app_normalize_username(btrim(sf.bayi)) = v_new_group_norm
        ) as group_count
      from public.satis_fisleri sf
      cross join member_ids
      left join public.bayiler b_name
        on sf.bayi_id is null
       and public.app_normalize_username(btrim(sf.bayi)) = public.app_normalize_username(btrim(b_name.isim))
      where coalesce(sf.odeme_turu, '') in ('DEVIR', 'DEVİR')
        and (
          coalesce(sf.bayi_id, b_name.id) = any(member_ids.ids)
          or (
            coalesce(sf.bayi_id, b_name.id) is null
            and public.app_normalize_username(btrim(sf.bayi)) = v_new_group_norm
          )
        )
      group by sf.tarih
    )
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'tarih', tarih,
            'subeDevirSayisi', branch_count,
            'grupDevirSayisi', group_count
          )
          order by tarih
        ),
        '[]'::jsonb
      ),
      exists(select 1 from devirler where branch_count > 0)
    into v_devir_dates, v_needs_devir_fix
    from devirler;
  end if;

  return jsonb_build_object(
    'ok', true,
    'canApply', v_can_apply,
    'blockReason', v_block_reason,
    'bayi', jsonb_build_object('id', v_bayi.id, 'isim', v_bayi.isim),
    'oldGroup', v_old_group,
    'newGroup', v_new_group,
    'oldLabel', v_old_label,
    'newLabel', v_new_label,
    'beforeTotal', v_before_total,
    'afterTotal', v_after_total,
    'difference', v_after_total - v_before_total,
    'members', v_members,
    'devirDates', v_devir_dates,
    'needsDevirFix', v_needs_devir_fix
  );
end;
$$;

create or replace function public.app_apply_bayi_group(
  p_bayi_id uuid,
  p_hesap_grubu text,
  p_aktif_donem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview jsonb;
  v_bayi record;
  v_old_group text;
  v_new_group text := nullif(btrim(p_hesap_grubu), '');
  v_old_label text;
  v_new_label text;
  v_old_key text;
  v_new_key text;
  v_new_group_norm text;
  v_new_key_for_group text;
  v_until_date date := null;
  v_before_total numeric := 0;
  v_after_total numeric := 0;
  v_member_ids uuid[] := array[]::uuid[];
  v_devir_date date;
  v_devir_balance numeric := 0;
  v_existing_devir_id bigint;
  v_fixed_count integer := 0;
  v_requester_email text := public.app_requester_email();
  v_requester_id uuid := auth.uid();
begin
  if v_requester_id is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  perform pg_advisory_xact_lock(hashtext('app_apply_bayi_group_' || p_bayi_id::text));

  select *
  into v_bayi
  from public.bayiler
  where id = p_bayi_id
  for update;

  if not found then
    raise exception 'Müşteri bulunamadı.';
  end if;

  if p_aktif_donem is not null and p_aktif_donem <> '' then
    if p_aktif_donem !~ '^\d{4}-\d{2}$' then
      raise exception 'Dönem formati YYYY-MM olmalidir.';
    end if;
    v_until_date := (to_date(p_aktif_donem || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
  end if;

  v_preview := public.app_preview_bayi_group(p_bayi_id, p_hesap_grubu, p_aktif_donem);
  if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
    raise exception '%', coalesce(v_preview ->> 'blockReason', 'Bu grup değişikliği güvenli şekilde uygulanamıyor.');
  end if;

  v_old_group := nullif(btrim(v_bayi.hesap_grubu), '');
  v_old_label := coalesce(v_old_group, v_bayi.isim);
  v_new_label := coalesce(v_new_group, v_bayi.isim);
  v_old_key := 'hesap:' || public.app_normalize_username(btrim(v_old_label));
  v_new_key := 'hesap:' || public.app_normalize_username(btrim(v_new_label));
  v_before_total := coalesce((v_preview ->> 'beforeTotal')::numeric, 0);

  update public.bayiler
  set hesap_grubu = v_new_group
  where id = p_bayi_id;

  if v_new_group is not null then
    v_new_group_norm := public.app_normalize_username(btrim(v_new_group));
    v_new_key_for_group := 'hesap:' || v_new_group_norm;

    select coalesce(array_agg(id), array[]::uuid[])
    into v_member_ids
    from public.bayiler
    where public.app_normalize_username(btrim(coalesce(hesap_grubu, ''))) = v_new_group_norm;

    for v_devir_date in
      with devirler as (
        select distinct sf.tarih
        from public.satis_fisleri sf
        left join public.bayiler b_name
          on sf.bayi_id is null
         and public.app_normalize_username(btrim(sf.bayi)) = public.app_normalize_username(btrim(b_name.isim))
        where coalesce(sf.odeme_turu, '') in ('DEVIR', 'DEVİR')
          and (
            coalesce(sf.bayi_id, b_name.id) = any(v_member_ids)
            or (
              coalesce(sf.bayi_id, b_name.id) is null
              and public.app_normalize_username(btrim(sf.bayi)) = v_new_group_norm
            )
          )
      )
      select tarih
      from devirler
      order by tarih
    loop
      select coalesce(balance, 0)
      into v_devir_balance
      from public.app_satis_account_balances(v_devir_date, null, null)
      where account_key = v_new_key_for_group;

      v_devir_balance := coalesce(v_devir_balance, 0);

      select sf.id
      into v_existing_devir_id
      from public.satis_fisleri sf
      where sf.tarih = v_devir_date
        and sf.bayi_id is null
        and coalesce(sf.odeme_turu, '') in ('DEVIR', 'DEVİR')
        and public.app_normalize_username(btrim(sf.bayi)) = v_new_group_norm
      order by sf.id desc
      limit 1;

      if v_existing_devir_id is not null then
        update public.satis_fisleri
        set
          bayi = v_new_group,
          bayi_id = null,
          toplam_tutar = case when v_devir_balance > 0 then v_devir_balance else 0 end,
          tahsilat = case when v_devir_balance < 0 then abs(v_devir_balance) else 0 end,
          kalan_bakiye = v_devir_balance,
          odeme_turu = 'DEVİR',
          aciklama = to_char((v_devir_date - interval '1 month')::date, 'YYYY-MM') || ' Döneminden Devir'
        where id = v_existing_devir_id;
        v_fixed_count := v_fixed_count + 1;
      elsif abs(v_devir_balance) > 0.01 then
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
        values (
          public.app_new_fis_no('DEVIR'),
          v_devir_date,
          v_new_group,
          null,
          case when v_devir_balance > 0 then v_devir_balance else 0 end,
          case when v_devir_balance < 0 then abs(v_devir_balance) else 0 end,
          v_devir_balance,
          'DEVİR',
          to_char((v_devir_date - interval '1 month')::date, 'YYYY-MM') || ' Döneminden Devir',
          v_requester_email,
          v_requester_id
        );
        v_fixed_count := v_fixed_count + 1;
      end if;
    end loop;
  end if;

  with keys as (
    select distinct unnest(array[v_old_key, v_new_key]) as account_key
  )
  select coalesce(sum(b.balance), 0)
  into v_after_total
  from public.app_satis_account_balances(v_until_date, null, null) b
  join keys k on k.account_key = b.account_key;

  if abs(v_after_total - v_before_total) > 0.01 then
    raise exception 'Grup işlemi durduruldu: toplam borç korunamadı. Önce: %, Sonra: %, Fark: %',
      v_before_total,
      v_after_total,
      v_after_total - v_before_total;
  end if;

  return jsonb_build_object(
    'ok', true,
    'preview', v_preview,
    'beforeTotal', v_before_total,
    'afterTotal', v_after_total,
    'difference', v_after_total - v_before_total,
    'fixedDevirCount', v_fixed_count
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
  with personel_events as (
    select
      *,
      case
        when coalesce(odeme_turu, '') in ('PERSONEL DEVIR', 'PERSONEL DEVİR') then
          coalesce(
            nullif(public.app_normalize_username((regexp_match(coalesce(aciklama, ''), '\((.*?)\)'))[1]), ''),
            'bilinmiyor'
          )
        else coalesce(nullif(public.app_normalize_username(ekleyen), ''), 'bilinmiyor')
      end as personel_key,
      case when coalesce(odeme_turu, '') in ('PERSONEL DEVIR', 'PERSONEL DEVİR') then 1 else 0 end as is_reset
    from public.satis_fisleri
    where to_char(tarih, 'YYYY-MM') <= p_aktif_donem
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

grant execute on function public.app_satis_account_balances(date, uuid, text) to authenticated;
grant execute on function public.app_preview_bayi_group(uuid, text, text) to authenticated;
grant execute on function public.app_apply_bayi_group(uuid, text, text) to authenticated;
grant execute on function public.app_close_period(text) to authenticated;
