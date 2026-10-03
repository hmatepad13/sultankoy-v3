# Tek Net baslangici

2026-10-03 gun basindaki Umit Net'i, onceki dogrulanmis hesaptan alinip
net_baslangici tablosunda sabitlenir. Bugunku ve sonraki hareketler yeniden
hesaplanir: baslangic + tahsilat - gider. Sonraki personel Net devirleri
son bakiyeyi acilis olarak kullanir; ayni gider iki kere dusulmez.

Eski Net devirleri, kasa kayitlari, satislar, tahsilatlar, sut alislari,
giderler ve musteri borclari silinmez veya guncellenmez. Eski Net ay sonlari
arsivde saklanir. Eski tarihlere ait duzeltmeler cari hesabi guncelleyebilir,
ancak sabitlenmis Net baslangicini yeniden yazmaz. Eski personel/kasa hareketleri
yeni Net hesaplamasina katilmaz. Yeni sistem hareketleri istemciden reddedilir.

Musteri cari fonksiyonu ve kapanistaki musteri devir SQL'i degistirilmedi.
Eski personel kapanis fonksiyonu ve istemci kapanis fallback'i kaldirildi.
Ozet artik yalniz Umit'i gosterir. Kullanilmayan yerel Excel/HTML yedek
rapor dosyasi kaldirildi; GitHub/Supabase bulut yedegi etkilenmedi.

Yedek: finansal_mantik_yedekleri / single-net-20261003. Kayitlar ve eski
fonksiyon tanimlari korunur. Geri donus: once trigger ve app_net_balance'i
kaldir, yeni Net helper'ini drop et, yedekteki fonksiyonlari ve ACL'leri
transaction icinde geri yukle, kod commitini revert et. Sonradan kapanis
yapilmissa devirleri geri yuklenen hesapla ayrica dogrula.

Test: python scripts/test-single-net-db.py (tam rollback), --apply (yalniz
migration commit), --installed (kurulu davranis tam rollback). Fingerprint,
tum aylarda cari bakiyeler, guncel Net, iki aylik devir, gider duzeltmeleri,
gecmis kapanis ve eski istemci yasagi kontrol edilir.
