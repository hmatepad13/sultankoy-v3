import type { Gider, SutGiris } from "../types/app";

export const giderTurunuNormalizeEt = (tur?: string | null) =>
  String(tur || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c");

export const sutOdemesiMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("sut odemesi");
export const kremaOdemesiMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("krema odemesi");
export const kovaOdemesiMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("kova odemesi");
export const katkiOdemesiMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("katki odemesi");
export const sutTozuOdemesiMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("sut tozu odemesi");
export const kremaBorcuMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("krema borcu");
export const kovaBorcuMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("kova borcu");
export const katkiBorcuMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("katki borcu");
export const sutTozuBorcuMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("sut tozu borcu");

export const odemeGideriMi = (tur?: string | null) =>
  sutOdemesiMi(tur) || kremaOdemesiMi(tur) || kovaOdemesiMi(tur) || katkiOdemesiMi(tur) || sutTozuOdemesiMi(tur);

export const hammaddeBorcuGideriMi = (tur?: string | null) =>
  kremaBorcuMi(tur) || kovaBorcuMi(tur) || katkiBorcuMi(tur) || sutTozuBorcuMi(tur);

export const normalGiderMi = (tur?: string | null) => !odemeGideriMi(tur) && !hammaddeBorcuGideriMi(tur);

export const sutcuBorcunuHesapla = (sutKayitlari: SutGiris[], giderKayitlari: Gider[], sonDonem?: string) => {
  const toplamSutTutari = sutKayitlari.reduce((toplam, item) => {
    const donem = String(item.tarih || "").substring(0, 7);
    if (sonDonem && donem > sonDonem) return toplam;
    return toplam + Number(item.toplam_tl || 0);
  }, 0);

  const toplamSutOdemesi = giderKayitlari.reduce((toplam, item) => {
    const donem = String(item.tarih || "").substring(0, 7);
    if (sonDonem && donem > sonDonem) return toplam;
    if (!sutOdemesiMi(item.tur)) return toplam;
    return toplam + Number(item.tutar || 0);
  }, 0);

  return toplamSutTutari - toplamSutOdemesi;
};

export const hammaddeBorclariniHesapla = (giderKayitlari: Gider[], sonDonem?: string) => {
  const toplamBorclar = giderKayitlari.reduce(
    (acc, item) => {
      const donem = String(item.tarih || "").substring(0, 7);
      if (sonDonem && donem > sonDonem) return acc;

      const tutar = Number(item.tutar || 0);
      if (kremaBorcuMi(item.tur)) acc.krema += tutar;
      if (sutTozuBorcuMi(item.tur)) acc.sutTozu += tutar;
      if (katkiBorcuMi(item.tur)) acc.katki += tutar;
      if (kovaBorcuMi(item.tur)) acc.kova += tutar;

      return acc;
    },
    { krema: 0, sutTozu: 0, katki: 0, kova: 0 },
  );

  const odemeler = giderKayitlari.reduce(
    (acc, item) => {
      const donem = String(item.tarih || "").substring(0, 7);
      if (sonDonem && donem > sonDonem) return acc;

      const tutar = Number(item.tutar || 0);
      if (kremaOdemesiMi(item.tur)) acc.krema += tutar;
      if (sutTozuOdemesiMi(item.tur)) acc.sutTozu += tutar;
      if (katkiOdemesiMi(item.tur)) acc.katki += tutar;
      if (kovaOdemesiMi(item.tur)) acc.kova += tutar;
      return acc;
    },
    { krema: 0, sutTozu: 0, katki: 0, kova: 0 },
  );

  return {
    krema: toplamBorclar.krema - odemeler.krema,
    sutTozu: toplamBorclar.sutTozu - odemeler.sutTozu,
    katki: toplamBorclar.katki - odemeler.katki,
    kova: toplamBorclar.kova - odemeler.kova,
    odemeler,
  };
};
