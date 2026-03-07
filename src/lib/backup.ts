import * as XLSX from "xlsx";
import type { OzetKart, OzetSatiri, PersonelOzeti, SatisFis, Uretim, YedekVerisi } from "../types/app";
import { dosyaIndir, normalizeUsername } from "../utils/format";

const kayitYok = [{ Bilgi: "Kayit yok" }];

const sheetEkle = (workbook: XLSX.WorkBook, ad: string, veri: Array<Record<string, unknown>>) => {
  const sheet = XLSX.utils.json_to_sheet(veri.length > 0 ? veri : kayitYok);
  XLSX.utils.book_append_sheet(workbook, sheet, ad.slice(0, 31));
};

const donemGetir = (tarih?: string | null) => (tarih ? tarih.substring(0, 7) : "");
const kisaTarih = (tarih?: string | null) => (tarih ? tarih.split("-").reverse().join(".") : "");
const kisiGetir = (deger?: string | null) => normalizeUsername(deger);

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

const odemeTurunuNormalizeEt = (odemeTuru?: string | null) =>
  String(odemeTuru || "").toLocaleUpperCase("tr-TR");

const satisBakiyeDurumuHesapla = (kayitlar: SatisFis[], sonDonem?: string) => {
  const bakiyeler: Record<string, number> = {};
  const map: Record<string, number> = {};

  satisFisleriniSirala(kayitlar).forEach((fis) => {
    const donem = donemGetir(fis.tarih);
    const bayi = fis.bayi || "";
    if (sonDonem && donem > sonDonem) return;
    if (!bayi || bayi === "SİSTEM İŞLEMİ") return;

    const odemeTuru = odemeTurunuNormalizeEt(fis.odeme_turu);
    const kalanBakiye = Number(fis.kalan_bakiye || 0);

    if (odemeTuru === "DEVİR" || odemeTuru === "DEVIR") {
      bakiyeler[bayi] = kalanBakiye;
    } else {
      bakiyeler[bayi] = (bakiyeler[bayi] || 0) + kalanBakiye;
    }

    if (fis.id) {
      map[String(fis.id)] = bakiyeler[bayi];
    }
  });

  return { bakiyeler, map };
};

const satisFisToplamBorcMapOlustur = (kayitlar: SatisFis[]) => {
  return satisBakiyeDurumuHesapla(kayitlar).map;
};

const donemOzetiOlustur = (veri: YedekVerisi) => {
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

  return Array.from(donemler)
    .sort()
    .reverse()
    .map((donem) => {
      const donemSutKayitlari = veri.sutList.filter((item) => donemGetir(item.tarih) === donem);
      const donemSatisFisleri = veri.satisFisList.filter((item) => donemGetir(item.tarih) === donem);
      const donemSatisSatirlari = veri.satisList.filter((item) => donemGetir(item.tarih) === donem);
      const donemGiderleri = veri.giderList.filter((item) => donemGetir(item.tarih) === donem);
      const yogurtKayitlari = veri.uretimList.filter((item) => donemGetir(item.tarih) === donem && (item.uretim_tipi || "yogurt") === "yogurt");
      const sutKaymagiKayitlari = veri.uretimList.filter((item) => donemGetir(item.tarih) === donem && item.uretim_tipi === "sut_kaymagi");
      const donemSonuBorclar = satisBakiyeDurumuHesapla(veri.satisFisList, donem).bakiyeler;
      const donemSatisToplami = donemSatisFisleri
        .filter((item) => {
          const odemeTuru = odemeTurunuNormalizeEt(item.odeme_turu);
          return odemeTuru !== "DEVİR" &&
            odemeTuru !== "DEVIR" &&
            odemeTuru !== "PERSONEL DEVİR" &&
            odemeTuru !== "PERSONEL DEVIR" &&
            odemeTuru !== "KASAYA DEVİR" &&
            odemeTuru !== "KASAYA DEVIR";
        })
        .reduce((toplam, item) => toplam + Number(item.toplam_tutar || 0), 0);
      const sutcuyeBorc = donemSutKayitlari.reduce((toplam, item) => toplam + Number(item.toplam_tl || 0), 0) -
        donemGiderleri
          .filter((item) => String(item.tur || "").toLocaleLowerCase("tr-TR") === "süt ödemesi")
          .reduce((toplam, item) => toplam + Number(item.tutar || 0), 0);

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

export const yedegiJsonIndir = (veri: YedekVerisi) => {
  dosyaIndir(
    JSON.stringify(veri, null, 2),
    `sultankoy-yedek-${veri.aktifDonem}.json`,
    "application/json;charset=utf-8",
  );
};

export const yedegiExcelIndir = (veri: YedekVerisi) => {
  const workbook = XLSX.utils.book_new();
  const satisFisToplamBorcMap = satisFisToplamBorcMapOlustur(veri.satisFisList);

  const yedekBilgisi = [
    { Alan: "Alinma Tarihi", Deger: veri.alindiTarih },
    { Alan: "Aktif Donem", Deger: veri.aktifDonem },
    { Alan: "Yetki Kaynagi", Deger: veri.kaynak },
  ];

  const sutSayfasi = veri.sutList.map((item) => ({
    Donem: donemGetir(item.tarih),
    Tarih: kisaTarih(item.tarih),
    Ciftlik: item.ciftlik,
    KG: Number(item.kg || 0),
    Fiyat: Number(item.fiyat || 0),
    Tutar: Number(item.toplam_tl || 0),
    Kisi: kisiGetir(item.ekleyen),
    Aciklama: item.aciklama || "",
  }));

  const satisFisleriSayfasi = veri.satisFisList.map((item) => {
    const { teslimAlan, aciklama } = fisAciklamasiniAyir(item.aciklama);
    return {
      Donem: donemGetir(item.tarih),
      Tarih: kisaTarih(item.tarih),
      "Fis No": item.fis_no,
      Bayi: item.bayi,
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
    Bayi: item.bayi,
    Urun: item.urun,
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
  sheetEkle(workbook, "Donemler", donemOzetiOlustur(veri));
  sheetEkle(workbook, "Ozet", ozetKartlariniCevir(veri.ozetKartlari, veri.aktifDonem));
  sheetEkle(workbook, "Musteri Borclari", ozetSatirlariniCevir(veri.bayiBorclari));
  sheetEkle(workbook, "Personel Ozetleri", personelCevir(veri.personelOzetleri));
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

  XLSX.writeFile(workbook, `sultankoy-yedek-${veri.aktifDonem}.xlsx`);
};
