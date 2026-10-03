import { normalizeUsername } from "../utils/format";

// Hesap kapanisi erisim yetkisini veya tarihsel islemleri degistirmez.
export const PERSONEL_HESAP_KAPANISLARI = ["admin", "yusuf", "akif", "deneme"] as const;
export const PERSONEL_KAPANIS_DONEMI = "2026-10";

export const personelHesabiKapaliMi = (kullanici: string | null | undefined, donem: string) =>
  donem >= PERSONEL_KAPANIS_DONEMI &&
  PERSONEL_HESAP_KAPANISLARI.some((isim) => isim === normalizeUsername(kullanici));
