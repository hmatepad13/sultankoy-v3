# Calisma Protokolu

Bu proje icin varsayilan calisma mantigi hiz degil; veri guvenligi, uygulama stabilitesi ve geri donus kolayligidir.

## Oncelik Sirasi

1. Veri guvenligi
2. Uygulama stabilitesi
3. Izlenebilirlik ve rollback kolayligi
4. Hiz

## Temel Kurallar

- Kritik alanlarda "once canliya atalım" yaklasimi kullanilmaz.
- Kucuk, izole ve tek amacli degisiklik tercih edilir.
- Riskli degisikliklerde rollback plani olmadan ilerlenmez.
- Migrations, auth, satis, tahsilat, kullanici yonetimi ve donem kapatma akislari kritik kabul edilir.
- Commit edilmeden ve neyin degistigi netlesmeden production deploy yapilmaz.

## Risk Seviyeleri

### Dusuk Risk

- Sadece UI duzeni, metin veya stil degisikligi
- Veri modeline, auth'a veya kritik is akisina dokunmayan degisiklik

Beklenen akış:

- Kod degisikligi
- Build kontrolu
- Commit
- Push
- Deploy

### Orta Risk

- Davranis degisikligi ama veri yapisini bozmayan isler
- Sekme acilis akisi, listeleme mantigi, filtreleme, performans iyilestirmeleri

Beklenen akis:

- Etki alani netlestirilir
- Mümkünse once lokal dogrulama yapilir
- Build kontrolu yapilir
- Commit ve push sonrasi deploy yapilir

### Yuksek Risk

- Database migration
- Toplu veri guncelleme/silme
- Auth/session/yetki degisiklikleri
- Satis/tahsilat/veri kaydetme mantigi
- Edge Function degisiklikleri

Beklenen akis:

- Gerekirse backup al
- Etki ve rollback plani netlestir
- Degisikligi dar kapsamli tut
- Build/test yap
- Commit ve push yap
- Sonra deploy et
- Sonrasinda smoke test yap

## Backup Kurali

Su durumlarda backup ciddi olarak degerlendirilir veya zorunlu kabul edilir:

- Migration calistirmadan once
- Toplu silme/guncelleme isleminden once
- Satis/tahsilat mantigina dokunmadan once
- Auth veya kullanici yonetimi degisikliginden once
- Donem kapatma gibi geri donusu zor islemlerden once

Referans belgeler:

- `BACKUP-VE-GERI-DONUS.md`
- `STABIL-SURUM-NOTLARI.md`

## Deploy Kurali

Varsayilan sira:

1. Degisikligi yap
2. Build/test dogrulamasi yap
3. Commit at
4. GitHub'a pushla
5. Production deploy yap
6. Temel smoke test yap

Istisna:

- Gercek acil durumda deploy once yapilabilir
- Ama ayni oturumda commit/push ile GitHub tekrar hizalanmalidir

## Debug ve Tani Kurali

- Once en alt sebebi gormeye calis
- Uygulama mesaji ile tarayici/network seviyesindeki hata ayri seyler olabilir
- Mümkünse hem tarayici tarafini hem kalici log kaynagini birlikte kullan
- Tek bir belirtiye bakip buyuk rollback yapma; etki alanini izole et

## Rollback Kurali

- Mümkünse tum repoyu degil, sorunlu degisikligi hedefli rollback yap
- DB migration geri donusu gerektiriyorsa kod rollbacki tek basina yeterli sayilmaz
- Rollback sonrasi yeniden build ve temel akış testi zorunludur

## Not

Bu dosya, yeni oturumlarda veya yeni sayfalarda da ayni calisma tarzini korumak icin repo ici referans olarak tutulur.
