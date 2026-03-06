import * as XLSX from "xlsx";
import type { OzetKart, OzetSatiri, PersonelOzeti, YedekVerisi } from "../types/app";
import { dosyaIndir } from "../utils/format";

const sheetEkle = (workbook: XLSX.WorkBook, ad: string, veri: Array<Record<string, unknown>>) => {
  const sheet = XLSX.utils.json_to_sheet(veri.length > 0 ? veri : [{ Bilgi: "Kayıt yok" }]);
  XLSX.utils.book_append_sheet(workbook, sheet, ad.slice(0, 31));
};

const ozetKartlariniCevir = (kartlar: OzetKart[]) =>
  kartlar.map((item) => ({
    Baslik: item.baslik,
    Deger: item.deger,
  }));

const ozetSatirlariniCevir = (kayitlar: OzetSatiri[]) =>
  kayitlar.map((item) => ({
    Isim: item.isim,
    Deger: item.deger,
  }));

const personelCevir = (kayitlar: PersonelOzeti[]) =>
  kayitlar.map((item) => ({
    Personel: item.isim,
    Tahsilat: item.tahsilat,
    Gider: item.gider,
    KasayaDevir: item.kasayaDevir,
    NetKalan: item.net,
    AcikBakiye: item.acikBakiye,
    DevirNet: item.devirNet,
    DevirAcik: item.devirAcik,
  }));

export const yedegiJsonIndir = (veri: YedekVerisi) => {
  dosyaIndir(
    JSON.stringify(veri, null, 2),
    `sultankoy-yedek-${veri.aktifDonem}.json`,
    "application/json;charset=utf-8",
  );
};

export const yedegiExcelIndir = (veri: YedekVerisi) => {
  const workbook = XLSX.utils.book_new();

  sheetEkle(workbook, "Ozet", ozetKartlariniCevir(veri.ozetKartlari));
  sheetEkle(workbook, "Bayi Borclari", ozetSatirlariniCevir(veri.bayiBorclari));
  sheetEkle(workbook, "Personel Ozetleri", personelCevir(veri.personelOzetleri));
  sheetEkle(workbook, "Sut", veri.sutList as unknown as Array<Record<string, unknown>>);
  sheetEkle(workbook, "Satis Fisleri", veri.satisFisList as unknown as Array<Record<string, unknown>>);
  sheetEkle(workbook, "Satis Analiz", veri.satisList as unknown as Array<Record<string, unknown>>);
  sheetEkle(workbook, "Gider", veri.giderList as unknown as Array<Record<string, unknown>>);
  sheetEkle(workbook, "Uretim", veri.uretimList as unknown as Array<Record<string, unknown>>);
  sheetEkle(workbook, "Musteriler", veri.bayiler as unknown as Array<Record<string, unknown>>);
  sheetEkle(workbook, "Urunler", veri.urunler as unknown as Array<Record<string, unknown>>);
  sheetEkle(workbook, "Ciftlikler", veri.ciftlikler as unknown as Array<Record<string, unknown>>);
  sheetEkle(workbook, "Cop Kutusu", veri.copKutusuList as unknown as Array<Record<string, unknown>>);
  sheetEkle(workbook, "Yetkiler", veri.tabYetkileri as unknown as Array<Record<string, unknown>>);

  XLSX.writeFile(workbook, `sultankoy-yedek-${veri.aktifDonem}.xlsx`);
};
