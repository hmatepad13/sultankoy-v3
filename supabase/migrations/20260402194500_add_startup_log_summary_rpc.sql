begin;

create index if not exists client_logs_source_created_at_idx
on public.client_logs (source, created_at desc);

create or replace function public.app_get_startup_log_summary(
  p_days integer default 2,
  p_recent_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 2), 14));
  v_recent_limit integer := greatest(1, least(coalesce(p_recent_limit, 12), 30));
  v_since timestamptz := now() - make_interval(days => v_days);
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  if not public.app_is_admin() then
    raise exception 'Bu rapora sadece admin erisebilir.';
  end if;

  return (
    with first_interactive as (
      select
        created_at,
        coalesce(user_email, '') as user_email,
        coalesce(session_id, '') as session_id,
        coalesce(details ->> 'active_tab', details ->> 'activeTab', '') as active_tab,
        coalesce(details ->> 'aktifDonem', '') as aktif_donem,
        coalesce(nullif(details ->> 'duration_ms', '')::numeric, 0) as duration_ms,
        coalesce(nullif(details ->> 'fetch_ms', '')::numeric, 0) as fetch_ms,
        coalesce(nullif(details ->> 'post_fetch_render_ms', '')::numeric, 0) as render_ms,
        nullif(details ->> 'auth_ms', '')::numeric as auth_ms
      from public.client_logs
      where source = 'startup.first_interactive'
        and created_at >= v_since
    ),
    fetch_table as (
      select
        coalesce(details ->> 'table', '') as table_name,
        coalesce(nullif(details ->> 'duration_ms', '')::numeric, 0) as duration_ms,
        coalesce(nullif(details ->> 'row_count', '')::numeric, 0) as row_count
      from public.client_logs
      where source = 'startup.fetch_table'
        and created_at >= v_since
    ),
    session_patterns as (
      select
        session_id,
        count(*) filter (where source = 'startup.fetch_table') as fetch_table_count,
        count(*) filter (where source = 'startup.fetch_all') as fetch_all_count,
        count(*) filter (where source = 'startup.first_interactive') as first_interactive_count
      from public.client_logs
      where source like 'startup.%'
        and created_at >= v_since
        and coalesce(session_id, '') <> ''
      group by session_id
    )
    select jsonb_build_object(
      'generatedAt', now(),
      'since', v_since,
      'sessionCount', coalesce((select count(*) from first_interactive), 0),
      'userCount', coalesce((select count(distinct lower(user_email)) from first_interactive where user_email <> ''), 0),
      'avgMs', coalesce((select round(avg(duration_ms), 1) from first_interactive), 0),
      'p50Ms', coalesce((select percentile_cont(0.5) within group (order by duration_ms) from first_interactive), 0),
      'p95Ms', coalesce((select percentile_cont(0.95) within group (order by duration_ms) from first_interactive), 0),
      'maxMs', coalesce((select max(duration_ms) from first_interactive), 0),
      'avgFetchMs', coalesce((select round(avg(fetch_ms), 1) from first_interactive), 0),
      'p50FetchMs', coalesce((select percentile_cont(0.5) within group (order by fetch_ms) from first_interactive), 0),
      'p95FetchMs', coalesce((select percentile_cont(0.95) within group (order by fetch_ms) from first_interactive), 0),
      'maxFetchMs', coalesce((select max(fetch_ms) from first_interactive), 0),
      'avgRenderMs', coalesce((select round(avg(render_ms), 1) from first_interactive), 0),
      'p50RenderMs', coalesce((select percentile_cont(0.5) within group (order by render_ms) from first_interactive), 0),
      'maxRenderMs', coalesce((select max(render_ms) from first_interactive), 0),
      'slow5sCount', coalesce((select count(*) from first_interactive where duration_ms >= 5000), 0),
      'slow10sCount', coalesce((select count(*) from first_interactive where duration_ms >= 10000), 0),
      'daily', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'gun', day_stats.gun,
            'sessionCount', day_stats.session_count,
            'userCount', day_stats.user_count,
            'avgMs', day_stats.avg_ms,
            'p50Ms', day_stats.p50_ms,
            'p95Ms', day_stats.p95_ms,
            'maxMs', day_stats.max_ms,
            'slow5sCount', day_stats.slow5s_count
          )
          order by day_stats.gun desc
        )
        from (
          select
            to_char(created_at at time zone 'Europe/Istanbul', 'YYYY-MM-DD') as gun,
            count(*) as session_count,
            count(distinct lower(user_email)) filter (where user_email <> '') as user_count,
            round(avg(duration_ms), 1) as avg_ms,
            percentile_cont(0.5) within group (order by duration_ms) as p50_ms,
            percentile_cont(0.95) within group (order by duration_ms) as p95_ms,
            max(duration_ms) as max_ms,
            count(*) filter (where duration_ms >= 5000) as slow5s_count
          from first_interactive
          group by 1
        ) as day_stats
      ), '[]'::jsonb),
      'fetchPatterns', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'fetchTableCount', pattern_stats.fetch_table_count,
            'fetchAllCount', pattern_stats.fetch_all_count,
            'firstInteractiveCount', pattern_stats.first_interactive_count,
            'sessionCount', pattern_stats.session_count
          )
          order by pattern_stats.session_count desc, pattern_stats.fetch_table_count asc
        )
        from (
          select
            fetch_table_count,
            fetch_all_count,
            first_interactive_count,
            count(*) as session_count
          from session_patterns
          group by 1, 2, 3
        ) as pattern_stats
      ), '[]'::jsonb),
      'tableMetrics', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'table', table_stats.table_name,
            'sampleCount', table_stats.sample_count,
            'avgMs', table_stats.avg_ms,
            'p50Ms', table_stats.p50_ms,
            'p95Ms', table_stats.p95_ms,
            'maxMs', table_stats.max_ms,
            'avgRowCount', table_stats.avg_row_count,
            'maxRowCount', table_stats.max_row_count
          )
          order by table_stats.avg_ms desc, table_stats.table_name asc
        )
        from (
          select
            table_name,
            count(*) as sample_count,
            round(avg(duration_ms), 1) as avg_ms,
            percentile_cont(0.5) within group (order by duration_ms) as p50_ms,
            percentile_cont(0.95) within group (order by duration_ms) as p95_ms,
            max(duration_ms) as max_ms,
            round(avg(row_count), 1) as avg_row_count,
            max(row_count) as max_row_count
          from fetch_table
          where table_name <> ''
          group by table_name
        ) as table_stats
      ), '[]'::jsonb),
      'recentSessions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'createdAt', recent.created_at,
            'userEmail', recent.user_email,
            'sessionId', recent.session_id,
            'activeTab', recent.active_tab,
            'aktifDonem', recent.aktif_donem,
            'durationMs', recent.duration_ms,
            'fetchMs', recent.fetch_ms,
            'renderMs', recent.render_ms,
            'authMs', recent.auth_ms
          )
          order by recent.created_at desc
        )
        from (
          select *
          from first_interactive
          order by created_at desc
          limit v_recent_limit
        ) as recent
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.app_get_startup_log_summary(integer, integer) to authenticated;

commit;
