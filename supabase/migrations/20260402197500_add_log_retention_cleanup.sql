begin;

create index if not exists app_performans_loglari_created_at_desc_idx
on public.app_performans_loglari (created_at desc);

create index if not exists app_hata_loglari_created_at_desc_idx
on public.app_hata_loglari (created_at desc);

create or replace function public.app_apply_log_retention(
  p_client_days integer default 14,
  p_perf_days integer default 14,
  p_error_days integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_days integer := greatest(1, least(coalesce(p_client_days, 14), 365));
  v_perf_days integer := greatest(1, least(coalesce(p_perf_days, 14), 365));
  v_error_days integer := greatest(1, least(coalesce(p_error_days, 60), 3650));
  v_client_deleted integer := 0;
  v_perf_deleted integer := 0;
  v_error_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  delete from public.client_logs
  where created_at < now() - make_interval(days => v_client_days);
  get diagnostics v_client_deleted = row_count;

  delete from public.app_performans_loglari
  where created_at < now() - make_interval(days => v_perf_days);
  get diagnostics v_perf_deleted = row_count;

  delete from public.app_hata_loglari
  where created_at < now() - make_interval(days => v_error_days);
  get diagnostics v_error_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'clientDays', v_client_days,
    'performanceDays', v_perf_days,
    'errorDays', v_error_days,
    'clientDeleted', v_client_deleted,
    'performanceDeleted', v_perf_deleted,
    'errorDeleted', v_error_deleted,
    'ranAt', now()
  );
end;
$$;

grant execute on function public.app_apply_log_retention(integer, integer, integer) to authenticated;

commit;
