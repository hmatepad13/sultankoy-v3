# Eski personel hesaplarinin kapanisi

2026-10-01 itibariyla admin, yusuf, akif ve deneme finansal personel
takibinden cikartilir. Kullanici girisi ve roller degismez. Satis, tahsilat,
gider, musteri borcu ve Umit bakiyesi degistirilmez; eski bakiyeler silinmez
ve Umit'e aktarilmaz. Bu islem muhasebe bakiyelerini fiziksel olarak sifirlayan
bir gider/tahsilat kaydi degil, ileriye donuk hesap arsivlemesidir.

Frontend ozeti ve aylik raporlar Ekim ve sonrasinda kapali hesaplari dislar.
Ham yedekler ve gecmis kayitlar korunur. Donem kapatma fonksiyonu kapali
personel icin yeni devir uretmez. SQL kontrol kaydi eski devirleri ve onceki
kapanis fonksiyonunu saklar; migration tekrar uygulanabilir.

## Dogrulama

Migration transaction icinde denenip rollback edildi. Ekim kapanisinda
Umit'in sonraki devir tutarlari degisiklik oncesi ve sonrasi ayni bulundu.
Build basarili; ilgili dosyalarda ESLint hata vermedi.

## Geri donus

Once migration'in sakladigi onceki fonksiyon tanimini yetkili DB baglantisiyla
geri yukle, sonra yalniz bu degisikligin frontend kodunu geri al. Finansal
fislerde geri alinacak bir guncelleme yoktur. Kapanis kayitlarini denetim izi
olarak tutmak mumkundur; tabloyu silmek gerekmez.

```sql
do $$
declare definition text;
begin
  select onceki_kapanis_fonksiyonu into strict definition
  from public.personel_hesap_kapanislari where personel = 'admin';
  execute definition;
end;
$$;
```

## Ayri bulgu

Canli donem kapatma fonksiyonunun personel net hesabi giderleri dusurmuyor.
Bu kapanis degisikligi mevcut hesaplama mantigini aynen korur; gider/devir
uyusmazligi icin ayri duzeltme ve mutabakat gerekir.
