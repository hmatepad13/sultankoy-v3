create unique index if not exists satis_fisleri_fis_no_unique_idx
on public.satis_fisleri (fis_no)
where nullif(fis_no, '') is not null;

create or replace function public.app_prevent_duplicate_satis_fis_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(new.fis_no, '') is null then
    return new;
  end if;

  if exists (
    select 1
    from public.satis_fisleri sf
    where sf.fis_no = new.fis_no
      and (tg_op = 'INSERT' or sf.id is distinct from new.id)
  ) then
    raise exception 'Bu fiş numarası zaten kayıtlı. Sayfa gecikmesi/çift tıklama nedeniyle ikinci kayıt engellendi: %', new.fis_no;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_satis_fis_no on public.satis_fisleri;

create trigger trg_prevent_duplicate_satis_fis_no
before insert or update of fis_no on public.satis_fisleri
for each row
execute function public.app_prevent_duplicate_satis_fis_no();
