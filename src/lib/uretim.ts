import type { Uretim } from "../types/app";

const URETIM_META_ETIKETI = "[URETIM_META]";

export const sayiDegeri = (deger: unknown) => {
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (typeof deger === "string" && deger.trim() && !Number.isNaN(Number(deger))) return Number(deger);
  return 0;
};

export const sayiVeyaBos = (deger: unknown) => {
  if (deger === null || deger === undefined || deger === "") return "";
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (typeof deger === "string") return deger;
  return "";
};

export const adettenKg = (adet: unknown, birimKg: number) => sayiDegeri(adet) * birimKg;
export const kgSatirTutari = (kg: unknown, fiyat: unknown) => sayiDegeri(kg) * sayiDegeri(fiyat);
export const miktarSatirTutari = (kg: unknown, adet: unknown, fiyat: unknown) => {
  const kgDegeri = sayiDegeri(kg);
  const adetDegeri = sayiDegeri(adet);
  const miktar = kgDegeri > 0 ? kgDegeri : adetDegeri;
  return miktar * sayiDegeri(fiyat);
};

const uretimMetaAlanlari = [
  "uretim_tipi",
  "su_fiyat",
  "krema",
  "krema_fiyat",
  "diger_adet",
  "diger_kg",
  "diger_fiyat",
  "paket_02_adet",
  "paket_02_fiyat",
  "paket_2_adet",
  "paket_2_fiyat",
  "paket_3_adet",
  "paket_3_fiyat",
  "cikti_02kg",
  "cikti_02kg_kg",
  "satis_02_fiyat",
  "cikti_2kg",
  "cikti_2kg_kg",
  "satis_2_fiyat",
  "cikti_3kg_kg",
  "cikti_5kg_kg",
  "cikan_toplam_kg",
] as const;

const uretimAciklamasiniAyir = (hamAciklama?: string | null) => {
  const kaynak = hamAciklama || "";
  const index = kaynak.indexOf(URETIM_META_ETIKETI);

  if (index < 0) {
    return { not: kaynak, meta: {} as Partial<Uretim> };
  }

  const not = kaynak.slice(0, index).trim();
  const metaHam = kaynak.slice(index + URETIM_META_ETIKETI.length).trim();

  try {
    const meta = JSON.parse(metaHam) as Partial<Uretim>;
    return { not, meta };
  } catch {
    return { not: kaynak, meta: {} as Partial<Uretim> };
  }
};

const uretimMetaOlustur = (kayit: Partial<Uretim>) => {
  const meta = Object.fromEntries(
    uretimMetaAlanlari
      .filter((alan) => kayit[alan] !== undefined && kayit[alan] !== null && kayit[alan] !== "")
      .map((alan) => [alan, kayit[alan]]),
  );

  return Object.keys(meta).length ? `${URETIM_META_ETIKETI}${JSON.stringify(meta)}` : "";
};

export const uretimAciklamasiniBirlestir = (not: string, kayit: Partial<Uretim>) => {
  const meta = uretimMetaOlustur(kayit);
  const temizNot = (not || "").trim();
  if (!meta) return temizNot;
  return temizNot ? `${temizNot}\n${meta}` : meta;
};

export const uretimKaydiniNormalizeEt = (kayit: Partial<Uretim>) => {
  const { not, meta } = uretimAciklamasiniAyir(kayit.aciklama);
  return {
    ...kayit,
    ...meta,
    uretim_tipi: (meta.uretim_tipi || kayit.uretim_tipi || "yogurt") as Uretim["uretim_tipi"],
    su_fiyat: sayiVeyaBos(meta.su_fiyat),
    krema: sayiVeyaBos(meta.krema),
    krema_fiyat: sayiVeyaBos(meta.krema_fiyat),
    diger_adet: sayiVeyaBos(meta.diger_adet),
    diger_kg: sayiVeyaBos(meta.diger_kg),
    diger_fiyat: sayiVeyaBos(meta.diger_fiyat),
    paket_02_adet: sayiVeyaBos(meta.paket_02_adet),
    paket_02_fiyat: sayiVeyaBos(meta.paket_02_fiyat),
    paket_2_adet: sayiVeyaBos(meta.paket_2_adet),
    paket_2_fiyat: sayiVeyaBos(meta.paket_2_fiyat),
    paket_3_adet: sayiVeyaBos(meta.paket_3_adet),
    paket_3_fiyat: sayiVeyaBos(meta.paket_3_fiyat),
    cikti_02kg: sayiVeyaBos(meta.cikti_02kg),
    cikti_02kg_kg: sayiVeyaBos(meta.cikti_02kg_kg),
    satis_02_fiyat: sayiVeyaBos(meta.satis_02_fiyat),
    cikti_2kg: sayiVeyaBos(meta.cikti_2kg),
    cikti_2kg_kg: sayiVeyaBos(meta.cikti_2kg_kg),
    satis_2_fiyat: sayiVeyaBos(meta.satis_2_fiyat),
    cikti_3kg_kg: sayiVeyaBos(meta.cikti_3kg_kg),
    cikti_5kg_kg: sayiVeyaBos(meta.cikti_5kg_kg),
    cikan_toplam_kg: sayiDegeri(meta.cikan_toplam_kg) || sayiDegeri(kayit.cikan_toplam_kg),
    aciklama: not,
  } as Uretim;
};

export const uretimGirenToplamKg = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  const ortakToplam =
    sayiDegeri(kayit.cig_sut) +
    sayiDegeri(kayit.tereyag) +
    sayiDegeri(kayit.katki_kg) +
    sayiDegeri(kayit.su);

  if (tip === "sut_kaymagi") {
    return ortakToplam + sayiDegeri(kayit.krema) + sayiDegeri(kayit.diger_kg);
  }

  return ortakToplam + sayiDegeri(kayit.sut_tozu);
};

export const uretimCikanToplamKg = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  if (tip === "sut_kaymagi") {
    return (
      (sayiDegeri(kayit.cikti_02kg_kg) || adettenKg(kayit.cikti_02kg, 0.2)) +
      (sayiDegeri(kayit.cikti_2kg_kg) || adettenKg(kayit.cikti_2kg, 2)) +
      (sayiDegeri(kayit.cikti_3kg_kg) || adettenKg(kayit.cikti_3kg, 3))
    );
  }
  return (
    (sayiDegeri(kayit.cikti_3kg_kg) || adettenKg(kayit.cikti_3kg, 3)) +
    (sayiDegeri(kayit.cikti_5kg_kg) || adettenKg(kayit.cikti_5kg, 5))
  );
};

export const uretimMaliyetToplami = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  const ortakMaliyet =
    kgSatirTutari(kayit.cig_sut, kayit.sut_fiyat) +
    kgSatirTutari(kayit.tereyag, kayit.tereyag_fiyat) +
    kgSatirTutari(kayit.katki_kg, kayit.katki_fiyat) +
    kgSatirTutari(kayit.su, kayit.su_fiyat);

  if (tip === "sut_kaymagi") {
    return (
      ortakMaliyet +
      kgSatirTutari(kayit.krema, kayit.krema_fiyat) +
      miktarSatirTutari(kayit.diger_kg, kayit.diger_adet, kayit.diger_fiyat) +
      sayiDegeri(kayit.paket_02_adet) * sayiDegeri(kayit.paket_02_fiyat) +
      sayiDegeri(kayit.paket_2_adet) * sayiDegeri(kayit.paket_2_fiyat) +
      sayiDegeri(kayit.paket_3_adet) * sayiDegeri(kayit.paket_3_fiyat)
    );
  }

  return (
    ortakMaliyet +
    kgSatirTutari(kayit.sut_tozu, kayit.sut_tozu_fiyat) +
    sayiDegeri(kayit.kova_3_adet) * sayiDegeri(kayit.kova_3_fiyat) +
    sayiDegeri(kayit.kova_5_adet) * sayiDegeri(kayit.kova_5_fiyat)
  );
};

export const uretimSatisToplami = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  if (tip === "sut_kaymagi") {
    return (
      sayiDegeri(kayit.cikti_02kg) * sayiDegeri(kayit.satis_02_fiyat) +
      sayiDegeri(kayit.cikti_2kg) * sayiDegeri(kayit.satis_2_fiyat) +
      sayiDegeri(kayit.cikti_3kg) * sayiDegeri(kayit.satis_3_fiyat)
    );
  }
  return (
    sayiDegeri(kayit.cikti_3kg) * sayiDegeri(kayit.satis_3_fiyat) +
    sayiDegeri(kayit.cikti_5kg) * sayiDegeri(kayit.satis_5_fiyat)
  );
};

export const uretimCikanToplamAdet = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  if (tip === "sut_kaymagi") {
    return sayiDegeri(kayit.cikti_02kg) + sayiDegeri(kayit.cikti_2kg) + sayiDegeri(kayit.cikti_3kg);
  }
  return sayiDegeri(kayit.cikti_3kg) + sayiDegeri(kayit.cikti_5kg);
};

export const uretimNotunuKisalt = (not?: string | null, limit = 10) => {
  const temiz = String(not || "").trim();
  if (!temiz) return "-";
  return temiz.length > limit ? `${temiz.slice(0, limit)}...` : temiz;
};

export type UretimTipi = NonNullable<Uretim["uretim_tipi"]>;
export type UretimFormFiyatlari = Record<string, number | string>;

export const bosUretimFormu = (
  tarih: string,
  tip: UretimTipi,
  fiyatlar?: UretimFormFiyatlari,
): Uretim => ({
  tarih,
  uretim_tipi: tip,
  cig_sut: "",
  sut_fiyat: fiyatlar?.sut || "",
  sut_tozu: "",
  sut_tozu_fiyat: fiyatlar?.toz || "",
  tereyag: "",
  tereyag_fiyat: fiyatlar?.yag || "",
  katki_kg: "",
  katki_fiyat: fiyatlar?.katki || "",
  su: "",
  su_fiyat: fiyatlar?.su || "",
  krema: "",
  krema_fiyat: fiyatlar?.krema || "",
  diger_adet: "",
  diger_kg: "",
  diger_fiyat: fiyatlar?.diger || "",
  paket_02_adet: "",
  paket_02_fiyat: fiyatlar?.paket02 || "",
  paket_2_adet: "",
  paket_2_fiyat: fiyatlar?.paket2 || "",
  paket_3_adet: "",
  paket_3_fiyat: fiyatlar?.paket3 || "",
  kova_3_adet: "",
  kova_3_fiyat: fiyatlar?.kova3 || "",
  kova_5_adet: "",
  kova_5_fiyat: fiyatlar?.kova5 || "",
  cikti_02kg: "",
  cikti_02kg_kg: "",
  satis_02_fiyat: fiyatlar?.satis02 || "",
  cikti_2kg: "",
  cikti_2kg_kg: "",
  satis_2_fiyat: fiyatlar?.satis2 || "",
  cikti_3kg: "",
  cikti_3kg_kg: "",
  satis_3_fiyat: fiyatlar?.satis3 || "",
  cikti_5kg: "",
  cikti_5kg_kg: "",
  satis_5_fiyat: fiyatlar?.satis5 || "",
  toplam_kg: 0,
  cikan_toplam_kg: 0,
  toplam_maliyet: 0,
  kar: 0,
  aciklama: "",
});

export const sonUretimFiyatlariniBul = (uretimList: Uretim[]) => {
  const sirali = [...uretimList].sort((a, b) => {
    const tarihFarki = new Date(b.tarih).getTime() - new Date(a.tarih).getTime();
    if (tarihFarki !== 0) return tarihFarki;
    return sayiDegeri(b.id) - sayiDegeri(a.id);
  });
  const yogurtKayitlari = sirali.filter((item) => (item.uretim_tipi || "yogurt") === "yogurt");
  const kaymakKayitlari = sirali.filter((item) => item.uretim_tipi === "sut_kaymagi");
  const sonDoluFiyat = (liste: Uretim[], alan: keyof Uretim) =>
    liste.find((item) => sayiDegeri(item[alan]) > 0)?.[alan] || "";

  return {
    yogurt: {
      sut: sonDoluFiyat(yogurtKayitlari, "sut_fiyat"),
      toz: sonDoluFiyat(yogurtKayitlari, "sut_tozu_fiyat"),
      yag: sonDoluFiyat(yogurtKayitlari, "tereyag_fiyat"),
      katki: sonDoluFiyat(yogurtKayitlari, "katki_fiyat"),
      su: sonDoluFiyat(yogurtKayitlari, "su_fiyat"),
      kova3: sonDoluFiyat(yogurtKayitlari, "kova_3_fiyat"),
      kova5: sonDoluFiyat(yogurtKayitlari, "kova_5_fiyat"),
      satis3: sonDoluFiyat(yogurtKayitlari, "satis_3_fiyat"),
      satis5: sonDoluFiyat(yogurtKayitlari, "satis_5_fiyat"),
    },
    sut_kaymagi: {
      sut: sonDoluFiyat(kaymakKayitlari, "sut_fiyat"),
      yag: sonDoluFiyat(kaymakKayitlari, "tereyag_fiyat"),
      katki: sonDoluFiyat(kaymakKayitlari, "katki_fiyat"),
      su: sonDoluFiyat(kaymakKayitlari, "su_fiyat"),
      krema: sonDoluFiyat(kaymakKayitlari, "krema_fiyat"),
      diger: sonDoluFiyat(kaymakKayitlari, "diger_fiyat"),
      paket02: sonDoluFiyat(kaymakKayitlari, "paket_02_fiyat"),
      paket2: sonDoluFiyat(kaymakKayitlari, "paket_2_fiyat"),
      paket3: sonDoluFiyat(kaymakKayitlari, "paket_3_fiyat"),
      satis02: sonDoluFiyat(kaymakKayitlari, "satis_02_fiyat"),
      satis2: sonDoluFiyat(kaymakKayitlari, "satis_2_fiyat"),
      satis3: sonDoluFiyat(kaymakKayitlari, "satis_3_fiyat"),
    },
  };
};
