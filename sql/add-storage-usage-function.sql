begin;

create or replace function public.get_storage_usage_summary()
returns table (
  database_bytes bigint,
  image_bytes bigint,
  image_count bigint
)
language sql
security definer
set search_path = public, storage
as $$
  select
    pg_database_size(current_database())::bigint as database_bytes,
    coalesce((
      select sum(
        case
          when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint
          else 0
        end
      )
      from storage.objects o
      where o.bucket_id = 'fis_gorselleri'
    ), 0)::bigint as image_bytes,
    coalesce((
      select count(*)
      from storage.objects o
      where o.bucket_id = 'fis_gorselleri'
    ), 0)::bigint as image_count
$$;

grant execute on function public.get_storage_usage_summary() to authenticated;

commit;
