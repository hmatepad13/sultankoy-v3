create or replace function public.app_list_periods()
returns table (donem text)
language sql
stable
security definer
set search_path = public
as $$
  select donem
  from (
    select to_char(timezone('Europe/Istanbul', now()), 'YYYY-MM') as donem
    union
    select to_char(tarih, 'YYYY-MM') from public.satis_fisleri where tarih is not null
    union
    select to_char(tarih, 'YYYY-MM') from public.giderler where tarih is not null
    union
    select to_char(tarih, 'YYYY-MM') from public.sut_giris where tarih is not null
    union
    select to_char(tarih, 'YYYY-MM') from public.uretim where tarih is not null
    union
    select to_char(tarih, 'YYYY-MM') from public.sevkiyatlar where tarih is not null
    union
    select to_char(tarih, 'YYYY-MM') from public.cek_senet_kayitlari where tarih is not null
  ) as donemler
  where donem ~ '^\d{4}-\d{2}$'
  order by donem desc;
$$;

revoke all on function public.app_list_periods() from public;
revoke all on function public.app_list_periods() from anon;
grant execute on function public.app_list_periods() to authenticated;
