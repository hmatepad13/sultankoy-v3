import * as XLSX from "xlsx";

export type ExcelSheet = {
  name: string;
  rows: Array<Record<string, unknown>>;
};

const KAYIT_YOK = [{ Bilgi: "Kayit yok" }];

export const excelDosyasiIndir = (dosyaAdi: string, sayfalar: ExcelSheet[]) => {
  const workbook = XLSX.utils.book_new();

  sayfalar.forEach((sayfa) => {
    const sheet = XLSX.utils.json_to_sheet(sayfa.rows.length > 0 ? sayfa.rows : KAYIT_YOK);
    XLSX.utils.book_append_sheet(workbook, sheet, sayfa.name.slice(0, 31));
  });

  XLSX.writeFile(workbook, dosyaAdi);
};
