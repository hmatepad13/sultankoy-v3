import type { ActiveAyarTab, AppTabId, SekmeYetkiMap } from "../types/app";

export const TEMA_RENGI = "#2563eb";

export const GIDER_TURLERI = [
  "Araç Yakıt",
  "Süt Ödemesi",
  "Yemek",
  "Sarf Malzeme",
  "Genel Gider",
  "Nakliye",
  "Maaş",
  "Araç Bakım",
  "Elektrik Ödemesi",
  "Süt Katkıları",
  "Tamirat Tadilat",
  "Katı Yakacak",
  "Sermaye Girişi",
  "Kar Paylaşımı",
  "Kova Satışı",
  "süt nakliye",
  "yoğurt nakliye",
  "tahsilat",
  "banka kesintisi",
] as const;

export const TOPLU_MUSTERILER = [
  "Batman Bayi",
  "Cizre Bayi",
  "Silopi Bayi",
  "Elazığ Bayi",
  "Siirt Bayi",
  "Mardin Bayi",
  "Alkan et",
  "Aras Peynircilik",
  "Aren seyrantepe",
  "Aren winston",
  "Armola",
  "Aspava",
  "Aydar Peynircilik",
  "Aziz",
  "Bademci fabrika",
  "Bademci sultan",
  "Bademci winston",
  "Banvit kasap",
  "Bereket",
  "Big Gross",
  "Cengiz bakkal bağlar",
  "Cengiz market bağcılar",
  "Deniz bakkal",
  "Ecrin market",
  "Erdi kahve",
  "Ersoy gross",
  "Esin Market",
  "Gündüz Şarküteri",
  "Güneydoğu peynircilik",
  "İade imha",
  "Kadir Market",
  "Lop Et",
  "Mekke baharat",
  "Nero Gross",
  "Perakende",
  "Polat şarküteri",
  "Sayar et",
  "Serhat",
  "Seyran gross",
  "Surkent",
  "Şahin et",
  "Şerif Market",
  "Tatvan Şarküteri",
  "Tunç Şarküteri",
  "Umut market",
  "Yeşilbahçe baharat",
  "Yıldız market",
  "Yunomar Diclekent",
  "Yunomar Havaalanı",
] as const;

export const TAB_TANIMLARI: Array<{ id: AppTabId; ikon: string; etiket: string }> = [
  { id: "ozet", ikon: "📊", etiket: "ÖZET" },
  { id: "sut", ikon: "🥛", etiket: "SÜT" },
  { id: "uretim", ikon: "🏭", etiket: "ÜRETİM" },
  { id: "satis", ikon: "💰", etiket: "SATIŞ" },
  { id: "gider", ikon: "💸", etiket: "GİDER" },
  { id: "analiz", ikon: "📈", etiket: "ANALİZ" },
  { id: "ayarlar", ikon: "⚙️", etiket: "AYARLAR" },
];

export const AYAR_TAB_TANIMLARI: Array<{ id: ActiveAyarTab; etiket: string; renk?: string }> = [
  { id: "musteriler", etiket: "Müşteriler" },
  { id: "urunler", etiket: "Ürünler" },
  { id: "ciftlikler", etiket: "Çiftlikler" },
  { id: "gider_turleri", etiket: "Gider Türleri" },
  { id: "depolama", etiket: "Depolama", renk: "#0369a1" },
  { id: "yedekleme", etiket: "Yedekleme", renk: "#0f766e" },
  { id: "yetkiler", etiket: "Yetkiler", renk: "#7c3aed" },
  { id: "cop_kutusu", etiket: "Çöp Kutusu", renk: "#dc2626" },
];

export const VARSAYILAN_SEKME_YETKILERI: SekmeYetkiMap = {
  ozet: true,
  sut: true,
  uretim: true,
  satis: true,
  gider: true,
  analiz: true,
  ayarlar: true,
};

export const ADMIN_KULLANICILARI = (import.meta.env.VITE_ADMIN_USERS || "admin")
  .split(",")
  .map((item: string) => item.trim().toLowerCase())
  .filter(Boolean);
