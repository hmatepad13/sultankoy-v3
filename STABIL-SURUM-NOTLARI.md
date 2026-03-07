# Stabil Surum Notlari

Tarih: `2026-03-07 12:33:15`
Canli adres: `https://sultankoy-v3.vercel.app/`
Kod referansi: `7db438f`

## Genel Durum

Bu not, RPC guvenlik katmani eklendikten sonraki stabil surumu sabitlemek icin olusturuldu. Bir sorun cikarsa bu dosya, yedek arsivleri ve git etiketi birlikte referans alinacak.

## Calisan Ana Ozellikler

- Giris ekrani ve oturum yonetimi calisiyor
- V3 basliklari ve canli arayuz aktif
- Satis fisleri olusturma, duzenleme, silme ve fis detayi goruntuleme calisiyor
- Fis gorseli yukleme ve ayni sayfada onizleme calisiyor
- Tahsilat ve kasaya devir akislari aktif
- Satis tablosu ve ust ozet kartlari guncel yerlesimde calisiyor
- Sut girisi ekleme, listeleme ve toplamlar aktif
- Gider ekleme, listeleme ve filtreleme aktif
- Uretim ekraninda yogurt ve sut kaymagi ayri tablolarla calisiyor
- Uretim giris modalleri aciliyor ve kayit aliyor
- Uretim ust toplam kutulari tiklaninca kucuk popup ile detay aciliyor
- Uretim not alanina tiklaninca gereksiz detay acilmiyor
- Ozet ekraninda musteri ve personel borc toplamlari gorunuyor
- Donem secimi ve donem kapatma akisi aktif
- Eski borclar yeni doneme arka planda devrediliyor
- Ayarlar ekraninda yetki yonetimi aktif
- Excel ve JSON yedek alma aktif

## Veri Guvenligi Icin Son Eklemeler

- `satis_fisleri.fis_no` icin benzersizlik korumasi eklendi
- Cakisan eski `fis_no` kayitlari ayristirildi
- Satis kaydetme icin `app_save_satis_fisi` RPC hazirlandi ve uygulama once bunu kullanir
- Satis silme icin `app_delete_satis_fisi` RPC hazirlandi ve uygulama once bunu kullanir
- Donem kapatma icin `app_close_period` RPC hazirlandi ve uygulama once bunu kullanir
- RPC bulunamazsa uygulama kontrollu fallback akista calismaya devam eder
- Cop kutusu kaydi basarisizsa silme akisi iptal edilir

## Bilinen Teknik Notlar

- Uygulama tek parca bundle oldugu icin build sirasinda `chunk size` uyarisi veriyor
- Bu uyari su an calismayi bozmuyor
- `satis_fisleri` ile `satis_giris` arasinda hala gercek veritabani foreign key yok; ilerde eklenebilir

## Geri Donus Referanslari

- Tam yedek: `backups/sultankoy-v3-tam-yedek-20260307-123315.zip`
- Kaynak yedegi: `backups/sultankoy-v3-kaynak-yedek-20260307-123315.zip`
- Git etiketi: `backup-rpc-stabil-20260307-123315`
