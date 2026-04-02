export type AppTabId = "ozet" | "sut" | "uretim" | "sevkiyat" | "cek_senet" | "satis" | "gider" | "analiz" | "ayarlar";

export type ActiveAyarTab =
  | "hesap"
  | "performans"
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
  hesap_grubu?: string | null;
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
  id: string | number;
  tarih: string;
  kullanici: string;
  yogurt3kg: number;
  yogurt5kg: number;
  kaymak: number;
  ekleyen?: string;
  createdBy?: string | null;
  createdAt?: string;
}

export type CekSenetTur = "verilen_cek" | "alinan_cek" | "verilen_senet" | "alinan_senet";
export type CekSenetDurum = "bekliyor" | "tahsil_edildi" | "iade" | "iptal" | "karsiliksiz";

export interface CekSenetKaydi {
  id: string;
  tur: CekSenetTur;
  tarih: string;
  duzenleyen: string;
  tahTarihi: string;
  miktar: number;
  banka: string;
  durum: CekSenetDurum;
  tahsilEdilmeTarihi?: string;
  onYuzFoto?: string;
  arkaYuzFoto?: string;
  ekleyen?: string;
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
  gorsel?: string | null;
  created_at?: string | null;
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
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Gider {
  id?: string;
  tarih: string;
  tur: string;
  aciklama: string;
  tutar: number | string;
  ekleyen?: string;
  gorsel?: string | null;
  created_at?: string | null;
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
  silen_user_id?: string | null;
  silen_email?: string | null;
  geri_yuklendi?: boolean;
  geri_yukleme_tarihi?: string | null;
  geri_yukleyen_user_id?: string | null;
  geri_yukleyen_email?: string | null;
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

export interface StartupGunOzeti {
  gun: string;
  sessionCount: number;
  userCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  slow5sCount: number;
}

export interface StartupFetchPattern {
  fetchTableCount: number;
  fetchAllCount: number;
  firstInteractiveCount: number;
  sessionCount: number;
}

export interface StartupTableMetric {
  table: string;
  sampleCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  avgRowCount: number;
  maxRowCount: number;
}

export interface StartupRecentSession {
  createdAt: string;
  userEmail: string;
  sessionId: string;
  activeTab: string;
  aktifDonem: string;
  durationMs: number;
  fetchMs: number;
  renderMs: number;
  authMs: number | null;
}

export interface AppPerformanceMetric {
  olay: string;
  kategori: string;
  sonuc: string;
  sampleCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  avgKayitMs: number;
  avgYenilemeMs: number;
  avgImageMs: number;
  avgDetaySayisi: number;
}

export interface AppPerformanceRecent {
  createdAt: string;
  userEmail: string;
  olay: string;
  kategori: string;
  sonuc: string;
  toplamMs: number;
  kayitMs: number;
  yenilemeMs: number;
  gorselYuklemeMs: number;
  detaySayisi: number;
  hataMesaji: string;
}

export interface AppErrorMetric {
  islem: string;
  kategori: string;
  seviye: string;
  count: number;
  latestAt: string;
}

export interface AppErrorRecent {
  createdAt: string;
  userEmail: string;
  islem: string;
  kategori: string;
  seviye: string;
  mesaj: string;
  kayitRef: string;
}

export interface StartupLogDiagnostics {
  generatedAt: string;
  since: string;
  sessionCount: number;
  userCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  avgFetchMs: number;
  p50FetchMs: number;
  p95FetchMs: number;
  maxFetchMs: number;
  avgRenderMs: number;
  p50RenderMs: number;
  maxRenderMs: number;
  slow5sCount: number;
  slow10sCount: number;
  daily: StartupGunOzeti[];
  fetchPatterns: StartupFetchPattern[];
  tableMetrics: StartupTableMetric[];
  recentSessions: StartupRecentSession[];
  appPerformanceMetrics: AppPerformanceMetric[];
  appPerformanceRecent: AppPerformanceRecent[];
  appPerformanceCount: number;
  appErrorMetrics: AppErrorMetric[];
  appErrorRecent: AppErrorRecent[];
  appErrorCount: number;
}
