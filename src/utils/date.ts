export const getLocalDateString = () => {
  const tarih = new Date();
  tarih.setMinutes(tarih.getMinutes() - tarih.getTimezoneOffset());
  return tarih.toISOString().split("T")[0];
};

export const tarihtenDonemGetir = (tarih?: string | null) => {
  const temizTarih = String(tarih || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(temizTarih) ? temizTarih.slice(0, 7) : "";
};

export const tarihAktifDonemDisindaMi = (tarih?: string | null, aktifDonem?: string | null) => {
  const secilenDonem = tarihtenDonemGetir(tarih);
  const hedefDonem = String(aktifDonem || "").trim();
  return Boolean(secilenDonem && hedefDonem && secilenDonem !== hedefDonem);
};

export const aktifDonemDisiTarihUyariMetni = (tarih?: string | null, aktifDonem?: string | null) =>
  tarihAktifDonemDisindaMi(tarih, aktifDonem)
    ? `Seçilen tarih aktif dönem (${String(aktifDonem || "").trim()}) dışında.`
    : "";

export const aktifDonemDisiKayitOnayMetni = (tarih?: string | null, aktifDonem?: string | null) => {
  if (!tarihAktifDonemDisindaMi(tarih, aktifDonem)) return "";
  const secilenDonem = tarihtenDonemGetir(tarih);
  return secilenDonem
    ? `Bu kayıt ${secilenDonem} dönemine düşecek. Yine de kaydetmek istiyor musunuz?`
    : "";
};
