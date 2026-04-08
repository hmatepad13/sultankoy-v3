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

const kullaniciAnahtarlariniGetir = (deger?: string | null) => {
  const hamDeger = String(deger || "").trim().toLowerCase();
  if (!hamDeger) return [];

  const anahtarlar = new Set<string>();
  anahtarlar.add(hamDeger);

  const normalizeDeger = normalizeUsername(hamDeger);
  if (normalizeDeger) anahtarlar.add(normalizeDeger);

  const epostaKisa = hamDeger.split("@")[0]?.trim();
  if (epostaKisa) anahtarlar.add(epostaKisa);

  return [...anahtarlar];
};

export const kullanicilarAyniMi = (birinci?: string | null, ikinci?: string | null) => {
  const birinciAnahtarlar = new Set(kullaniciAnahtarlariniGetir(birinci));
  if (birinciAnahtarlar.size === 0) return false;

  return kullaniciAnahtarlariniGetir(ikinci).some((anahtar) => birinciAnahtarlar.has(anahtar));
};

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
