# Yedek ve Geri Donus

## Guncel Stabil Surum

Bu proje icin su anki calisan stabil durum su sekilde yedeklendi:

- Kaynak arsivi: `backups/sultankoy-v3-kaynak-yedek-20260307-123315.zip`
- Tam klasor arsivi: `backups/sultankoy-v3-tam-yedek-20260307-123315.zip`
- Git etiketi: `backup-rpc-stabil-20260307-123315`
- Canli adres: `https://sultankoy-v3.vercel.app/`

## Onceki Yedekler

- Kaynak arsivi: `backups/sultankoy-v3-kaynak-yedek-20260307-070604.zip`
- Tam klasor arsivi: `backups/sultankoy-v3-tam-yedek-20260307-070604.zip`
- Git etiketi: `backup-stabil-20260307-070604`
- Kaynak arsivi: `backups/sultankoy-v3-canli-yedek-20260307-015254.zip`
- Tam klasor arsivi: `backups/sultankoy-v3-tam-canli-yedek-20260307-015450.zip`
- Git etiketi: `backup-canli-20260307-015215`

Notlar:

- Kaynak arsivi `.env` dosyasini da icerir; `node_modules` ve `dist` disarida birakilmistir. Bu nedenle geri donuste gerekirse `npm install` gerekir.
- Tam klasor arsivi `.env`, `node_modules` ve `dist` dahil mevcut calisan klasoru tasir. En hizli geri donus secenegi budur.
- Git etiketi sadece repodaki izlenen dosyalari kapsar. `.env` artik git tarafinda tutulmadigi icin etiketle geri donuste ortam degiskenlerini yeniden koymak gerekir.

## Hizli Yerel Geri Donus

1. Projeyi kapat.
2. Mevcut klasoru istersen yeniden adlandir: `sultankoy-v3-bozuk`
3. Mumkunse once `backups/sultankoy-v3-tam-yedek-20260307-123315.zip` arsivini ayni konuma cikar.
4. Tam arsiv yerine kaynak arsiv kullanirsan `backups/sultankoy-v3-kaynak-yedek-20260307-123315.zip` dosyasini ac ve sonrasinda `npm install` calistir.
5. `npm run build` ve `npm run dev` ile kontrol et.

## Git Etiketi ile Geri Donus

Calisan kodu yeni bir dalda acmak icin:

```powershell
git fetch --tags
git switch -c geri-donus-backup backup-rpc-stabil-20260307-123315
```

Mevcut dali dogrudan bu noktaya cekmek icin:

```powershell
git fetch --tags
git reset --hard backup-rpc-stabil-20260307-123315
```

## Bu Stabil Surumde Not Edilen Durum

- Vercel production yesil durumda
- Supabase baglantisi calisiyor
- Fis gorseli yukleme aktif
- RPC tabanli satis kaydet, sil ve donem kapatma katmani hazir ve aktif
- `fis_no` benzersizlik korumasi aktif
- Yetki ekrani, yedekleme ve donem secimi calisiyor
- Uretim ekraninda yogurt ve sut kaymagi ayrik tablolarla calisiyor
- Uretim ust toplam kutulari tiklaninca kucuk popup aciliyor
- Uretim not hucreleri pasif, detay sadece `3 nokta > goruntule` ile aciliyor

## Son Kontrol

Yedek alindiktan sonra dogrulanan komutlar:

```powershell
npm run lint
npm run build
```
