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

const donemGetir = (tarih?: string | null) => (tarih ? tarih.substring(0, 7) : "");
const kisaTarih = (tarih?: string | null) => (tarih ? tarih.split("-").reverse().join(".") : "");
const kisiGetir = (deger?: string | null) => normalizeUsername(deger);
const sistemIslemiMi = (bayi?: string | null) => (bayi || "") === SISTEM_ISLEMI;

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

const satisBakiyeDurumuHesapla = (kayitlar: SatisFis[], sonDonem?: string) => {
  const bakiyeler: Record<string, number> = {};
  const map: Record<string, number> = {};

  satisFisleriniSirala(kayitlar).forEach((fis) => {
    const donem = donemGetir(fis.tarih);
    const bayi = fis.bayi || "";
    if (sonDonem && donem > sonDonem) return;
    if (!bayi || sistemIslemiMi(bayi)) return;

    const kalanBakiye = Number(fis.kalan_bakiye || 0);

    if (cariDevirMi(fis.odeme_turu) || personelDevirMi(fis.odeme_turu)) {
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

const satisFisToplamBorcMapOlustur = (kayitlar: SatisFis[]) => satisBakiyeDurumuHesapla(kayitlar).map;

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
    const key = personelDevirMi(fis.odeme_turu) && sistemIslemiMi(fis.bayi)
      ? personelDevirKeyGetir(fis.aciklama)
      : kisiGetir(fis.ekleyen) || "Bilinmiyor";
    const kayit = personelKaydiGetir(map, key);

    if (kasayaDevirMi(fis.odeme_turu)) {
      kayit.kasayaDevir += Number(fis.tahsilat || 0);
      return;
    }

    if (personelDevirMi(fis.odeme_turu) && sistemIslemiMi(fis.bayi)) {
      kayit.devirNet += Number(fis.toplam_tutar || 0);
      kayit.devirAcik += Number(fis.kalan_bakiye || 0);
      return;
    }

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
  tumDonemleriGetir(veri).flatMap((donem) => {
    const { bakiyeler } = satisBakiyeDurumuHesapla(veri.satisFisList, donem);
    return Object.entries(bakiyeler)
      .filter(([, borc]) => Math.abs(borc) > 0.01)
      .sort(([, borcA], [, borcB]) => borcB - borcA)
      .map(([musteri, borc]) => ({
        Donem: donem,
        Musteri: musteri,
        Borc: borc,
      }));
  });

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
  tumDonemleriGetir(veri).map((donem) => {
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
    const donemSonuBorclar = satisBakiyeDurumuHesapla(veri.satisFisList, donem).bakiyeler;
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
  <section id="${escapeHtml(id)}" class="section">
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
  const satisFisToplamBorcMap = satisFisToplamBorcMapOlustur(veri.satisFisList);
  const donemMusteriBorclari = donemBazliMusteriBorclariOlustur(veri);
  const donemPersonelOzetleri = donemBazliPersonelOzetleriOlustur(veri);

  const yedekBilgisi = [
    { Alan: "Alinma Tarihi", Deger: veri.alindiTarih },
    { Alan: "Aktif Donem", Deger: veri.aktifDonem },
    { Alan: "Yetki Kaynagi", Deger: veri.kaynak },
    { Alan: "Kapsam", Deger: "Tum donemler" },
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

  XLSX.writeFile(workbook, `sultankoy-yedek-tum-donemler-${yedekDosyaTarihi(veri.alindiTarih)}.xlsx`);
};

export const yedegiHtmlIndir = (veri: YedekVerisi) => {
  const satisFisToplamBorcMap = satisFisToplamBorcMapOlustur(veri.satisFisList);
  const donemOzetleri = donemOzetiOlustur(veri);
  const donemMusteriBorclari = donemBazliMusteriBorclariOlustur(veri);
  const donemPersonelOzetleri = donemBazliPersonelOzetleriOlustur(veri);
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

  const aktifOzetKartlari = htmlKartlar([
    { baslik: "Aktif Donem", deger: veri.aktifDonem },
    ...veri.ozetKartlari.map((item) => ({ baslik: item.baslik, deger: fSayi(item.deger) })),
  ]);

  const aktifMusteriTablosu = htmlTablo(
    ["Musteri", "Borc"],
    veri.bayiBorclari.map((item) => ({
      Musteri: item.isim,
      Borc: item.deger,
    })),
  );

  const aktifPersonelTablosu = htmlTablo(
    ["Personel", "Satis", "Tahsilat", "Gider", "Kasaya Devir", "Net", "Acik Bakiye"],
    veri.personelOzetleri.map((item) => ({
      Personel: item.isim,
      Satis: item.satis,
      Tahsilat: item.tahsilat,
      Gider: item.gider,
      "Kasaya Devir": item.kasayaDevir,
      Net: item.net,
      "Acik Bakiye": item.acikBakiye,
    })),
  );

  const donemOzetTablosu = htmlTablo(donemOzetBasliklari, donemOzetleri as Array<Record<string, unknown>>);

  const donemMusteriTablosu = htmlTablo(
    ["Donem", "Musteri", "Borc"],
    donemMusteriBorclari.map((item) => ({
      Donem: item.Donem,
      Musteri: item.Musteri,
      Borc: item.Borc,
    })),
  );

  const donemPersonelTablosu = htmlTablo(
    ["Donem", "Personel", "Satis", "Tahsilat", "Gider", "Kasaya Devir", "Net", "Acik Bakiye"],
    donemPersonelOzetleri.map((item) => ({
      Donem: item.Donem,
      Personel: item.Personel,
      Satis: item.Satis,
      Tahsilat: item.Tahsilat,
      Gider: item.Gider,
      "Kasaya Devir": item["Kasaya Devir"],
      Net: item.Net,
      "Acik Bakiye": item["Acik Bakiye"],
    })),
  );

  const satisFisleriTablosu = htmlTablo(
    ["Tarih", "Fis No", "Bayi", "Tutar", "Tahsilat", "Bu Fisten Kalan", "Toplam Borc", "Odeme Turu", "Teslim Alan", "Aciklama", "Kisi"],
    veri.satisFisList.map((item) => {
      const detay = fisAciklamasiniAyir(item.aciklama);
      return {
        Tarih: kisaTarih(item.tarih),
        "Fis No": item.fis_no,
        Bayi: item.bayi,
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
  );

  const satisDetayTablosu = htmlTablo(
    ["Tarih", "Bayi", "Urun", "Adet", "KG", "Fiyat", "Tutar", "Kisi"],
    veri.satisList.map((item) => ({
      Tarih: kisaTarih(item.tarih),
      Bayi: item.bayi,
      Urun: item.urun,
      Adet: Number(item.adet || 0),
      KG: Number(item.toplam_kg || 0),
      Fiyat: Number(item.fiyat || 0),
      Tutar: Number(item.tutar || 0),
      Kisi: kisiGetir(item.ekleyen),
    })),
  );

  const sutTablosu = htmlTablo(
    ["Tarih", "Ciftlik", "KG", "Fiyat", "Tutar", "Kisi", "Aciklama"],
    veri.sutList.map((item) => ({
      Tarih: kisaTarih(item.tarih),
      Ciftlik: item.ciftlik,
      KG: Number(item.kg || 0),
      Fiyat: Number(item.fiyat || 0),
      Tutar: Number(item.toplam_tl || 0),
      Kisi: kisiGetir(item.ekleyen),
      Aciklama: item.aciklama || "",
    })),
  );

  const giderTablosu = htmlTablo(
    ["Tarih", "Tur", "Tutar", "Kisi", "Aciklama"],
    veri.giderList.map((item) => ({
      Tarih: kisaTarih(item.tarih),
      Tur: item.tur,
      Tutar: Number(item.tutar || 0),
      Kisi: kisiGetir(item.ekleyen),
      Aciklama: item.aciklama || "",
    })),
  );

  const yogurtTablosu = htmlTablo(
    ["Tarih", "Giren KG", "Cikan KG", "3'lük", "5'lik", "Maliyet", "Kar", "Kisi", "Aciklama"],
    veri.uretimList
      .filter((item) => (item.uretim_tipi || "yogurt") === "yogurt")
      .map((item) => ({
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
  );

  const sutKaymagiTablosu = htmlTablo(
    ["Tarih", "Giren KG", "Cikan KG", "2'lik", "3'lük", "Maliyet", "Kar", "Kisi", "Aciklama"],
    veri.uretimList
      .filter((item) => item.uretim_tipi === "sut_kaymagi")
      .map((item) => ({
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
      .nav {
        display: flex;
        gap: 8px;
        overflow: auto;
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .nav a {
        text-decoration: none;
        white-space: nowrap;
        background: var(--card);
        color: var(--text);
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 700;
      }
      .section {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px;
        margin-bottom: 14px;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
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
        table { min-width: 620px; }
      }
      @media print {
        body { background: #fff; }
        .page { max-width: none; padding: 0; }
        .hero, .section { box-shadow: none; break-inside: avoid; }
        .nav { display: none; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="hero">
        <h1>SULTANKOY V3 RAPOR YEDEGI</h1>
        <p>Bu dosya tek basina calisir. Telefon ve bilgisayarda internet gerektirmeden tarayicida acilabilir. Teknik geri yukleme icin JSON yedegi saklanmaya devam edilmelidir.</p>
        <div class="meta">
          <span class="chip">Alinma: ${escapeHtml(veri.alindiTarih)}</span>
          <span class="chip">Aktif Donem: ${escapeHtml(veri.aktifDonem)}</span>
          <span class="chip">Kaynak: ${escapeHtml(veri.kaynak)}</span>
        </div>
      </header>

      <nav class="nav">
        <a href="#ozet">Ozet</a>
        <a href="#donemler">Donemler</a>
        <a href="#musteriler">Musteri Borclari</a>
        <a href="#personel">Personel</a>
        <a href="#satis-fisleri">Satis Fisleri</a>
        <a href="#satis-detay">Satis Detay</a>
        <a href="#sut">Sut</a>
        <a href="#gider">Gider</a>
        <a href="#yogurt">Yogurt Uretim</a>
        <a href="#kaymak">Sut Kaymagi</a>
        <a href="#tanimlar">Tanimlar</a>
      </nav>

      ${htmlBolum("ozet", "Aktif Donem Ozeti", aktifOzetKartlari, "Uygulamada o anda gorulen ust toplamlar.")}
      ${htmlBolum("donemler", "Donem Ozetleri", donemOzetTablosu, "Tum donemlerin toplu gorunumu.")}
      ${htmlBolum("musteriler", "Musteri Borclari", aktifMusteriTablosu + donemMusteriTablosu, "Aktif donem ve tum donem bakiyeleri birlikte listelenir.")}
      ${htmlBolum("personel", "Personel Ozetleri", aktifPersonelTablosu + donemPersonelTablosu, "Tahsilat, gider, kasaya devir ve net bakiye takibi.")}
      ${htmlBolum("satis-fisleri", "Satis Fisleri", satisFisleriTablosu, "Kullaniciya yakin fis listesi gorunumu.")}
      ${htmlBolum("satis-detay", "Satis Detaylari", satisDetayTablosu, "Urun bazli satis satirlari.")}
      ${htmlBolum("sut", "Sut Hareketleri", sutTablosu)}
      ${htmlBolum("gider", "Gider Hareketleri", giderTablosu)}
      ${htmlBolum("yogurt", "Yogurt Uretimleri", yogurtTablosu)}
      ${htmlBolum("kaymak", "Sut Kaymagi Uretimleri", sutKaymagiTablosu)}
      ${htmlBolum("tanimlar", "Tanim Listeleri", tanimlarTablosu, "Musteriler, urunler, ciftlikler ve sekme yetkileri.")}

      <div class="footer">Sultankoy V3 HTML rapor yedegi • Tek dosya • Offline acilabilir</div>
    </main>
  </body>
</html>`;

  dosyaIndir(
    html,
    `sultankoy-rapor-yedegi-${yedekDosyaTarihi(veri.alindiTarih)}.html`,
    "text/html;charset=utf-8",
  );
};
