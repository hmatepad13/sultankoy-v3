# Devam ve Surum Notlari

Tarih: `2026-03-09 16:00:25`
Proje yolu: `C:\Users\BattleStar\Desktop\site kod\sultankoy-v3`
Canli adres: `https://sultankoy-v3.vercel.app/`
Aktif branch: `main`
Yedek temel commit'i: `ddf170b`

## Bu yedekte neler var

- Tam proje arsivi: `backups/sultankoy-v3-tam-yedek-20260309-160025.zip`
- Kaynak odakli arsiv: `backups/sultankoy-v3-kaynak-yedek-20260309-160025.zip`
- Bu detayli not dosyasi
- Yeni sohbete tasinabilecek kisa ozet dosyasi

Tam yedek arsivi su klasorleri ve dosyalari da kapsar:
- `.git`
- `.env`
- `node_modules`
- `dist`
- `backups`
- `sql`
- `supabase`
- `src`
- `public`
- gecici klasorler: `.codex-debug`, `temp-image-tests`

## Genel durum

Proje calisir durumda. Ana akislar aktif:
- satis fisi olusturma / duzenleme / silme
- tahsilat
- kasa devir
- sut girisi
- yogurt uretimi
- sut kaymagi uretimi
- gider girisi
- ozet ve analiz ekranlari
- donem kapatma / devir mantigi
- HTML / Excel / JSON yedek
- musteri ekstresi
- cop kutusu ve admin bosaltma
- kullanici yetkileri
- ayarlarda sifre degistirme
- admin icin kullanici yonetimi

## Supabase ve guvenlik durumu

- `user-admin` Edge Function deploy edildi ve kullanici yonetimi bunun uzerinden calisiyor.
- `ADMIN_USERS=admin@sistem.local` secret tanimli.
- satis kaydet / sil / donem kapat icin RPC katmani kullaniliyor.
- `fis_no` duplicate sorunu temizlenmis ve benzersizlik guclendirilmisti.
- islem tablolarinda yeni kayitlar `id` alanlarini da yaziyor:
  - `satis_fisleri.bayi_id`
  - `satis_giris.bayi_id`
  - `satis_giris.urun_id`
  - `sut_giris.ciftlik_id`
- okuma tarafi `id` oncelikli, isim fallback mantigina gecirildi.

## Gorsel yukleme durumu

Su anda hem satis fisi hem gider gorselleri yuklenmeden once otomatik optimize ediliyor:
- uzun kenar: `900 px`
- format: `JPEG`
- kalite: `%50`

Bu ayar ciddi dosya boyutu kazanci sagliyor. Testte:
- `~4 MB` dosya `~55 KB`
- `~8 MB` dosya `~50 KB`
seviyesine kadar inebildi.

Ek notlar:
- satis gorseli dosya adina fis numarasi ekleniyor
- gorsel onizleme modalinde dosya boyutu gorunuyor

## Yedekleme durumu

Uygulama icinde calisan yedekler:
- JSON yedegi
- Excel yedegi
- HTML rapor yedegi

HTML rapor:
- tek dosya
- sekmeli
- donem secicili
- offline acilabilir

## Ana ekran ve mobil durum

Alt menu:
- `Menu`
- `Ozet`
- `Satis`
- `Gider`

Menu icinde:
- `Sut`
- `Uretim`
- `Analiz`
- `Ayarlar`

Mobilde bircok tablo ve popup sikilastirildi. Yine de yeni islerde once mobil gorunum dusunulmeli.

## Son donemde eklenen onemli ozellikler

- Ayarlarda sifre degistirme
- Admin icin kullanici yonetimi
- Musteri ekstresi
- Giderlerde detay gor ve gorsel ekleme
- Satis ve gider gorsellerinde otomatik sikistirma
- Uretimde fiyat hafizasi ve paket akislari
- Hammadde odeme / borc popup ozeti
- Sabit urun mantigi
- Gider turu yonetimi

## Bilinen notlar

- `vite build` sirasinda buyuk chunk uyari kalabilir; su an calismayi bozmuyor.
- Uzun sohbetler baglam sismesi nedeniyle donabiliyor. Yeni sohbette bu dosya ve kisa ozet dosyasi kullanilmali.
- `urunler.sabit` ile ilgili bir hata gorulurse `sql/add-sabit-column-to-urunler.sql` kontrol edilmeli.
- SQL / Edge Function / deploy islerinde tek tek adim gitmek daha guvenli.

## Yeni sohbette nasil devam edilmeli

Yeni sohbette ilk mesaj olarak su iki dosya referans verilsin:
- `DEVAM-VE-SURUM-NOTLARI-20260309.md`
- `YENI-SOHBET-OZETI-20260309.txt`

Ve su calisma sekli istensin:
- tek gorev
- kisa cevap
- gerekmedikce buyuk log / JSON / base64 gonderme
- gorsel / tasarim islerinde once local/branch

## Son geri donus noktasi

Bu dosya olusturuldugunda proje kod referansi:
- `ddf170b` `Gorsel indirme ikonu ve fis kg gostermesini duzelt`

Bu dosya ve arsivler, yeni sohbete geciste guvenli baslangic noktasi olarak kullanilabilir.
