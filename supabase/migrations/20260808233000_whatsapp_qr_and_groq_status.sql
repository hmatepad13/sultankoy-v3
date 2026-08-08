begin;

alter table public.whatsapp_islem_istekleri
  drop constraint if exists whatsapp_islem_istekleri_tur_check;

alter table public.whatsapp_islem_istekleri
  add constraint whatsapp_islem_istekleri_tur_check
  check (tur in ('test_mesajlari', 'siparisleri_getir', 'qr_olustur'));

alter table public.whatsapp_worker_durumu
  add column if not exists whatsapp_durum text not null default 'bilinmiyor',
  add column if not exists whatsapp_detay text,
  add column if not exists groq_bagli boolean not null default false,
  add column if not exists groq_son_kontrol timestamptz,
  add column if not exists qr_kod text,
  add column if not exists qr_expires_at timestamptz;

alter table public.whatsapp_worker_durumu
  drop constraint if exists whatsapp_worker_durumu_whatsapp_durum_check;

alter table public.whatsapp_worker_durumu
  add constraint whatsapp_worker_durumu_whatsapp_durum_check
  check (whatsapp_durum in (
    'bilinmiyor',
    'bagli',
    'yeniden_baglaniyor',
    'servis_yok',
    'oturum_yok',
    'qr_hazirlaniyor',
    'qr_bekleniyor',
    'hata'
  ));

comment on column public.whatsapp_worker_durumu.qr_kod is
  'Yalniz admin RLS ile okunan, kisa omurlu WhatsApp QR data URL degeri.';

commit;
