# Yedek ve Geri Donus

Bu proje icin calisan durum yedegi iki sekilde alindi:

- Yerel arsiv: `backups/sultankoy-v3-canli-yedek-20260307-015254.zip`
- Git etiketi: `backup-canli-20260307-015215`

Notlar:

- Yerel zip arsivi `.env` dosyasini da icerir. Bu nedenle ayni makinede hizli geri donus icin en guvenli secenektir.
- Git etiketi sadece repodaki izlenen dosyalari kapsar. `.env` artik git tarafinda tutulmadigi icin etiketle geri donuste ortam degiskenlerini yeniden koymak gerekir.

## Hizli Yerel Geri Donus

1. Projeyi kapat.
2. Mevcut klasoru istersen yeniden adlandir: `sultankoy-v3-bozuk`
3. `backups/sultankoy-v3-canli-yedek-20260307-015254.zip` arsivini ayni konuma cikar.
4. Gerekirse terminalde `npm install` calistir.
5. `npm run build` ve `npm run dev` ile kontrol et.

## Git Etiketi ile Geri Donus

Calisan kodu yeni bir dalda acmak icin:

```powershell
git fetch --tags
git switch -c geri-donus-backup backup-canli-20260307-015215
```

Mevcut dali dogrudan bu noktaya cekmek icin:

```powershell
git fetch --tags
git reset --hard backup-canli-20260307-015215
```

## Bu Yedekten Sonra Yapilan Bakimlar

- `.env` git takibinden cikarildi
- `.env.example` eklendi
- Yedeklerin repoya karismamasi icin `backups/` ignore edildi
- Kullanimda olmayan kok dosyalar temizlendi

## Son Kontrol

Yedek alindiktan sonra dogrulanan komutlar:

```powershell
npm run lint
npm run build
```
