export type AppTabId = "ozet" | "sut" | "uretim" | "satis" | "gider" | "analiz" | "ayarlar";

export type ActiveAyarTab =
  | "musteriler"
  | "urunler"
  | "ciftlikler"
  | "cop_kutusu"
  | "yedekleme"
  | "yetkiler";

export interface Ciftlik {
  id: string;
  isim: string;
}

export interface Bayi {
  id: string;
  isim: string;
}

export interface Urun {
  id: string;
  isim: string;
  fiyat?: number | string;
}

export interface SutGiris {
  id?: string;
  tarih: string;
  ciftlik: string;
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
  urun: string;
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
  toplam_tutar: number;
  tahsilat: number;
  kalan_bakiye: number;
  odeme_turu: string;
  aciklama: string;
  ekleyen?: string;
}

export interface Gider {
  id?: string;
  tarih: string;
  tur: string;
  aciklama: string;
  tutar: number | string;
  ekleyen?: string;
}

export interface Uretim {
  id?: string;
  tarih: string;
  cig_sut: number | string;
  sut_fiyat: number | string;
  sut_tozu: number | string;
  sut_tozu_fiyat: number | string;
  tereyag: number | string;
  tereyag_fiyat: number | string;
  katki_kg: number | string;
  katki_fiyat: number | string;
  su: number | string;
  kova_3_adet: number | string;
  kova_3_fiyat: number | string;
  kova_5_adet: number | string;
  kova_5_fiyat: number | string;
  cikti_3kg: number | string;
  satis_3_fiyat: number | string;
  cikti_5kg: number | string;
  satis_5_fiyat: number | string;
  toplam_kg?: number;
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
  bayiler: Bayi[];
  urunler: Urun[];
  ciftlikler: Ciftlik[];
  copKutusuList: CopKutusu[];
  tabYetkileri: KullaniciSekmeYetkisi[];
}
