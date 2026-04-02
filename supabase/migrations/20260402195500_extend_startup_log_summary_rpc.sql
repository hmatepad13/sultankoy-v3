begin;

create index if not exists app_performans_loglari_created_at_idx
on public.app_performans_loglari (created_at desc);

create index if not exists app_hata_loglari_created_at_idx
on public.app_hata_loglari (created_at desc);

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
  v_error_since timestamptz := now() - interval '30 day';
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
    ),
    app_perf as (
      select
        created_at,
        coalesce(kullanici_eposta, '') as kullanici_eposta,
        coalesce(olay, '') as olay,
        coalesce(kategori, '') as kategori,
        coalesce(sonuc, '') as sonuc,
        coalesce(toplam_ms, 0)::numeric as toplam_ms,
        coalesce(kayit_ms, 0)::numeric as kayit_ms,
        coalesce(yenileme_ms, 0)::numeric as yenileme_ms,
        coalesce(gorsel_yukleme_ms, 0)::numeric as gorsel_yukleme_ms,
        coalesce(detay_sayisi, 0)::numeric as detay_sayisi,
        coalesce(hata_mesaji, '') as hata_mesaji
      from public.app_performans_loglari
      where created_at >= v_since
    ),
    app_errors as (
      select
        created_at,
        coalesce(kullanici_eposta, '') as kullanici_eposta,
        coalesce(islem, '') as islem,
        coalesce(kategori, '') as kategori,
        coalesce(seviye, '') as seviye,
        coalesce(mesaj, '') as mesaj,
        coalesce(kayit_ref, '') as kayit_ref
      from public.app_hata_loglari
      where created_at >= v_error_since
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
      ), '[]'::jsonb),
      'appPerformanceCount', coalesce((select count(*) from app_perf), 0),
      'appPerformanceMetrics', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'olay', perf_stats.olay,
            'kategori', perf_stats.kategori,
            'sonuc', perf_stats.sonuc,
            'sampleCount', perf_stats.sample_count,
            'avgMs', perf_stats.avg_ms,
            'p50Ms', perf_stats.p50_ms,
            'p95Ms', perf_stats.p95_ms,
            'maxMs', perf_stats.max_ms,
            'avgKayitMs', perf_stats.avg_kayit_ms,
            'avgYenilemeMs', perf_stats.avg_yenileme_ms,
            'avgImageMs', perf_stats.avg_image_ms,
            'avgDetaySayisi', perf_stats.avg_detay_sayisi
          )
          order by perf_stats.sample_count desc, perf_stats.avg_ms desc
        )
        from (
          select
            olay,
            kategori,
            sonuc,
            count(*) as sample_count,
            round(avg(toplam_ms), 1) as avg_ms,
            percentile_cont(0.5) within group (order by toplam_ms) as p50_ms,
            percentile_cont(0.95) within group (order by toplam_ms) as p95_ms,
            max(toplam_ms) as max_ms,
            round(avg(kayit_ms), 1) as avg_kayit_ms,
            round(avg(yenileme_ms), 1) as avg_yenileme_ms,
            round(avg(gorsel_yukleme_ms), 1) as avg_image_ms,
            round(avg(detay_sayisi), 1) as avg_detay_sayisi
          from app_perf
          group by olay, kategori, sonuc
        ) as perf_stats
      ), '[]'::jsonb),
      'appPerformanceRecent', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'createdAt', recent_perf.created_at,
            'userEmail', recent_perf.kullanici_eposta,
            'olay', recent_perf.olay,
            'kategori', recent_perf.kategori,
            'sonuc', recent_perf.sonuc,
            'toplamMs', recent_perf.toplam_ms,
            'kayitMs', recent_perf.kayit_ms,
            'yenilemeMs', recent_perf.yenileme_ms,
            'gorselYuklemeMs', recent_perf.gorsel_yukleme_ms,
            'detaySayisi', recent_perf.detay_sayisi,
            'hataMesaji', recent_perf.hata_mesaji
          )
          order by recent_perf.created_at desc
        )
        from (
          select *
          from app_perf
          order by created_at desc
          limit v_recent_limit
        ) as recent_perf
      ), '[]'::jsonb),
      'appErrorCount', coalesce((select count(*) from app_errors), 0),
      'appErrorMetrics', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'islem', error_stats.islem,
            'kategori', error_stats.kategori,
            'seviye', error_stats.seviye,
            'count', error_stats.error_count,
            'latestAt', error_stats.latest_at
          )
          order by error_stats.error_count desc, error_stats.latest_at desc
        )
        from (
          select
            islem,
            kategori,
            seviye,
            count(*) as error_count,
            max(created_at) as latest_at
          from app_errors
          group by islem, kategori, seviye
        ) as error_stats
      ), '[]'::jsonb),
      'appErrorRecent', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'createdAt', recent_error.created_at,
            'userEmail', recent_error.kullanici_eposta,
            'islem', recent_error.islem,
            'kategori', recent_error.kategori,
            'seviye', recent_error.seviye,
            'mesaj', recent_error.mesaj,
            'kayitRef', recent_error.kayit_ref
          )
          order by recent_error.created_at desc
        )
        from (
          select *
          from app_errors
          order by created_at desc
          limit v_recent_limit
        ) as recent_error
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.app_get_startup_log_summary(integer, integer) to authenticated;

commit;
