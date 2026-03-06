begin;

create or replace function public.is_admin_email()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@sistem.local');
$$;

alter table public.profiles add column if not exists role text not null default 'calisan';
alter table public.profiles add column if not exists ad text;
alter table public.profiles add column if not exists username text;
alter table public.uretim add column if not exists ekleyen text;

insert into public.profiles (id, username, ad, role)
select
  u.id,
  lower(coalesce(u.email, u.id::text)),
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    split_part(lower(coalesce(u.email, u.id::text)), '@', 1)
  ),
  case
    when lower(coalesce(u.email, '')) = 'admin@sistem.local' then 'admin'
    else 'calisan'
  end
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);

update public.profiles p
set
  username = coalesce(nullif(lower(p.username), ''), lower(coalesce(u.email, p.id::text))),
  ad = coalesce(
    nullif(p.ad, ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    split_part(lower(coalesce(u.email, p.id::text)), '@', 1)
  ),
  role = case
    when lower(coalesce(p.username, u.email, '')) = 'admin@sistem.local' then 'admin'
    when p.role is null or btrim(p.role) = '' then 'calisan'
    else p.role
  end
from auth.users u
where u.id = p.id;

update public.uretim u
set ekleyen = coalesce(nullif(u.ekleyen, ''), lower(coalesce(p.username, au.email, u.created_by::text)))
from public.profiles p
left join auth.users au on au.id = p.id
where p.id = u.created_by
  and (u.ekleyen is null or btrim(u.ekleyen) = '');

update public.uretim u
set ekleyen = lower(coalesce(au.email, u.created_by::text))
from auth.users au
where au.id = u.created_by
  and (u.ekleyen is null or btrim(u.ekleyen) = '');

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    username = coalesce(nullif(lower(coalesce(new.email, '')), ''), username, new.id::text),
    ad = coalesce(
      nullif(ad, ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(lower(coalesce(new.email, new.id::text)), '@', 1)
    ),
    role = case
      when lower(coalesce(new.email, '')) = 'admin@sistem.local' then 'admin'
      when role is null or btrim(role) = '' then 'calisan'
      else role
    end
  where id = new.id;

  if not found then
    insert into public.profiles (id, username, ad, role)
    values (
      new.id,
      lower(coalesce(new.email, new.id::text)),
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        split_part(lower(coalesce(new.email, new.id::text)), '@', 1)
      ),
      case
        when lower(coalesce(new.email, '')) = 'admin@sistem.local' then 'admin'
        else 'calisan'
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_auth_user_profile();

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own_or_admin on public.profiles;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy profiles_select_admin
on public.profiles
for select
to authenticated
using (public.is_admin_email());

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (auth.uid() = id or public.is_admin_email());

create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_admin_email())
with check (auth.uid() = id or public.is_admin_email());

commit;
