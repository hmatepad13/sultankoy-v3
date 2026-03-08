import * as XLSX from "xlsx";
import type {
  Gider,
  OzetKart,
  OzetSatiri,
  PersonelOzeti,
  SatisFis,
  Uretim,
  YedekVerisi,
} from "../types/app";
import { dosyaIndir, fSayi, normalizeUsername } from "../utils/format";

const kayitYok = [{ Bilgi: "Kayit yok" }];
const SISTEM_ISLEMI = "SİSTEM İŞLEMİ";

const sheetEkle = (workbook: XLSX.WorkBook, ad: string, veri: Array<Record<string, unknown>>) => {
  const sheet = XLSX.utils.json_to_sheet(veri.length > 0 ? veri : kayitYok);
  XLSX.utils.book_append_sheet(workbook, sheet, ad.slice(0, 31));
};

const bolumluSheetEkle = (
  workbook: XLSX.WorkBook,
  ad: string,
  bolumler: Array<{ baslik: string; satirlar: Array<Record<string, unknown>> }>,
) => {
  const aoa: unknown[][] = [];

  bolumler.forEach((bolum, index) => {
    if (index > 0) aoa.push([]);
    aoa.push([bolum.baslik]);

    if (bolum.satirlar.length === 0) {
      aoa.push(["Kayit yok"]);
      return;
    }

    const basliklar = Object.keys(bolum.satirlar[0]);
    aoa.push(basliklar);
    bolum.satirlar.forEach((satir) => {
      aoa.push(basliklar.map((baslik) => satir[baslik] ?? ""));
    });
  });

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, sheet, ad.slice(0, 31));
};

const donemGetir = (tarih?: string | null) => (tarih ? tarih.substring(0, 7) : "");
const kisaTarih = (tarih?: string | null) => (tarih ? tarih.split("-").reverse().join(".") : "");
const kisiGetir = (deger?: string | null) => normalizeUsername(deger);
const sistemIslemiMi = (bayi?: string | null) => (bayi || "") === SISTEM_ISLEMI;
const kayitIsminiNormalizeEt = (deger?: string | null) =>
  String(deger || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR");

type EslemeHaritalari = {
  bayi: Map<string, string>;
  urun: Map<string, string>;
  ciftlik: Map<string, string>;
};

const eslemeHaritalariOlustur = (veri: YedekVerisi): EslemeHaritalari => ({
  bayi: new Map(veri.bayiler.map((item) => [item.id, item.isim])),
  urun: new Map(veri.urunler.map((item) => [item.id, item.isim])),
  ciftlik: new Map(veri.ciftlikler.map((item) => [item.id, item.isim])),
});

const satisFisBayiAdiGetir = (fis: Partial<SatisFis> | null | undefined, haritalar?: EslemeHaritalari) =>
  (fis?.bayi_id ? haritalar?.bayi.get(fis.bayi_id) : undefined) || fis?.bayi || "";

const satisSatiriBayiAdiGetir = (satir: Partial<YedekVerisi["satisList"][number]> | null | undefined, haritalar?: EslemeHaritalari) =>
  (satir?.bayi_id ? haritalar?.bayi.get(satir.bayi_id) : undefined) || satir?.bayi || "";

const satisSatiriUrunAdiGetir = (satir: Partial<YedekVerisi["satisList"][number]> | null | undefined, haritalar?: EslemeHaritalari) =>
  (satir?.urun_id ? haritalar?.urun.get(satir.urun_id) : undefined) || satir?.urun || "";

const sutCiftlikAdiGetir = (kayit: Partial<YedekVerisi["sutList"][number]> | null | undefined, haritalar?: EslemeHaritalari) =>
  (kayit?.ciftlik_id ? haritalar?.ciftlik.get(kayit.ciftlik_id) : undefined) || kayit?.ciftlik || "";

const satisFisBayiAnahtariGetir = (fis: Partial<SatisFis> | null | undefined, haritalar?: EslemeHaritalari) =>
  fis?.bayi_id ? `id:${fis.bayi_id}` : `isim:${kayitIsminiNormalizeEt(satisFisBayiAdiGetir(fis, haritalar))}`;

const odemeTurunuNormalizeEt = (odemeTuru?: string | null) =>
  String(odemeTuru || "").toLocaleUpperCase("tr-TR");

const cariDevirMi = (odemeTuru?: string | null) => {
  const normal = odemeTurunuNormalizeEt(odemeTuru);
  return normal === "DEVİR" || normal === "DEVIR";
};

const personelDevirMi = (odemeTuru?: string | null) => {
  const normal = odemeTurunuNormalizeEt(odemeTuru);
  return normal === "PERSONEL DEVİR" || normal === "PERSONEL DEVIR";
};

const kasayaDevirMi = (odemeTuru?: string | null) => {
  const normal = odemeTurunuNormalizeEt(odemeTuru);
  return normal === "KASAYA DEVİR" || normal === "KASAYA DEVIR";
};

const giderTurunuNormalizeEt = (tur?: string | null) =>
  String(tur || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c");

const sutOdemesiMi = (tur?: string | null) => giderTurunuNormalizeEt(tur) === "sut odemesi";

const sutcuBorcunuHesapla = (sutKayitlari: YedekVerisi["sutList"], giderKayitlari: Gider[], sonDonem?: string) => {
  const toplamSutTutari = sutKayitlari.reduce((toplam, item) => {
    const donem = donemGetir(item.tarih);
    if (sonDonem && donem > sonDonem) return toplam;
    return toplam + Number(item.toplam_tl || 0);
  }, 0);

  const toplamSutOdemesi = giderKayitlari.reduce((toplam, item) => {
    const donem = donemGetir(item.tarih);
    if (sonDonem && donem > sonDonem) return toplam;
    if (!sutOdemesiMi(item.tur)) return toplam;
    return toplam + Number(item.tutar || 0);
  }, 0);

  return toplamSutTutari - toplamSutOdemesi;
};

const yedekDosyaTarihi = (isoTarih: string) =>
  isoTarih
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 13);

const fisAciklamasiniAyir = (aciklama?: string | null) => {
  let temizAciklama = (aciklama || "").trim();
  let teslimAlan = "";

  const teslimEslesme = temizAciklama.match(/\[Teslim Alan: (.*?)\]/);
  if (teslimEslesme) {
    teslimAlan = teslimEslesme[1];
    temizAciklama = temizAciklama
      .replace(/\[Teslim Alan: .*?\]\s*-\s*/g, "")
      .replace(/\[Teslim Alan: .*?\]/g, "")
      .trim();
  }

  temizAciklama = temizAciklama
    .replace(/\[Ödeme: .*?\]\s*-\s*/g, "")
    .replace(/\[Ödeme: .*?\]/g, "")
    .replace(/\[Sadece Tahsilat\]\s*-\s*/g, "")
    .replace(/\[Sadece Tahsilat\]/g, "")
    .trim();

  return { teslimAlan, aciklama: temizAciklama };
};

const satisFisleriniSirala = (kayitlar: SatisFis[]) =>
  [...kayitlar].sort((a, b) => {
    const tarihFarki = String(a.tarih || "").localeCompare(String(b.tarih || ""));
    if (tarihFarki !== 0) return tarihFarki;

    const idA = Number(a.id);
    const idB = Number(b.id);
    if (!Number.isNaN(idA) && !Number.isNaN(idB) && idA !== idB) return idA - idB;

    return String(a.id || "").localeCompare(String(b.id || ""));
  });

const satisBakiyeDurumuHesapla = (kayitlar: SatisFis[], sonDonem?: string, haritalar?: EslemeHaritalari) => {
  const bakiyeler: Record<string, number> = {};
  const map: Record<string, number> = {};
  const labels: Record<string, string> = {};

  satisFisleriniSirala(kayitlar).forEach((fis) => {
    const donem = donemGetir(fis.tarih);
    const bayi = satisFisBayiAdiGetir(fis, haritalar);
    const bayiKey = satisFisBayiAnahtariGetir(fis, haritalar);
    if (sonDonem && donem > sonDonem) return;
    if (!bayi || sistemIslemiMi(bayi)) return;

    const kalanBakiye = Number(fis.kalan_bakiye || 0);

    if (cariDevirMi(fis.odeme_turu) || personelDevirMi(fis.odeme_turu)) {
      bakiyeler[bayiKey] = kalanBakiye;
    } else {
      bakiyeler[bayiKey] = (bakiyeler[bayiKey] || 0) + kalanBakiye;
    }
    labels[bayiKey] = bayi;

    if (fis.id) {
      map[String(fis.id)] = bakiyeler[bayiKey];
    }
  });

  return { bakiyeler, map, labels };
};

const satisFisToplamBorcMapOlustur = (kayitlar: SatisFis[], haritalar?: EslemeHaritalari) =>
  satisBakiyeDurumuHesapla(kayitlar, undefined, haritalar).map;

const tumDonemleriGetir = (veri: YedekVerisi) => {
  const donemler = new Set<string>();

  [
    ...veri.sutList.map((item) => item.tarih),
    ...veri.satisFisList.map((item) => item.tarih),
    ...veri.satisList.map((item) => item.tarih),
    ...veri.giderList.map((item) => item.tarih),
    ...veri.uretimList.map((item) => item.tarih),
    veri.aktifDonem,
  ].forEach((tarih) => {
    const donem = donemGetir(tarih);
    if (donem) donemler.add(donem);
  });

  return Array.from(donemler).sort().reverse();
};

const listeyiDonemeGoreFiltrele = <T extends { tarih?: string | null }>(liste: T[], donem: string) =>
  liste.filter((item) => donemGetir(item.tarih) === donem);

const rapordaGosterilenSatisFisi = (fis: Pick<SatisFis, "odeme_turu">) =>
  !cariDevirMi(fis.odeme_turu) && !personelDevirMi(fis.odeme_turu) && !kasayaDevirMi(fis.odeme_turu);

const personelDevirKeyGetir = (aciklama?: string | null) => {
  const eslesme = aciklama?.match(/\((.*?)\)/);
  return eslesme?.[1] ? kisiGetir(eslesme[1]) || eslesme[1] : "Bilinmiyor";
};

const personelKaydiGetir = (map: Record<string, PersonelOzeti>, key: string) => {
  if (!map[key]) {
    map[key] = {
      isim: key,
      satis: 0,
      tahsilat: 0,
      gider: 0,
      kasayaDevir: 0,
      net: 0,
      acikBakiye: 0,
      devirNet: 0,
      devirAcik: 0,
    };
  }
  return map[key];
};

const personelOzetleriniOlustur = (satisFisleri: SatisFis[], giderler: Gider[]) => {
  const map: Record<string, PersonelOzeti> = {};

  satisFisleri.forEach((fis) => {
    const personelDevir = personelDevirMi(fis.odeme_turu) && sistemIslemiMi(fis.bayi);
    const donemDevir = cariDevirMi(fis.odeme_turu);
    const key = personelDevir ? personelDevirKeyGetir(fis.aciklama) : kisiGetir(fis.ekleyen) || "Bilinmiyor";
    const kayit = personelKaydiGetir(map, key);

    if (kasayaDevirMi(fis.odeme_turu)) {
      kayit.kasayaDevir += Number(fis.tahsilat || 0);
      return;
    }

    if (personelDevir) {
      kayit.devirNet += Number(fis.toplam_tutar || 0);
      kayit.devirAcik += Number(fis.kalan_bakiye || 0);
      return;
    }

    if (donemDevir) return;

    if (!sistemIslemiMi(fis.bayi) && Number(fis.toplam_tutar || 0) > 0) {
      kayit.satis += Number(fis.toplam_tutar || 0);
    }

    kayit.tahsilat += Number(fis.tahsilat || 0);
    kayit.acikBakiye += Number(fis.kalan_bakiye || 0);
  });

  giderler.forEach((gider) => {
    const key = kisiGetir(gider.ekleyen) || "Bilinmiyor";
    personelKaydiGetir(map, key).gider += Number(gider.tutar || 0);
  });

  return Object.values(map)
    .map((item) => {
      const net = item.devirNet + (item.tahsilat - item.gider - item.kasayaDevir);
      const acikBakiye = item.devirAcik + item.acikBakiye;
      return { ...item, net, acikBakiye };
    })
    .filter((item) =>
      Math.abs(item.satis) > 0.01 ||
      Math.abs(item.tahsilat) > 0.01 ||
      Math.abs(item.gider) > 0.01 ||
      Math.abs(item.kasayaDevir) > 0.01 ||
      Math.abs(item.net) > 0.01 ||
      Math.abs(item.acikBakiye) > 0.01,
    )
    .sort((a, b) => a.isim.localeCompare(b.isim, "tr"));
};

const donemBazliMusteriBorclariOlustur = (veri: YedekVerisi) =>
  {
    const haritalar = eslemeHaritalariOlustur(veri);
    return tumDonemleriGetir(veri).flatMap((donem) => {
    const { bakiyeler, labels } = satisBakiyeDurumuHesapla(veri.satisFisList, donem, haritalar);
    return Object.entries(bakiyeler)
      .filter(([, borc]) => Math.abs(borc) > 0.01)
      .sort(([, borcA], [, borcB]) => borcB - borcA)
      .map(([musteriKey, borc]) => ({
        Donem: donem,
        Musteri: labels[musteriKey] || musteriKey,
        Borc: borc,
      }));
    });
  };

const donemBazliPersonelOzetleriOlustur = (veri: YedekVerisi) =>
  tumDonemleriGetir(veri).flatMap((donem) =>
    personelOzetleriniOlustur(
      veri.satisFisList.filter((item) => donemGetir(item.tarih) === donem),
      veri.giderList.filter((item) => donemGetir(item.tarih) === donem),
    ).map((item) => ({
      Donem: donem,
      Personel: item.isim,
      Satis: item.satis,
      Tahsilat: item.tahsilat,
      Gider: item.gider,
      "Kasaya Devir": item.kasayaDevir,
      Net: item.net,
      "Acik Bakiye": item.acikBakiye,
      "Devir Net": item.devirNet,
      "Devir Acik": item.devirAcik,
      })),
  );

const donemOzetiOlustur = (veri: YedekVerisi) =>
  {
    const haritalar = eslemeHaritalariOlustur(veri);
    return tumDonemleriGetir(veri).map((donem) => {
    const donemSutKayitlari = veri.sutList.filter((item) => donemGetir(item.tarih) === donem);
    const donemSatisFisleri = veri.satisFisList.filter((item) => donemGetir(item.tarih) === donem);
    const donemSatisSatirlari = veri.satisList.filter((item) => donemGetir(item.tarih) === donem);
    const donemGiderleri = veri.giderList.filter((item) => donemGetir(item.tarih) === donem);
    const yogurtKayitlari = veri.uretimList.filter(
      (item) => donemGetir(item.tarih) === donem && (item.uretim_tipi || "yogurt") === "yogurt",
    );
    const sutKaymagiKayitlari = veri.uretimList.filter(
      (item) => donemGetir(item.tarih) === donem && item.uretim_tipi === "sut_kaymagi",
    );
    const donemSonuBorclar = satisBakiyeDurumuHesapla(veri.satisFisList, donem, haritalar).bakiyeler;
    const donemSatisToplami = donemSatisFisleri
      .filter((item) => !cariDevirMi(item.odeme_turu) && !personelDevirMi(item.odeme_turu) && !kasayaDevirMi(item.odeme_turu))
      .reduce((toplam, item) => toplam + Number(item.toplam_tutar || 0), 0);
    const sutcuyeBorc = sutcuBorcunuHesapla(veri.sutList, veri.giderList, donem);

    return {
      Donem: donem,
      "Süt Girişi": donemSutKayitlari.length,
      "Satış Fişi": donemSatisFisleri.length,
      "Satış Satırı": donemSatisSatirlari.length,
      Gider: donemGiderleri.length,
      "Yoğurt Üretimi": yogurtKayitlari.length,
      "Süt Kaymağı Üretimi": sutKaymagiKayitlari.length,
      "Toplam Satış": donemSatisToplami,
      "Toplam Gider": donemGiderleri.reduce((toplam, item) => toplam + Number(item.tutar || 0), 0),
      "Bayi Açık Hesap": Object.values(donemSonuBorclar).reduce((toplam, borc) => toplam + borc, 0),
      "Sütçüye Borcumuz": sutcuyeBorc,
    };
    });
  };

const donemRaporKartlariniOlustur = (veri: YedekVerisi, donem: string) => {
  const haritalar = eslemeHaritalariOlustur(veri);
  const donemSatisFisleri = listeyiDonemeGoreFiltrele(veri.satisFisList, donem);
  const donemGiderleri = listeyiDonemeGoreFiltrele(veri.giderList, donem);
  const donemUretimleri = listeyiDonemeGoreFiltrele(veri.uretimList, donem);
  const rapordaGorunenFisler = donemSatisFisleri.filter(rapordaGosterilenSatisFisi);
  const satisToplami = rapordaGorunenFisler.reduce((toplam, item) => toplam + Number(item.toplam_tutar || 0), 0);
  const tahsilatToplami = rapordaGorunenFisler.reduce((toplam, item) => toplam + Number(item.tahsilat || 0), 0);
  const giderToplami = donemGiderleri.reduce((toplam, item) => toplam + Number(item.tutar || 0), 0);
  const uretimMaliyeti = donemUretimleri.reduce((toplam, item) => toplam + Number(item.toplam_maliyet || 0), 0);
  const acikHesap = Object.values(satisBakiyeDurumuHesapla(veri.satisFisList, donem, haritalar).bakiyeler).reduce(
    (toplam, borc) => toplam + borc,
    0,
  );
  const sutBorcu = sutcuBorcunuHesapla(veri.sutList, veri.giderList, donem);

  return [
    { baslik: "Donem", deger: donem },
    { baslik: "Satis", deger: fSayi(satisToplami) },
    { baslik: "Gider", deger: fSayi(giderToplami + uretimMaliyeti) },
    { baslik: "Tahsilat", deger: fSayi(tahsilatToplami) },
    { baslik: "Acik Hesap", deger: fSayi(acikHesap) },
    { baslik: "Sut Borcu", deger: fSayi(sutBorcu) },
  ];
};

const ozetKartlariniCevir = (kartlar: OzetKart[], aktifDonem: string) => [
  { Baslik: "Aktif Donem", Deger: aktifDonem },
  ...kartlar.map((item) => ({
    Baslik: item.baslik,
    Deger: item.deger,
  })),
];

const ozetSatirlariniCevir = (kayitlar: OzetSatiri[]) =>
  kayitlar.map((item) => ({
    Musteri: item.isim,
    "Top. Borc": item.deger,
  }));

const personelCevir = (kayitlar: PersonelOzeti[]) =>
  kayitlar.map((item) => ({
    Personel: item.isim,
    Satis: item.satis,
    Tahsilat: item.tahsilat,
    Gider: item.gider,
    "Kasaya Devir": item.kasayaDevir,
    "Net Kalan": item.net,
    "Acik Bakiye": item.acikBakiye,
    "Devir Net": item.devirNet,
    "Devir Acik": item.devirAcik,
  }));

const copKutusuOzetleri = (veri: YedekVerisi) =>
  veri.copKutusuList.map((item) => {
    const kayit = item.veri && typeof item.veri === "object" && !Array.isArray(item.veri)
      ? (item.veri as Record<string, unknown>)
      : null;

    return {
      "Silinme Tarihi": item.silinme_tarihi || "",
      Tablo: item.tablo_adi,
      Tarih: typeof kayit?.tarih === "string" ? kayit.tarih : "",
      Isim: typeof kayit?.isim === "string" ? kayit.isim : typeof kayit?.bayi === "string" ? kayit.bayi : "",
      "Fis No": typeof kayit?.fis_no === "string" ? kayit.fis_no : "",
      Aciklama: typeof kayit?.aciklama === "string" ? kayit.aciklama : "",
    };
  });

const escapeHtml = (deger: unknown) =>
  String(deger ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const hucreMetni = (deger: unknown) => {
  if (typeof deger === "number") return fSayi(deger);
  if (deger === null || deger === undefined || deger === "") return "-";
  return String(deger);
};

const htmlKartlar = (kartlar: Array<{ baslik: string; deger: string }>) =>
  `<div class="cards">${kartlar
    .map(
      (kart) => `
      <article class="card">
        <div class="card-label">${escapeHtml(kart.baslik)}</div>
        <div class="card-value">${escapeHtml(kart.deger)}</div>
      </article>`,
    )
    .join("")}</div>`;

const htmlTablo = (basliklar: string[], satirlar: Array<Record<string, unknown>>) => {
  const rows = satirlar.length > 0
    ? satirlar
    : [Object.fromEntries(basliklar.map((baslik) => [baslik, "-"]))];

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${basliklar.map((baslik) => `<th>${escapeHtml(baslik)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (satir) => `
                <tr>
                  ${basliklar
                    .map((baslik) => `<td>${escapeHtml(hucreMetni(satir[baslik]))}</td>`)
                    .join("")}
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
};

const htmlBolum = (id: string, baslik: string, icerik: string, aciklama = "") => `
  <section id="${escapeHtml(id)}" class="section" data-section="${escapeHtml(id)}">
    <div class="section-head">
      <h2>${escapeHtml(baslik)}</h2>
      ${aciklama ? `<p>${escapeHtml(aciklama)}</p>` : ""}
    </div>
    ${icerik}
  </section>`;

export const yedegiJsonIndir = (veri: YedekVerisi) => {
  dosyaIndir(
    JSON.stringify(veri, null, 2),
    `sultankoy-yedek-tum-donemler-${yedekDosyaTarihi(veri.alindiTarih)}.json`,
    "application/json;charset=utf-8",
  );
};

export const yedegiExcelIndir = (veri: YedekVerisi) => {
  const workbook = XLSX.utils.book_new();
  const haritalar = eslemeHaritalariOlustur(veri);
  const satisFisToplamBorcMap = satisFisToplamBorcMapOlustur(veri.satisFisList, haritalar);
  const donemMusteriBorclari = donemBazliMusteriBorclariOlustur(veri);
  const donemPersonelOzetleri = donemBazliPersonelOzetleriOlustur(veri);
  const donemler = tumDonemleriGetir(veri);

  const yedekBilgisi = [
    { Alan: "Alinma Tarihi", Deger: veri.alindiTarih },
    { Alan: "Aktif Donem", Deger: veri.aktifDonem },
    { Alan: "Yetki Kaynagi", Deger: veri.kaynak },
    { Alan: "Kapsam", Deger: "Tum donemler" },
  ];

  const sutSayfasi = veri.sutList.map((item) => ({
    Donem: donemGetir(item.tarih),
    Tarih: kisaTarih(item.tarih),
    Ciftlik: sutCiftlikAdiGetir(item, haritalar),
    KG: Number(item.kg || 0),
    Fiyat: Number(item.fiyat || 0),
    Tutar: Number(item.toplam_tl || 0),
    Kisi: kisiGetir(item.ekleyen),
    Aciklama: item.aciklama || "",
  }));

  const satisFisleriSayfasi = veri.satisFisList.filter(rapordaGosterilenSatisFisi).map((item) => {
    const { teslimAlan, aciklama } = fisAciklamasiniAyir(item.aciklama);
    return {
      Donem: donemGetir(item.tarih),
      Tarih: kisaTarih(item.tarih),
      "Fis No": item.fis_no,
      Bayi: satisFisBayiAdiGetir(item, haritalar),
      Tutar: Number(item.toplam_tutar || 0),
      Tahsilat: Number(item.tahsilat || 0),
      "Bu Fisten Kalan": Number(item.kalan_bakiye || 0),
      "Top. Borc": item.id ? satisFisToplamBorcMap[String(item.id)] ?? 0 : 0,
      "Odeme Turu": item.odeme_turu,
      "Teslim Alan": teslimAlan,
      Aciklama: aciklama,
      Kisi: kisiGetir(item.ekleyen),
    };
  });

  const satisAnalizSayfasi = veri.satisList.map((item) => ({
    Donem: donemGetir(item.tarih),
    Tarih: kisaTarih(item.tarih),
    Bayi: satisSatiriBayiAdiGetir(item, haritalar),
    Urun: satisSatiriUrunAdiGetir(item, haritalar),
    Adet: Number(item.adet || 0),
    KG: Number(item.toplam_kg || 0),
    Fiyat: Number(item.fiyat || 0),
    Tutar: Number(item.tutar || 0),
    Kisi: kisiGetir(item.ekleyen),
  }));

  const giderSayfasi = veri.giderList.map((item) => ({
    Donem: donemGetir(item.tarih),
    Tarih: kisaTarih(item.tarih),
    Tur: item.tur,
    Tutar: Number(item.tutar || 0),
    Aciklama: item.aciklama || "",
    Kisi: kisiGetir(item.ekleyen),
  }));

  const yogurtUretimSayfasi = veri.uretimList
    .filter((item) => (item.uretim_tipi || "yogurt") === "yogurt")
    .map((item: Uretim) => ({
      Donem: donemGetir(item.tarih),
      Tarih: kisaTarih(item.tarih),
      "Giren KG": Number(item.toplam_kg || 0),
      "Cikan KG": Number(item.cikan_toplam_kg || 0),
      "3'lük": Number(item.cikti_3kg || 0),
      "5'lik": Number(item.cikti_5kg || 0),
      Maliyet: Number(item.toplam_maliyet || 0),
      Kar: Number(item.kar || 0),
      Aciklama: item.aciklama || "",
      Kisi: kisiGetir(item.ekleyen),
    }));

  const sutKaymagiUretimSayfasi = veri.uretimList
    .filter((item) => item.uretim_tipi === "sut_kaymagi")
    .map((item: Uretim) => ({
      Donem: donemGetir(item.tarih),
      Tarih: kisaTarih(item.tarih),
      "Giren KG": Number(item.toplam_kg || 0),
      "Cikan KG": Number(item.cikan_toplam_kg || 0),
      "2'lik": Number(item.cikti_2kg || 0),
      "3'lük": Number(item.cikti_3kg || 0),
      Maliyet: Number(item.toplam_maliyet || 0),
      Kar: Number(item.kar || 0),
      Aciklama: item.aciklama || "",
      Kisi: kisiGetir(item.ekleyen),
    }));

  const musteriSayfasi = veri.bayiler.map((item) => ({ Musteri: item.isim }));
  const urunSayfasi = veri.urunler.map((item) => ({ Urun: item.isim, Fiyat: Number(item.fiyat || 0) || "" }));
  const ciftlikSayfasi = veri.ciftlikler.map((item) => ({ Ciftlik: item.isim }));
  const yetkiSayfasi = veri.tabYetkileri.map((item) => ({
    Kullanici: kisiGetir(item.username),
    Sekmeler: Object.entries(item.tabs || {})
      .filter(([, gorunur]) => Boolean(gorunur))
      .map(([sekme]) => sekme)
      .join(", "),
    Guncellendi: item.updatedAt || "",
  }));

  sheetEkle(workbook, "Yedek Bilgisi", yedekBilgisi);
  sheetEkle(workbook, "Donem Ozetleri", donemOzetiOlustur(veri));
  sheetEkle(workbook, "Aktif Ozet", ozetKartlariniCevir(veri.ozetKartlari, veri.aktifDonem));
  sheetEkle(workbook, "Aktif Musteri", ozetSatirlariniCevir(veri.bayiBorclari));
  sheetEkle(workbook, "Aktif Personel", personelCevir(veri.personelOzetleri));
  sheetEkle(workbook, "Donem Musteri", donemMusteriBorclari);
  sheetEkle(workbook, "Donem Personel", donemPersonelOzetleri);
  sheetEkle(workbook, "Sut Girisi", sutSayfasi);
  sheetEkle(workbook, "Satis Fisleri", satisFisleriSayfasi);
  sheetEkle(workbook, "Satis Analiz", satisAnalizSayfasi);
  sheetEkle(workbook, "Giderler", giderSayfasi);
  sheetEkle(workbook, "Yogurt Uretim", yogurtUretimSayfasi);
  sheetEkle(workbook, "Sut Kaymagi", sutKaymagiUretimSayfasi);
  sheetEkle(workbook, "Musteriler", musteriSayfasi);
  sheetEkle(workbook, "Urunler", urunSayfasi);
  sheetEkle(workbook, "Ciftlikler", ciftlikSayfasi);
  sheetEkle(workbook, "Cop Kutusu", copKutusuOzetleri(veri));
  sheetEkle(workbook, "Yetkiler", yetkiSayfasi);

  donemler.forEach((donem) => {
    const donemSatisFisleri = listeyiDonemeGoreFiltrele(veri.satisFisList, donem).filter(rapordaGosterilenSatisFisi);
    const donemSatisDetaylari = listeyiDonemeGoreFiltrele(veri.satisList, donem);
    const donemSutKayitlari = listeyiDonemeGoreFiltrele(veri.sutList, donem);
    const donemGiderleri = listeyiDonemeGoreFiltrele(veri.giderList, donem);
    const donemYogurtUretimleri = listeyiDonemeGoreFiltrele(
      veri.uretimList.filter((item) => (item.uretim_tipi || "yogurt") === "yogurt"),
      donem,
    );
    const donemSutKaymagiUretimleri = listeyiDonemeGoreFiltrele(
      veri.uretimList.filter((item) => item.uretim_tipi === "sut_kaymagi"),
      donem,
    );
    const donemMusteriBakiye = satisBakiyeDurumuHesapla(veri.satisFisList, donem, haritalar);
    const donemMusteriBorclariSatirlari = Object.entries(donemMusteriBakiye.bakiyeler)
      .filter(([, borc]) => Math.abs(borc) > 0.01)
      .sort(([, a], [, b]) => b - a)
      .map(([musteriKey, borc]) => ({ Musteri: donemMusteriBakiye.labels[musteriKey] || musteriKey, Borc: borc }));
    const donemPersonelSatirlari = personelOzetleriniOlustur(
      listeyiDonemeGoreFiltrele(veri.satisFisList, donem),
      listeyiDonemeGoreFiltrele(veri.giderList, donem),
    ).map((item) => ({
      Personel: item.isim,
      Satis: item.satis,
      Tahsilat: item.tahsilat,
      Gider: item.gider,
      "Kasaya Devir": item.kasayaDevir,
      Net: item.net,
      "Acik Bakiye": item.acikBakiye,
    }));

    bolumluSheetEkle(workbook, `${donem} Rapor`, [
      {
        baslik: "Ozet",
        satirlar: donemRaporKartlariniOlustur(veri, donem).map((item) => ({
          Baslik: item.baslik,
          Deger: item.deger,
        })),
      },
      {
        baslik: "Musteri Borclari",
        satirlar: donemMusteriBorclariSatirlari,
      },
      {
        baslik: "Personel",
        satirlar: donemPersonelSatirlari,
      },
      {
        baslik: "Satis Fisleri",
        satirlar: donemSatisFisleri.map((item) => {
          const { teslimAlan, aciklama } = fisAciklamasiniAyir(item.aciklama);
          return {
            Tarih: kisaTarih(item.tarih),
            "Fis No": item.fis_no,
            Bayi: satisFisBayiAdiGetir(item, haritalar),
            Tutar: Number(item.toplam_tutar || 0),
            Tahsilat: Number(item.tahsilat || 0),
            "Bu Fisten Kalan": Number(item.kalan_bakiye || 0),
            "Toplam Borc": item.id ? satisFisToplamBorcMap[String(item.id)] ?? 0 : 0,
            "Odeme Turu": item.odeme_turu,
            "Teslim Alan": teslimAlan,
            Aciklama: aciklama,
            Kisi: kisiGetir(item.ekleyen),
          };
        }),
      },
      {
        baslik: "Satis Detay",
        satirlar: donemSatisDetaylari.map((item) => ({
          Tarih: kisaTarih(item.tarih),
          Bayi: satisSatiriBayiAdiGetir(item, haritalar),
          Urun: satisSatiriUrunAdiGetir(item, haritalar),
          Adet: Number(item.adet || 0),
          KG: Number(item.toplam_kg || 0),
          Fiyat: Number(item.fiyat || 0),
          Tutar: Number(item.tutar || 0),
          Kisi: kisiGetir(item.ekleyen),
        })),
      },
      {
        baslik: "Sut",
        satirlar: donemSutKayitlari.map((item) => ({
          Tarih: kisaTarih(item.tarih),
          Ciftlik: sutCiftlikAdiGetir(item, haritalar),
          KG: Number(item.kg || 0),
          Fiyat: Number(item.fiyat || 0),
          Tutar: Number(item.toplam_tl || 0),
          Kisi: kisiGetir(item.ekleyen),
          Aciklama: item.aciklama || "",
        })),
      },
      {
        baslik: "Gider",
        satirlar: donemGiderleri.map((item) => ({
          Tarih: kisaTarih(item.tarih),
          Tur: item.tur,
          Tutar: Number(item.tutar || 0),
          Aciklama: item.aciklama || "",
          Kisi: kisiGetir(item.ekleyen),
        })),
      },
      {
        baslik: "Yogurt Uretim",
        satirlar: donemYogurtUretimleri.map((item) => ({
          Tarih: kisaTarih(item.tarih),
          "Giren KG": Number(item.toplam_kg || 0),
          "Cikan KG": Number(item.cikan_toplam_kg || 0),
          "3'luk": Number(item.cikti_3kg || 0),
          "5'lik": Number(item.cikti_5kg || 0),
          Maliyet: Number(item.toplam_maliyet || 0),
          Kar: Number(item.kar || 0),
          Aciklama: item.aciklama || "",
          Kisi: kisiGetir(item.ekleyen),
        })),
      },
      {
        baslik: "Sut Kaymagi",
        satirlar: donemSutKaymagiUretimleri.map((item) => ({
          Tarih: kisaTarih(item.tarih),
          "Giren KG": Number(item.toplam_kg || 0),
          "Cikan KG": Number(item.cikan_toplam_kg || 0),
          "2'lik": Number(item.cikti_2kg || 0),
          "3'luk": Number(item.cikti_3kg || 0),
          Maliyet: Number(item.toplam_maliyet || 0),
          Kar: Number(item.kar || 0),
          Aciklama: item.aciklama || "",
          Kisi: kisiGetir(item.ekleyen),
        })),
      },
    ]);
  });

  XLSX.writeFile(workbook, `sultankoy-yedek-tum-donemler-${yedekDosyaTarihi(veri.alindiTarih)}.xlsx`);
};

export const yedegiHtmlIndir = (veri: YedekVerisi) => {
  const haritalar = eslemeHaritalariOlustur(veri);
  const satisFisToplamBorcMap = satisFisToplamBorcMapOlustur(veri.satisFisList, haritalar);
  const donemOzetleri = donemOzetiOlustur(veri);
  const secilebilirDonemler = Array.from(
    new Set([...tumDonemleriGetir(veri), veri.aktifDonem].filter(Boolean)),
  ).sort().reverse();
  const varsayilanDonem = secilebilirDonemler.includes(veri.aktifDonem)
    ? veri.aktifDonem
    : secilebilirDonemler[0] || veri.aktifDonem;
  const donemOzetBasliklari = donemOzetleri.length > 0
    ? Object.keys(donemOzetleri[0])
    : [
        "Donem",
        "Sut Girisi",
        "Satis Fisi",
        "Satis Satiri",
        "Gider",
        "Yogurt Uretimi",
        "Sut Kaymagi Uretimi",
        "Toplam Satis",
        "Toplam Gider",
        "Bayi Acik Hesap",
        "Sutcuye Borcumuz",
      ];

  const donemIcinOzetKartlari = (donem: string) => htmlKartlar(donemRaporKartlariniOlustur(veri, donem));

  const donemBloklariniOlustur = (icerikOlustur: (donem: string) => string) =>
    secilebilirDonemler
      .map(
        (donem) => `
          <div class="period-block${donem === varsayilanDonem ? "" : " hidden"}" data-period="${escapeHtml(donem)}">
            ${icerikOlustur(donem)}
          </div>`,
      )
      .join("");

  const donemOzetTablosu = donemBloklariniOlustur((donem) =>
    htmlTablo(
      donemOzetBasliklari,
      donemOzetleri.filter((item) => String(item.Donem) === donem) as Array<Record<string, unknown>>,
    ),
  );

  const musteriBorclariTablosu = donemBloklariniOlustur((donem) => {
    const { bakiyeler, labels } = satisBakiyeDurumuHesapla(veri.satisFisList, donem, haritalar);
    const satirlar = Object.entries(bakiyeler)
      .filter(([, borc]) => Math.abs(borc) > 0.01)
      .sort(([, borcA], [, borcB]) => borcB - borcA)
      .map(([musteriKey, borc]) => ({ Musteri: labels[musteriKey] || musteriKey, Borc: borc }));

    return htmlTablo(["Musteri", "Borc"], satirlar);
  });

  const personelTablosu = donemBloklariniOlustur((donem) =>
    htmlTablo(
      ["Personel", "Satis", "Tahsilat", "Gider", "Kasaya Devir", "Net", "Acik Bakiye"],
      personelOzetleriniOlustur(
        listeyiDonemeGoreFiltrele(veri.satisFisList, donem),
        listeyiDonemeGoreFiltrele(veri.giderList, donem),
      ).map((item) => ({
        Personel: item.isim,
        Satis: item.satis,
        Tahsilat: item.tahsilat,
        Gider: item.gider,
        "Kasaya Devir": item.kasayaDevir,
        Net: item.net,
        "Acik Bakiye": item.acikBakiye,
      })),
    ),
  );

  const satisFisleriTablosu = donemBloklariniOlustur((donem) =>
    htmlTablo(
      ["Tarih", "Fis No", "Bayi", "Tutar", "Tahsilat", "Bu Fisten Kalan", "Toplam Borc", "Odeme Turu", "Teslim Alan", "Aciklama", "Kisi"],
      listeyiDonemeGoreFiltrele(veri.satisFisList, donem).filter(rapordaGosterilenSatisFisi).map((item) => {
        const detay = fisAciklamasiniAyir(item.aciklama);
        return {
          Tarih: kisaTarih(item.tarih),
          "Fis No": item.fis_no,
          Bayi: satisFisBayiAdiGetir(item, haritalar),
          Tutar: Number(item.toplam_tutar || 0),
          Tahsilat: Number(item.tahsilat || 0),
          "Bu Fisten Kalan": Number(item.kalan_bakiye || 0),
          "Toplam Borc": item.id ? satisFisToplamBorcMap[String(item.id)] ?? 0 : 0,
          "Odeme Turu": item.odeme_turu,
          "Teslim Alan": detay.teslimAlan,
          Aciklama: detay.aciklama,
          Kisi: kisiGetir(item.ekleyen),
        };
      }),
    ),
  );

  const satisDetayTablosu = donemBloklariniOlustur((donem) =>
    htmlTablo(
      ["Tarih", "Bayi", "Urun", "Adet", "KG", "Fiyat", "Tutar", "Kisi"],
      listeyiDonemeGoreFiltrele(veri.satisList, donem).map((item) => ({
        Tarih: kisaTarih(item.tarih),
        Bayi: satisSatiriBayiAdiGetir(item, haritalar),
        Urun: satisSatiriUrunAdiGetir(item, haritalar),
        Adet: Number(item.adet || 0),
        KG: Number(item.toplam_kg || 0),
        Fiyat: Number(item.fiyat || 0),
        Tutar: Number(item.tutar || 0),
        Kisi: kisiGetir(item.ekleyen),
      })),
    ),
  );

  const sutTablosu = donemBloklariniOlustur((donem) =>
    htmlTablo(
      ["Tarih", "Ciftlik", "KG", "Fiyat", "Tutar", "Kisi", "Aciklama"],
      listeyiDonemeGoreFiltrele(veri.sutList, donem).map((item) => ({
        Tarih: kisaTarih(item.tarih),
        Ciftlik: sutCiftlikAdiGetir(item, haritalar),
        KG: Number(item.kg || 0),
        Fiyat: Number(item.fiyat || 0),
        Tutar: Number(item.toplam_tl || 0),
        Kisi: kisiGetir(item.ekleyen),
        Aciklama: item.aciklama || "",
      })),
    ),
  );

  const giderTablosu = donemBloklariniOlustur((donem) =>
    htmlTablo(
      ["Tarih", "Tur", "Tutar", "Kisi", "Aciklama"],
      listeyiDonemeGoreFiltrele(veri.giderList, donem).map((item) => ({
        Tarih: kisaTarih(item.tarih),
        Tur: item.tur,
        Tutar: Number(item.tutar || 0),
        Kisi: kisiGetir(item.ekleyen),
        Aciklama: item.aciklama || "",
      })),
    ),
  );

  const yogurtTablosu = donemBloklariniOlustur((donem) =>
    htmlTablo(
    ["Tarih", "Giren KG", "Cikan KG", "3'lük", "5'lik", "Maliyet", "Kar", "Kisi", "Aciklama"],
    listeyiDonemeGoreFiltrele(
      veri.uretimList.filter((item) => (item.uretim_tipi || "yogurt") === "yogurt"),
      donem,
    ).map((item) => ({
        Tarih: kisaTarih(item.tarih),
        "Giren KG": Number(item.toplam_kg || 0),
        "Cikan KG": Number(item.cikan_toplam_kg || 0),
        "3'lük": Number(item.cikti_3kg || 0),
        "5'lik": Number(item.cikti_5kg || 0),
        Maliyet: Number(item.toplam_maliyet || 0),
        Kar: Number(item.kar || 0),
        Kisi: kisiGetir(item.ekleyen),
        Aciklama: item.aciklama || "",
      })),
    ),
  );

  const sutKaymagiTablosu = donemBloklariniOlustur((donem) =>
    htmlTablo(
    ["Tarih", "Giren KG", "Cikan KG", "2'lik", "3'lük", "Maliyet", "Kar", "Kisi", "Aciklama"],
    listeyiDonemeGoreFiltrele(
      veri.uretimList.filter((item) => item.uretim_tipi === "sut_kaymagi"),
      donem,
    ).map((item) => ({
        Tarih: kisaTarih(item.tarih),
        "Giren KG": Number(item.toplam_kg || 0),
        "Cikan KG": Number(item.cikan_toplam_kg || 0),
        "2'lik": Number(item.cikti_2kg || 0),
        "3'lük": Number(item.cikti_3kg || 0),
        Maliyet: Number(item.toplam_maliyet || 0),
        Kar: Number(item.kar || 0),
        Kisi: kisiGetir(item.ekleyen),
        Aciklama: item.aciklama || "",
      })),
    ),
  );

  const tanimlarTablosu = htmlTablo(
    ["Tur", "Liste"],
    [
      { Tur: "Musteriler", Liste: veri.bayiler.map((item) => item.isim).join(", ") || "-" },
      { Tur: "Urunler", Liste: veri.urunler.map((item) => item.isim).join(", ") || "-" },
      { Tur: "Ciftlikler", Liste: veri.ciftlikler.map((item) => item.isim).join(", ") || "-" },
      {
        Tur: "Yetkiler",
        Liste:
          veri.tabYetkileri
            .map((item) => `${kisiGetir(item.username)}: ${Object.entries(item.tabs || {}).filter(([, acik]) => Boolean(acik)).map(([sekme]) => sekme).join(", ")}`)
            .join(" | ") || "-",
      },
    ],
  );

  const htmlBolumler = [
    {
      id: "ozet",
      etiket: "Ozet",
      baslik: "Donem Ozeti",
      aciklama: "Secilen donemin ust toplam gorunumu.",
      icerik: donemBloklariniOlustur((donem) => donemIcinOzetKartlari(donem)),
    },
    {
      id: "donemler",
      etiket: "Donemler",
      baslik: "Donem Ozeti Tablosu",
      aciklama: "Secilen donemin tek satirlik rapor ozeti.",
      icerik: donemOzetTablosu,
    },
    {
      id: "musteriler",
      etiket: "Musteri Borclari",
      baslik: "Musteri Borclari",
      aciklama: "Secilen donemin sonunda olusan musteri bakiyeleri.",
      icerik: musteriBorclariTablosu,
    },
    {
      id: "personel",
      etiket: "Personel",
      baslik: "Personel Ozetleri",
      aciklama: "Tahsilat, gider, kasaya devir ve net bakiye takibi.",
      icerik: personelTablosu,
    },
    {
      id: "satis-fisleri",
      etiket: "Satis Fisleri",
      baslik: "Satis Fisleri",
      aciklama: "Secilen donemin fis listesi.",
      icerik: satisFisleriTablosu,
    },
    {
      id: "satis-detay",
      etiket: "Satis Detay",
      baslik: "Satis Detaylari",
      aciklama: "Secilen donemin urun bazli satis satirlari.",
      icerik: satisDetayTablosu,
    },
    {
      id: "sut",
      etiket: "Sut",
      baslik: "Sut Hareketleri",
      aciklama: "Secilen donemin sut girisleri.",
      icerik: sutTablosu,
    },
    {
      id: "gider",
      etiket: "Gider",
      baslik: "Gider Hareketleri",
      aciklama: "Secilen donemin gider listesi.",
      icerik: giderTablosu,
    },
    {
      id: "yogurt",
      etiket: "Yogurt Uretim",
      baslik: "Yogurt Uretimleri",
      aciklama: "Secilen donemin yogurt uretim kayitlari.",
      icerik: yogurtTablosu,
    },
    {
      id: "kaymak",
      etiket: "Sut Kaymagi",
      baslik: "Sut Kaymagi Uretimleri",
      aciklama: "Secilen donemin sut kaymagi uretim kayitlari.",
      icerik: sutKaymagiTablosu,
    },
    {
      id: "tanimlar",
      etiket: "Tanimlar",
      baslik: "Tanim Listeleri",
      aciklama: "Musteriler, urunler, ciftlikler ve sekme yetkileri.",
      icerik: tanimlarTablosu,
    },
  ];

  const html = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sultankoy V3 Rapor Yedegi</title>
    <style>
      :root {
        --bg: #eef3f8;
        --card: #ffffff;
        --text: #122033;
        --muted: #5b6b80;
        --line: #d7e1ec;
        --brand: #2563eb;
        --brand-soft: #dbeafe;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        background: linear-gradient(180deg, #f7fafc 0%, var(--bg) 100%);
        color: var(--text);
      }
      .page {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px 14px 40px;
      }
      .hero {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 18px;
        box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
        margin-bottom: 16px;
      }
      .hero h1 {
        margin: 0 0 8px;
        font-size: 28px;
        color: var(--brand);
      }
      .hero p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      .chip {
        background: var(--brand-soft);
        color: var(--brand);
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
      }
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .period-picker {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 700;
      }
      .period-picker select {
        border: none;
        background: transparent;
        color: var(--text);
        font-size: 13px;
        font-weight: 700;
        outline: none;
        cursor: pointer;
      }
      .nav {
        display: flex;
        gap: 8px;
        overflow: auto;
        padding-bottom: 8px;
      }
      .nav button {
        white-space: nowrap;
        background: var(--card);
        color: var(--text);
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.18s ease;
      }
      .nav button.active {
        background: var(--brand);
        color: #fff;
        border-color: var(--brand);
      }
      .section {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px;
        margin-bottom: 14px;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
      }
      .section.hidden {
        display: none;
      }
      .period-block.hidden {
        display: none;
      }
      .section-head {
        margin-bottom: 12px;
      }
      .section-head h2 {
        margin: 0 0 6px;
        font-size: 20px;
      }
      .section-head p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
        font-size: 13px;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      }
      .card-label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .card-value {
        font-size: 22px;
        font-weight: 800;
        color: var(--brand);
      }
      .table-wrap {
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 14px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 720px;
      }
      th, td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        font-size: 13px;
        vertical-align: top;
      }
      th {
        background: #f8fafc;
        color: #3b82f6;
        position: sticky;
        top: 0;
        z-index: 1;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .footer {
        text-align: center;
        color: var(--muted);
        font-size: 12px;
        padding-top: 10px;
      }
      @media (max-width: 720px) {
        .page { padding: 14px 10px 28px; }
        .hero h1 { font-size: 24px; }
        .section { padding: 14px; }
        .toolbar { align-items: stretch; }
        .period-picker {
          width: 100%;
          justify-content: space-between;
        }
        table { min-width: 620px; }
      }
      @media print {
        body { background: #fff; }
        .page { max-width: none; padding: 0; }
        .hero, .section { box-shadow: none; break-inside: avoid; }
        .toolbar { display: none; }
        .section.hidden { display: block; }
        .period-block.hidden { display: block; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="hero">
        <h1>SULTANKOY V3 RAPOR YEDEGI</h1>
        <p>Bu dosya tek basina calisir. Telefon ve bilgisayarda internet gerektirmeden tarayicida acilabilir. Ustteki donem secicisinden ayi degistirip secilen donemin verilerini tek dosya icinde gorebilirsin.</p>
        <div class="meta">
          <span class="chip">Alinma: ${escapeHtml(veri.alindiTarih)}</span>
          <span class="chip" id="selected-period-chip">Secili Donem: ${escapeHtml(varsayilanDonem)}</span>
          <span class="chip">Kaynak: ${escapeHtml(veri.kaynak)}</span>
        </div>
      </header>

      <div class="toolbar">
        <label class="period-picker">
          <span>Donem</span>
          <select id="period-select">
            ${secilebilirDonemler
              .map(
                (donem) =>
                  `<option value="${escapeHtml(donem)}"${donem === varsayilanDonem ? " selected" : ""}>${escapeHtml(donem)}</option>`,
              )
              .join("")}
          </select>
        </label>

        <nav class="nav">
          ${htmlBolumler
            .map(
              (bolum, index) =>
                `<button type="button" class="${index === 0 ? "active" : ""}" data-target="${escapeHtml(bolum.id)}">${escapeHtml(bolum.etiket)}</button>`,
            )
            .join("")}
        </nav>
      </div>

      ${htmlBolumler
        .map((bolum, index) =>
          htmlBolum(
            bolum.id,
            bolum.baslik,
            bolum.icerik,
            bolum.aciklama,
          ).replace('class="section"', `class="section${index === 0 ? "" : " hidden"}"`),
        )
        .join("")}

      <div class="footer">Sultankoy V3 HTML rapor yedegi • Tek dosya • Offline acilabilir</div>
    </main>
    <script>
      (function () {
        const buttons = Array.from(document.querySelectorAll('.nav button[data-target]'));
        const sections = Array.from(document.querySelectorAll('.section[data-section]'));
        const periodSelect = document.getElementById('period-select');
        const periodChip = document.getElementById('selected-period-chip');
        const periodBlocks = Array.from(document.querySelectorAll('.period-block[data-period]'));

        const activate = (target) => {
          buttons.forEach((button) => {
            button.classList.toggle('active', button.dataset.target === target);
          });
          sections.forEach((section) => {
            section.classList.toggle('hidden', section.dataset.section !== target);
          });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        const setPeriod = (period) => {
          periodBlocks.forEach((block) => {
            block.classList.toggle('hidden', block.dataset.period !== period);
          });
          if (periodChip) {
            periodChip.textContent = 'Secili Donem: ' + period;
          }
        };

        buttons.forEach((button) => {
          button.addEventListener('click', () => {
            if (button.dataset.target) activate(button.dataset.target);
          });
        });

        if (periodSelect) {
          periodSelect.addEventListener('change', function () {
            setPeriod(this.value);
          });
          setPeriod(periodSelect.value);
        }
      })();
    </script>
  </body>
</html>`;

  dosyaIndir(
    html,
    `sultankoy-rapor-yedegi-${yedekDosyaTarihi(veri.alindiTarih)}.html`,
    "text/html;charset=utf-8",
  );
};
