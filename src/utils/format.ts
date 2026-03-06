import type { SekmeYetkiMap } from "../types/app";
import { VARSAYILAN_SEKME_YETKILERI } from "../constants/app";

export const fSayi = (numara: number | string | undefined | null) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 })
    .format(Number(numara) || 0)
    .replace(/,00$/, "");

export const fSayiNoDec = (numara: number | string | undefined | null) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Number(numara) || 0);

export const normalizeUsername = (deger?: string | null) =>
  (deger || "")
    .trim()
    .toLowerCase()
    .replace("@sistem.local", "");

export const tamamlaSekmeYetkisi = (tabs?: Partial<SekmeYetkiMap> | null): SekmeYetkiMap => ({
  ...VARSAYILAN_SEKME_YETKILERI,
  ...tabs,
});

export const dosyaIndir = (icerik: BlobPart, dosyaAdi: string, mimeType: string) => {
  const blob = new Blob([icerik], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = dosyaAdi;
  link.click();
  URL.revokeObjectURL(url);
};
