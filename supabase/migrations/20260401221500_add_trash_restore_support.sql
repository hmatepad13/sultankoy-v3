begin;

alter table public.cop_kutusu
  add column if not exists silen_user_id uuid,
  add column if not exists silen_email text,
  add column if not exists geri_yuklendi boolean not null default false,
  add column if not exists geri_yukleme_tarihi timestamptz,
  add column if not exists geri_yukleyen_user_id uuid,
  add column if not exists geri_yukleyen_email text;

update public.cop_kutusu
set silen_email = coalesce(nullif(btrim(silen_email), ''), nullif(btrim(veri ->> 'ekleyen'), ''))
where coalesce(nullif(btrim(silen_email), ''), '') = '';

create index if not exists cop_kutusu_silinme_tarihi_idx
on public.cop_kutusu (silinme_tarihi desc);

create index if not exists cop_kutusu_geri_yuklendi_idx
on public.cop_kutusu (geri_yuklendi, silinme_tarihi desc);

create or replace function public.app_trash_actor_email(p_silen_email text, p_veri jsonb)
returns text
language sql
stable
as $$
  select lower(
    coalesce(
      nullif(btrim(p_silen_email), ''),
      nullif(btrim(p_veri ->> 'ekleyen'), ''),
      ''
    )
  );
$$;

create or replace function public.app_can_manage_trash_item(
  p_silen_user_id uuid,
  p_silen_email text,
  p_veri jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_admin()
    or auth.uid() = p_silen_user_id
    or public.app_normalize_username(public.app_trash_actor_email(p_silen_email, p_veri))
      = public.app_normalize_username(public.app_requester_email());
$$;

drop policy if exists app_select_authenticated on public.cop_kutusu;
drop policy if exists app_insert_authenticated on public.cop_kutusu;
drop policy if exists app_update_authenticated on public.cop_kutusu;
drop policy if exists app_delete_authenticated on public.cop_kutusu;
drop policy if exists app_trash_select_owner_or_admin on public.cop_kutusu;
drop policy if exists app_trash_insert_owner_or_admin on public.cop_kutusu;
drop policy if exists app_trash_update_owner_or_admin on public.cop_kutusu;
drop policy if exists app_trash_delete_admin_only on public.cop_kutusu;

create policy app_trash_select_owner_or_admin
on public.cop_kutusu
for select
to authenticated
using (public.app_can_manage_trash_item(silen_user_id, silen_email, veri));

create policy app_trash_insert_owner_or_admin
on public.cop_kutusu
for insert
to authenticated
with check (
  auth.uid() is not null
  and (silen_user_id is null or auth.uid() = silen_user_id)
  and public.app_normalize_username(public.app_trash_actor_email(silen_email, veri))
    = public.app_normalize_username(public.app_requester_email())
);

create policy app_trash_update_owner_or_admin
on public.cop_kutusu
for update
to authenticated
using (public.app_can_manage_trash_item(silen_user_id, silen_email, veri))
with check (
  public.app_can_manage_trash_item(silen_user_id, silen_email, veri)
  and (
    geri_yukleyen_user_id is null
    or auth.uid() = geri_yukleyen_user_id
    or public.app_is_admin()
  )
);

create policy app_trash_delete_admin_only
on public.cop_kutusu
for delete
to authenticated
using (public.app_is_admin());

create or replace function public.app_delete_satis_fisi(p_fis_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.satis_fisleri%rowtype;
  v_detaylar jsonb;
begin
  if auth.uid() is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  select *
  into v_existing
  from public.satis_fisleri
  where id = p_fis_id
  for update;

  if not found then
    raise exception 'Fis bulunamadi.';
  end if;

  if not public.app_can_manage_record(v_existing.created_by, v_existing.ekleyen) then
    raise exception 'Bu fisi silme yetkiniz yok.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(detay)), '[]'::jsonb)
  into v_detaylar
  from public.satis_giris detay
  where detay.fis_no = v_existing.fis_no;

  insert into public.cop_kutusu (
    tablo_adi,
    veri,
    silinme_tarihi,
    silen_user_id,
    silen_email
  )
  values (
    'satis_fisleri',
    to_jsonb(v_existing) || jsonb_build_object('satis_detaylari', v_detaylar),
    now(),
    auth.uid(),
    public.app_requester_email()
  );

  delete from public.satis_giris
  where fis_no = v_existing.fis_no;

  delete from public.satis_fisleri
  where id = v_existing.id;

  return jsonb_build_object(
    'ok', true,
    'fis_id', v_existing.id,
    'fis_no', v_existing.fis_no,
    'fis_gorseli', v_existing.fis_gorseli
  );
end;
$$;

create or replace function public.app_restore_trash_item(p_trash_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.cop_kutusu%rowtype;
  v_requester_id uuid := auth.uid();
  v_requester_email text := public.app_requester_email();
  v_restore_table text;
begin
  if v_requester_id is null then
    raise exception 'Oturum bulunamadi.';
  end if;

  select *
  into v_item
  from public.cop_kutusu
  where id = p_trash_id
  for update;

  if not found then
    raise exception 'Cop kaydi bulunamadi.';
  end if;

  if v_item.geri_yuklendi then
    return jsonb_build_object(
      'ok', true,
      'already_restored', true,
      'tablo_adi', v_item.tablo_adi
    );
  end if;

  if not public.app_can_manage_trash_item(v_item.silen_user_id, v_item.silen_email, v_item.veri) then
    raise exception 'Bu cop kaydini geri yukleme yetkiniz yok.';
  end if;

  if v_item.tablo_adi = 'satis_fisleri' then
    if exists (
      select 1
      from public.satis_fisleri
      where fis_no = nullif(v_item.veri ->> 'fis_no', '')
    ) then
      raise exception 'Ayni fis numarasiyla aktif bir kayit zaten var.';
    end if;

    if (v_item.veri ? 'id')
      and exists (
        select 1
        from public.satis_fisleri
        where id = (v_item.veri ->> 'id')::bigint
      ) then
      raise exception 'Ayni kimlikle aktif bir satis fisi zaten var.';
    end if;

    insert into public.satis_fisleri
    select (jsonb_populate_record(null::public.satis_fisleri, v_item.veri - 'satis_detaylari')).*;

    insert into public.satis_giris
    select (jsonb_populate_record(null::public.satis_giris, detay)).*
    from jsonb_array_elements(coalesce(v_item.veri -> 'satis_detaylari', '[]'::jsonb)) as detay;

    v_restore_table := 'satis_fisleri';
  elsif v_item.tablo_adi = 'sut_giris' then
    if exists (
      select 1
      from public.sut_giris
      where id = (v_item.veri ->> 'id')::integer
    ) then
      raise exception 'Ayni kimlikle aktif bir sut kaydi zaten var.';
    end if;

    insert into public.sut_giris
    select (jsonb_populate_record(null::public.sut_giris, v_item.veri)).*;

    v_restore_table := 'sut_giris';
  elsif v_item.tablo_adi = 'giderler' then
    if exists (
      select 1
      from public.giderler
      where id = (v_item.veri ->> 'id')::bigint
    ) then
      raise exception 'Ayni kimlikle aktif bir gider kaydi zaten var.';
    end if;

    insert into public.giderler
    select (jsonb_populate_record(null::public.giderler, v_item.veri)).*;

    v_restore_table := 'giderler';
  elsif v_item.tablo_adi = 'uretim' then
    if exists (
      select 1
      from public.uretim
      where id = (v_item.veri ->> 'id')::integer
    ) then
      raise exception 'Ayni kimlikle aktif bir uretim kaydi zaten var.';
    end if;

    insert into public.uretim
    select (jsonb_populate_record(null::public.uretim, v_item.veri)).*;

    v_restore_table := 'uretim';
  elsif v_item.tablo_adi = 'sevkiyatlar' then
    if exists (
      select 1
      from public.sevkiyatlar
      where id = (v_item.veri ->> 'id')::bigint
    ) then
      raise exception 'Ayni kimlikle aktif bir sevkiyat kaydi zaten var.';
    end if;

    insert into public.sevkiyatlar
    select (jsonb_populate_record(null::public.sevkiyatlar, v_item.veri)).*;

    v_restore_table := 'sevkiyatlar';
  else
    raise exception 'Bu kayit tipi icin geri yukleme desteklenmiyor: %', v_item.tablo_adi;
  end if;

  update public.cop_kutusu
  set
    geri_yuklendi = true,
    geri_yukleme_tarihi = now(),
    geri_yukleyen_user_id = v_requester_id,
    geri_yukleyen_email = v_requester_email
  where id = v_item.id;

  return jsonb_build_object(
    'ok', true,
    'tablo_adi', v_restore_table,
    'trash_id', v_item.id
  );
exception
  when unique_violation then
    raise exception 'Geri yukleme tamamlanamadi: ayni kayit zaten mevcut.';
end;
$$;

grant execute on function public.app_trash_actor_email(text, jsonb) to authenticated;
grant execute on function public.app_can_manage_trash_item(uuid, text, jsonb) to authenticated;
grant execute on function public.app_delete_satis_fisi(bigint) to authenticated;
grant execute on function public.app_restore_trash_item(uuid) to authenticated;

commit;
