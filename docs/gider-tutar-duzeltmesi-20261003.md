# Gider tutar girisi duzeltmesi

Gider formunda her tus vurusunda binlik ayirici eklenmesi kaldirildi.
56500 tus tus yazildiginda 56500 kalir; kurus girisi virgul ile korunur.
Regresyon testi gercek input value ifadesini kullanir.

Kullanicinin bildirdigi hatali kayit icin dar kapsamli duzeltme:

- Tablo: public.giderler
- ID: 730
- Tarih: 2026-10-03
- Tur: Sut odemesi Ileri sut ciftligi
- Ekleyen: umit@sistem.local
- Created at: 2026-10-03 12:51:08.084045+00:00
- Onceki tutar: 5.65
- Dogru tutar: 56500

Guncelleme yalnizca beklenen eski tutar ve tarih eslesirse yapilir.
Mevcut gider tetikleyicisi bagli gelecek devirleri yeniler.
Bu islem yeni gider olusturmaz, diger giderleri degistirmez.

Geri donus gerekirse yalnizca ID 730 icin tutar 56500 oldugu dogrulanip
5.65 degerine geri alinir; mevcut gider tetikleyicisi devirleri yeniler.
Kod geri donusu bu degisiklik commitinin hedefli revert edilmesidir.
