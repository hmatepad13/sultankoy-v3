# Umit net/kasa mutabakati

Kullanici talebi: gecmisten gelen net bakiyeden 6.305.000 TL dusulmesi.
Etki tarihi: 2026-10-01 personel acilis devri.

Devir: 7.133.547 TL -> 828.547 TL. Ekim hareketleri buna eklenir.
Satis, tahsilat, gider, kasaya devir ve musteri acik hesaplari degismez.

`personel_net_mutabakatlari` tablosunda fark, gerekce ve eski fisin tam
snapshot'i tutulur. Tablo istemci rollerine kapali tutulur.
Insert trigger'i yalniz ilgili tarih ve personelin personel devrine farki
uygular. Eylul kapanisi yeniden hesaplansa da duzeltme korunur; sonraki
aylar zaten duzeltilmis devri tasir. Ayni migration ikinci kez fark dusmez.

Geri donus: yeni ay devirleri olusmadan once transaction icinde trigger'i
kaldir, mutabakat satirini sil ve mevcut Ekim Umit personel devir tutarina
6.305.000 ekle. Sonraki ay devirleri olustuysa ilgili kapanislari sirayla
yeniden hesapla. Eski snapshot denetim/yedek icin once saklanmalidir.

Dogrulama: migration rollback edilen transaction'da denendi; Eylul
kapanisi yeniden uretildiginde Ekim Umit devri 828.547 TL kaldi.
