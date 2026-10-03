// Hem TR gorunumu (1.234,56) hem formun kanonik degeri (1234.56).
// Kanonik degeri ikinci kez temizlemek kuruslari kaybettirmemelidir.
export const paraGirdisiniTemizle = (value: string) => {
  const ham = String(value || "").replace(/[^\d,.-]/g, "");
  const negatif = ham.startsWith("-");
  const isaretsiz = ham.replace(/-/g, "");
  let tamKisim: string;
  let ondalik: string | undefined;
  if (isaretsiz.includes(",")) {
    const [tam = "", ...parcalar] = isaretsiz.replace(/\./g, "").split(",");
    tamKisim = tam;
    ondalik = parcalar.join("").slice(0, 2);
  } else if (/^\d{1,3}(\.\d{3})+$/.test(isaretsiz)) {
    tamKisim = isaretsiz.replace(/\./g, "");
  } else {
    const nokta = isaretsiz.lastIndexOf(".");
    tamKisim = (nokta < 0 ? isaretsiz : isaretsiz.slice(0, nokta)).replace(/\./g, "");
    if (nokta >= 0) ondalik = isaretsiz.slice(nokta + 1).slice(0, 2);
  }
  return `${negatif ? "-" : ""}${tamKisim}${ondalik !== undefined ? `.${ondalik}` : ""}`;
};

export const paraGirdisiniSayiyaCevir = (value: string) =>
  Number(paraGirdisiniTemizle(value)) || 0;
