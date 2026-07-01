create or replace function public.app_default_actor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  order by
    case when coalesce(role, '') = 'admin' then 0 else 1 end,
    username nulls last
  limit 1
$$;

create or replace function public.app_recalculate_future_devirs_for_satis_date(
  p_changed_date date,
  p_actor_id uuid default auth.uid(),
  p_actor_email text default public.app_requester_email()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := coalesce(p_actor_id, auth.uid(), public.app_default_actor_id());
  v_actor_email text := coalesce(nullif(p_actor_email, ''), public.app_requester_email(), 'sistem@otomatik');
  v_changed_period text;
  v_latest_period text;
  v_period text;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_changed_date is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'empty_date');
  end if;

  if v_actor_id is null then
    raise exception 'Otomatik devir yenileme için sistem kullanıcısı bulunamadı.';
  end if;

  v_changed_period := to_char(p_changed_date, 'YYYY-MM');

  select max(to_char(tarih, 'YYYY-MM'))
  into v_latest_period
  from public.satis_fisleri;

  if v_latest_period is null or v_changed_period >= v_latest_period then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'changed_period', v_changed_period,
      'latest_period', v_latest_period
    );
  end if;

  v_period := v_changed_period;
  while v_period < v_latest_period loop
    v_result := public.app_close_period_core(v_period, v_actor_id, v_actor_email);
    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'period', v_period,
        'result', v_result
      )
    );
    v_period := to_char((to_date(v_period || '-01', 'YYYY-MM-DD') + interval '1 month')::date, 'YYYY-MM');
  end loop;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'changed_period', v_changed_period,
    'latest_period', v_latest_period,
    'results', v_results
  );
end;
$$;

grant execute on function public.app_default_actor_id() to authenticated;
grant execute on function public.app_recalculate_future_devirs_for_satis_date(date, uuid, text) to authenticated;
