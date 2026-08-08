begin;

create table if not exists public.whatsapp_islem_istekleri (
  id uuid primary key default gen_random_uuid(),
  tur text not null check (tur in ('test_mesajlari', 'siparisleri_getir')),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'isleniyor', 'tamamlandi', 'hata')),
  arama_metni text,
  baslangic timestamptz not null default (now() - interval '24 hours'),
  sonuc_sayisi integer not null default 0,
  hata_mesaji text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.whatsapp_musteri_eslesmeleri (
  id uuid primary key default gen_random_uuid(),
  bayi_id uuid not null references public.bayiler(id) on delete cascade,
  telefon text not null,
  chat_jid text not null,
  etiket text,
  aktif boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_musteri_bayi_unique unique (bayi_id),
  constraint whatsapp_musteri_chat_unique unique (chat_jid)
);

create table if not exists public.whatsapp_siparis_taslaklari (
  id uuid primary key default gen_random_uuid(),
  istek_id uuid not null references public.whatsapp_islem_istekleri(id) on delete cascade,
  mesaj_id text not null,
  bayi_id uuid references public.bayiler(id) on delete set null,
  bayi_adi_snapshot text,
  chat_jid text not null,
  chat_adi text,
  gonderen_jid text,
  ham_mesaj text not null,
  mesaj_zamani timestamptz not null,
  yogurt_5kg integer,
  yogurt_3kg integer,
  guven numeric(5, 2),
  durum text not null default 'kontrol' check (durum in ('test', 'hazir', 'kontrol', 'yoksayildi')),
  aciklama text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_siparis_mesaj_unique unique (istek_id, mesaj_id, chat_jid)
);

create table if not exists public.whatsapp_worker_durumu (
  id text primary key,
  last_seen timestamptz not null default now(),
  whatsapp_bagli boolean not null default false,
  worker_surumu text,
  aktif_is_id uuid references public.whatsapp_islem_istekleri(id) on delete set null,
  son_hata text,
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_islem_bekleyen_idx
  on public.whatsapp_islem_istekleri (durum, created_at);
create index if not exists whatsapp_eslesme_aktif_idx
  on public.whatsapp_musteri_eslesmeleri (aktif, chat_jid);
create index if not exists whatsapp_taslak_istek_idx
  on public.whatsapp_siparis_taslaklari (istek_id, mesaj_zamani desc);

alter table public.whatsapp_islem_istekleri enable row level security;
alter table public.whatsapp_musteri_eslesmeleri enable row level security;
alter table public.whatsapp_siparis_taslaklari enable row level security;
alter table public.whatsapp_worker_durumu enable row level security;

create policy whatsapp_islem_admin_select on public.whatsapp_islem_istekleri
  for select to authenticated using (public.is_admin_email());
create policy whatsapp_islem_admin_insert on public.whatsapp_islem_istekleri
  for insert to authenticated with check (public.is_admin_email());
create policy whatsapp_islem_admin_delete on public.whatsapp_islem_istekleri
  for delete to authenticated using (public.is_admin_email());

create policy whatsapp_eslesme_admin_select on public.whatsapp_musteri_eslesmeleri
  for select to authenticated using (public.is_admin_email());
create policy whatsapp_eslesme_admin_insert on public.whatsapp_musteri_eslesmeleri
  for insert to authenticated with check (public.is_admin_email());
create policy whatsapp_eslesme_admin_update on public.whatsapp_musteri_eslesmeleri
  for update to authenticated using (public.is_admin_email()) with check (public.is_admin_email());
create policy whatsapp_eslesme_admin_delete on public.whatsapp_musteri_eslesmeleri
  for delete to authenticated using (public.is_admin_email());

create policy whatsapp_taslak_admin_select on public.whatsapp_siparis_taslaklari
  for select to authenticated using (public.is_admin_email());
create policy whatsapp_taslak_admin_update on public.whatsapp_siparis_taslaklari
  for update to authenticated using (public.is_admin_email()) with check (public.is_admin_email());
create policy whatsapp_taslak_admin_delete on public.whatsapp_siparis_taslaklari
  for delete to authenticated using (public.is_admin_email());

create policy whatsapp_worker_admin_select on public.whatsapp_worker_durumu
  for select to authenticated using (public.is_admin_email());

revoke all on public.whatsapp_islem_istekleri from anon;
revoke all on public.whatsapp_musteri_eslesmeleri from anon;
revoke all on public.whatsapp_siparis_taslaklari from anon;
revoke all on public.whatsapp_worker_durumu from anon;

grant select, insert, delete on public.whatsapp_islem_istekleri to authenticated;
grant select, insert, update, delete on public.whatsapp_musteri_eslesmeleri to authenticated;
grant select, update, delete on public.whatsapp_siparis_taslaklari to authenticated;
grant select on public.whatsapp_worker_durumu to authenticated;

comment on table public.whatsapp_islem_istekleri is 'Sultankoy arayuzunden Oracle WhatsApp workerina giden izole is kuyrugu.';
comment on table public.whatsapp_musteri_eslesmeleri is 'Sultankoy bayileri ile izin verilen WhatsApp sohbetlerinin eslesmesi.';
comment on table public.whatsapp_siparis_taslaklari is 'Finansal kayit olusturmayan, kullanici onayina tabi WhatsApp siparis taslaklari.';
comment on table public.whatsapp_worker_durumu is 'Oracle WhatsApp worker heartbeat ve baglanti durumu.';

commit;
