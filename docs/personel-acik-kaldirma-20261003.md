# Personel acik hesabi kaldirma

PersonelOzeti, personel bakiye helper'i, raporlar ve istemci devir fallback'i
artik acik bakiye hesaplamaz. Personel devrinde yalniz Net kullanilir;
yeni personel fisinin kalan_bakiye alani 0 olur.

Migration mevcut kapanis fonksiyonunun yalniz personel insert/filter kismini
degistirir. Musteri cari devir sorgusu degismez. Net formulu degismez.
Eski fislerdeki tutarlar silinmez/guncellenmez.

SQL helper'in open_balance cikisi eski imza uyumlulugu icin sabit 0 kalir;
personel acik hesabi hesaplayan sorgu kaldirilmistir. Ekim oncesi tarihsel
kapanis fonksiyonu mutabakat ve eski bakiyeleri korumak icin korunur.

Yedek: finansal_mantik_yedekleri tablosunda retire-personnel-open-20261003.
Onceki fonksiyon tanimlari, yetkiler ve mevcut personel devir fisleri saklanir.
Rollback: bu yedekteki app_personel_net_after_expenses ve app_close_period_core
tanimlarini transaction icinde geri yukle, ardindan kod commitini revert et.
Yeni donem kapanisi yapilmissa devirleri eski fonksiyonla yeniden dogrula.

Testler: canli 8 donemin personel Net karsilastirmasi; migration iki kez;
musteri bakiyeleri ve kayit fingerprintleri; Ekim-Kasim-Aralik Net devri;
yeni personel devirlerinin kalan_bakiye=0 olmasi; gider degisikligi yayilimi.
Test kayitlari tamamen rollback edilir.
