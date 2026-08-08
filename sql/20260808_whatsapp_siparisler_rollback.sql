-- Yalniz WhatsApp Siparisler ozelligini kaldirir; mevcut satis/cari tablolarina dokunmaz.
begin;
drop table if exists public.whatsapp_worker_durumu;
drop table if exists public.whatsapp_siparis_taslaklari;
drop table if exists public.whatsapp_musteri_eslesmeleri;
drop table if exists public.whatsapp_islem_istekleri;
commit;
