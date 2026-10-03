# Kasaya devir ozelliginin emekliye ayrilmasi

Yeni kayit, duzenleme ve goruntuleme formu; state ve kaydetme fonksiyonlari;
satis butonu, filtre, Kasaya mini karti ve rapor sunum sutunlari kaldirildi.

Finansal veritabanina yazma/silme yapilmaz. Eski fisler korunur.
Eski kayitlari taniyan hesaplama ve satis/tahsilat dislama kurallari uyumluluk
icin korunur. Bunlari silmek eski netleri ve yeni donemlere aktarilan neti bozar.
Donem kapatma SQL fonksiyonlari degistirilmez.

Dogulama: test-financial-net.mjs ve test-retired-cash-transfer.mjs.
Ikinci test canli kayitlari read-only okuyup onceki surumdeki personel hesaplari
ile her donemin sonucunu karsilastirir; ozet ve satis net bloklarini da denetler.

Geri donus: yalnizca bu degisiklik commitini revert edip yeniden build/deploy.
Veritabani degismedigi icin veri geri yuklemesi gerekmez.
