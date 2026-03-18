export type AppTabId = "ozet" | "sut" | "uretim" | "sevkiyat" | "satis" | "gider" | "analiz" | "ayarlar";

export type ActiveAyarTab =
  | "hesap"
  | "musteriler"
  | "urunler"
  | "ciftlikler"
  | "gider_turleri"
  | "cop_kutusu"
  | "depolama"
  | "yedekleme"
  | "yetkiler"
  | "kullanici_yonetimi";

export interface AdminKullanici {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  role?: string;
  createdAt?: string | null;
  lastSignInAt?: string | null;
}

export interface Ciftlik {
  id: string;
  isim: string;
  aktif?: boolean | null;
}

export interface Bayi {
  id: string;
  isim: string;
  aktif?: boolean | null;
}

export interface Urun {
  id: string;
  isim: string;
  fiyat?: number | string;
  aktif?: boolean | null;
  sabit?: boolean | null;
}

export interface GiderTuru {
  id: string;
  isim: string;
}

export interface SevkiyatKaydi {
  id: string;
  tarih: string;
  kullanici: string;
  yogurt3kg: number;
  yogurt5kg: number;
  kaymak: number;
  createdAt?: string;
}

export interface SutGiris {
  id?: string;
  tarih: string;
  ciftlik: string;
  ciftlik_id?: string | null;
  kg: number | string;
  fiyat: number | string;
  toplam_tl?: number;
  aciklama: string;
  ekleyen?: string;
}

export interface SatisGiris {
  id?: string;
  fis_no?: string;
  tarih: string;
  bayi: string;
  bayi_id?: string | null;
  urun: string;
  urun_id?: string | null;
  adet: number | string;
  fiyat: number | string;
  toplam_kg?: number;
  bos_kova?: number | string;
  tutar?: number;
  aciklama: string;
  birim?: number;
  ekleyen?: string;
}

export interface SatisFis {
  id?: string;
  fis_no: string;
  tarih: string;
  bayi: string;
  bayi_id?: string | null;
  toplam_tutar: number;
  tahsilat: number;
  kalan_bakiye: number;
  odeme_turu: string;
  aciklama: string;
  ekleyen?: string;
  fis_gorseli?: string | null;
}

export interface Gider {
  id?: string;
  tarih: string;
  tur: string;
  aciklama: string;
  tutar: number | string;
  ekleyen?: string;
  gorsel?: string | null;
}

export interface Uretim {
  id?: string;
  tarih: string;
  uretim_tipi?: "yogurt" | "sut_kaymagi";
  cig_sut: number | string;
  sut_fiyat: number | string;
  sut_tozu: number | string;
  sut_tozu_fiyat: number | string;
  tereyag: number | string;
  tereyag_fiyat: number | string;
  katki_kg: number | string;
  katki_fiyat: number | string;
  su: number | string;
  su_fiyat?: number | string;
  krema?: number | string;
  krema_fiyat?: number | string;
  diger_adet?: number | string;
  diger_kg?: number | string;
  diger_fiyat?: number | string;
  paket_02_adet?: number | string;
  paket_02_fiyat?: number | string;
  paket_2_adet?: number | string;
  paket_2_fiyat?: number | string;
  paket_3_adet?: number | string;
  paket_3_fiyat?: number | string;
  cikti_02kg?: number | string;
  cikti_02kg_kg?: number | string;
  satis_02_fiyat?: number | string;
  kova_3_adet: number | string;
  kova_3_fiyat: number | string;
  kova_5_adet: number | string;
  kova_5_fiyat: number | string;
  cikti_2kg?: number | string;
  cikti_2kg_kg?: number | string;
  satis_2_fiyat?: number | string;
  cikti_3kg: number | string;
  cikti_3kg_kg?: number | string;
  satis_3_fiyat: number | string;
  cikti_5kg: number | string;
  cikti_5kg_kg?: number | string;
  satis_5_fiyat: number | string;
  toplam_kg?: number;
  cikan_toplam_kg?: number;
  toplam_maliyet?: number;
  kar?: number;
  aciklama: string;
  ekleyen?: string;
}

export interface CopKutusu {
  id?: string;
  tablo_adi: string;
  veri: unknown;
  silinme_tarihi?: string;
}

export interface SortConfig {
  key: string;
  direction: "asc" | "desc";
}

export interface FisDetaySatiri {
  adet: string;
  kg: string;
  fiyat: string;
}

export type FisDetayMap = Record<string, FisDetaySatiri>;

export type SekmeYetkiMap = Record<AppTabId, boolean>;

export interface KullaniciSekmeYetkisi {
  username: string;
  tabs: SekmeYetkiMap;
  updatedAt?: string;
}

export interface OzetKart {
  baslik: string;
  deger: number;
}

export interface OzetSatiri {
  isim: string;
  deger: number;
}

export interface PersonelOzeti {
  isim: string;
  satis: number;
  tahsilat: number;
  gider: number;
  kasayaDevir: number;
  net: number;
  acikBakiye: number;
  devirNet: number;
  devirAcik: number;
}

export interface YedekVerisi {
  alindiTarih: string;
  aktifDonem: string;
  kaynak: "supabase" | "local";
  ozetKartlari: OzetKart[];
  bayiBorclari: OzetSatiri[];
  personelOzetleri: PersonelOzeti[];
  sutList: SutGiris[];
  satisFisList: SatisFis[];
  satisList: SatisGiris[];
  giderList: Gider[];
  uretimList: Uretim[];
  sevkiyatList?: SevkiyatKaydi[];
  bayiler: Bayi[];
  urunler: Urun[];
  ciftlikler: Ciftlik[];
  copKutusuList: CopKutusu[];
  tabYetkileri: KullaniciSekmeYetkisi[];
}

export interface DepolamaDurumu {
  databaseBytes: number;
  databaseTotalBytes: number;
  databaseRemainingBytes: number;
  imageBytes: number;
  imageTotalBytes: number;
  imageRemainingBytes: number;
  imageCount: number;
  updatedAt: string;
}
