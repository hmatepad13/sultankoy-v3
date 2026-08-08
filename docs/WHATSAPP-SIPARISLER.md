# WhatsApp Siparişler Modülü

## Sınır

Bu modül WhatsApp mesajlarını sipariş taslağı olarak gösterir. Mevcut satış, tahsilat, borç ve stok kayıtlarını otomatik değiştirmez.

## Parçalar

- Arayüz: `src/features/siparisler/`
- Menü bağlantısı: `src/App.tsx`, `src/constants/app.ts`, `src/types/app.ts`
- Yetki varsayılanı: `src/lib/permissions.ts`
- Supabase şeması: `supabase/migrations/20260808220000_whatsapp_siparisler.sql`
- Geri alma: `sql/20260808_whatsapp_siparisler_rollback.sql`
- Oracle worker: kardeş `sultankoy_wp_siparis/worker/` projesi

Modül tembel yüklenir; kullanıcı Siparişler sekmesine girmeden ana uygulama paketine yüklenmez. Müşteri eşleştirme ve sipariş düzenleme ekranları ayrı modal bileşenleridir.

## Veri tabloları

- `whatsapp_islem_istekleri`: manuel tarama kuyruğu
- `whatsapp_musteri_eslesmeleri`: izin verilen bayi-sohbet eşleştirmeleri
- `whatsapp_siparis_taslaklari`: kullanıcı kontrolüne sunulan sonuçlar
- `whatsapp_worker_durumu`: Oracle heartbeat ve bağlantı durumu

Tüm tablolar RLS ile korunur. Arayüz erişimi yönetici hesabıyla sınırlıdır; Oracle worker servis rolüyle yalnız bu iş akışını yürütür.

## Kaldırma

Önce Oracle worker durdurulur, ardından arayüz bağlantıları ve `src/features/siparisler/` kaldırılır. Veriler de kaldırılacaksa en son rollback SQL'i çalıştırılır. Rollback mevcut finansal tablolara dokunmaz.
