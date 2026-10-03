# Gider dusulmus netin devri

## Kapsam

Ekim 2026 ve sonrasi personel neti = son personel acilisi + tahsilat - gider -
kasaya devir. Sonraki ay bu net ile baslar; gecmis gider tekrar dusulmez.
Ekim acilisi 828547 ve -6305000 mutabakat kaydi korunur. Ekim oncesi kapanislar
ayri, onceki hesaplama fonksiyonuna yonlendirilir; eski kayitlar topluca yenilenmez.
Cari borc devri aynen korunur. Kapali personel icin devir uretilmez.

Gider ekleme/duzenleme/silme/geri yukleme tetikleyicisi Ekim'den itibaren mevcut
sonraki devirleri yeniler. Henuz sonraki ay yoksa ileriye donuk bir ay yaratmaz.
Gider degisikligi ve geri yukleme sonrasi ekrandaki fis/devir, ozet ve onceki
gider verileri de birlikte yenilenir; eski devir browser onbelleginde kalmaz.
Mutabakat oncesi gider degisikligi eski giderleri tekrar Ekim acilisina katmaz.
Gider turleri yeniden siniflandirilmadi: mevcut ekrandaki gibi tum giderler dusulur.
Borcu odemeden ayirma, nakit/banka ayrimi ve diger rapor bulgulari bu kapsamda degil.

Para girdisi hem TR gorunumunu hem kanonik nokta ondaligini destekler; ikinci
temizlemede kuruslar kaybolmaz. Gider guncelleme ilk ekleyeni korur. Kaydet butonu
ve ref kilidi ayni formun eszamanli ikinci gonderimini engeller.
Ic kapanis/yenileme fonksiyonlari API rollerine kapatilir; yetkili
app_close_period wrapper'i ve otomatik DB trigger'lari calismaya devam eder.

## Yedek ve geri donus

Migration finansal_mantik_yedekleri tablosuna eski fonksiyonlari/yetkileri ve
satis_fisleri, satis_giris, giderler, mutabakat ve personel kapanis snapshot'larini
saklar. Bu tablo API kullanicilarina acik degildir. Migration finansal fisleri
degistirmez ve idempotenttir. SQL degisikligi transaction icinde uygulanmalidir.

Rollback: once gider yenileme trigger'ini kaldir ve yedekteki kapanis tanimini
geri yukle. Bu migration sonrasinda olusmus devirleri geriye donuk otomatik
silme/degistirme; varsa ayrica mutabakat yap. Yeni para fonksiyonunun guvenli
formatini geri almak zorunlu degildir. API ic fonksiyon yetkilerini tekrar acma.

```sql
begin;
drop trigger if exists trg_giderler_auto_recalculate_devirs on public.giderler;
do $$
declare definition text;
begin
  select fonksiyonlar->>'app_close_period_core' into strict definition
  from public.finansal_mantik_yedekleri where id='net-after-expenses-20261003';
  execute definition;
end;
$$;
commit;
```

## Testler

- node scripts/test-financial-net.mjs: para TR/kanonik giris, idempotent
  temizleme, kurus, gercek ekran helper'i ile gider/kasa ve ayni gun acilis.
- python scripts/test-net-carry-db.py: migration dry-run, tekrar uygulama,
  veri fingerprint, gercek yetkili wrapper, tekrar kapanis, iki ay ileri devir,
  gider duzenleme/ekleme/tarih degistirme/silme, Eylul kapanisi mutabakat korumasi,
  ic RPC yetki kontrolu. Tum degisiklikleri daima rollback eder.
- python scripts/test-net-carry-db.py --installed: canli uygulanmis SQL smoke testi,
  tum test hareketleri rollback edilir.
- npm run build ve ilgili dosyalarda ESLint.

React kontrolunde kaydetme ref kilidi, kullaniciya bekleme durumu ve finally ile
kilit temizligi dogrulandi. Yayinlama Git entegrasyonuyla, yalniz gorev dosyalari
commit edilerek yapilir; ilgisiz siparis degisiklikleri commit edilmez.
