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
      is_devir and matched_bayi_id is not null as is_source_reset,
      case when is_devir then 0 else 1 end as same_day_order
    from matched
    where coalesce(hesap_grubu, matched_bayi_name, bayi) is not null
      and btrim(coalesce(hesap_grubu, matched_bayi_name, bayi)) <> ''
  ),
  segmented as (
    select
      *,
      sum(case when is_group_reset then 1 else 0 end)
        over (
          partition by account_key
          order by tarih, same_day_order, id
          rows between unbounded preceding and current row
        ) as full_reset_group
    from events
  ),
  source_segmented as (
    select
      *,
      sum(case when is_source_reset then 1 else 0 end)
        over (
          partition by account_key, full_reset_group, source_key
          order by tarih, same_day_order, id
          rows between unbounded preceding and current row
        ) as source_reset_group
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
          order by tarih, same_day_order, id
          rows between unbounded preceding and current row
        ) as source_balance,
      row_number()
        over (partition by account_key order by tarih desc, same_day_order desc, id desc) as account_rn,
      row_number()
        over (partition by account_key, full_reset_group, source_key order by tarih desc, same_day_order desc, id desc) as source_rn
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

grant execute on function public.app_satis_account_balances(date, uuid, text) to authenticated;
