/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  GIDER_TURLERI,
  TAB_TANIMLARI,
  TEMA_RENGI,
} from "./constants/app";
import { yedegiExcelIndir, yedegiHtmlIndir, yedegiJsonIndir } from "./lib/backup";
import { adminMi, kullaniciYetkileriniKaydet, kullaniciYetkileriniYukle, kullaniciYetkisiniBul } from "./lib/permissions";
import { supabase } from "./lib/supabase";
import type {
  ActiveAyarTab,
  AdminKullanici,
  AppTabId,
  Bayi,
  Ciftlik,
  CopKutusu,
  DepolamaDurumu,
  FisDetayMap,
  Gider,
  GiderTuru,
  KullaniciSekmeYetkisi,
  OzetKart,
  PersonelOzeti,
  SatisFis,
  SatisGiris,
  SortConfig,
  SutGiris,
  Uretim,
  Urun,
  YedekVerisi,
} from "./types/app";
import { getLocalDateString } from "./utils/date";
import { normalizeUsername } from "./utils/format";

const URETIM_META_ETIKETI = "[URETIM_META]";
const SUPABASE_FREE_DATABASE_LIMIT_BYTES = 500_000_000;
const SUPABASE_FREE_STORAGE_LIMIT_BYTES = 1_000_000_000;

const sayiDegeri = (deger: unknown) => {
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (typeof deger === "string" && deger.trim() && !Number.isNaN(Number(deger))) return Number(deger);
  return 0;
};

const sayiVeyaBos = (deger: unknown) => {
  if (deger === null || deger === undefined || deger === "") return "";
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (typeof deger === "string") return deger;
  return "";
};

const adettenKg = (adet: unknown, birimKg: number) => sayiDegeri(adet) * birimKg;
const kgSatirTutari = (kg: unknown, fiyat: unknown) => sayiDegeri(kg) * sayiDegeri(fiyat);
const miktarSatirTutari = (kg: unknown, adet: unknown, fiyat: unknown) => {
  const kgDegeri = sayiDegeri(kg);
  const adetDegeri = sayiDegeri(adet);
  const miktar = kgDegeri > 0 ? kgDegeri : adetDegeri;
  return miktar * sayiDegeri(fiyat);
};

const uretimMetaAlanlari = [
  "uretim_tipi",
  "su_fiyat",
  "krema",
  "krema_fiyat",
  "diger_adet",
  "diger_kg",
  "diger_fiyat",
  "paket_2_adet",
  "paket_2_fiyat",
  "paket_3_adet",
  "paket_3_fiyat",
  "cikti_2kg",
  "cikti_2kg_kg",
  "satis_2_fiyat",
  "cikti_3kg_kg",
  "cikti_5kg_kg",
  "cikan_toplam_kg",
] as const;

const uretimAciklamasiniAyir = (hamAciklama?: string | null) => {
  const kaynak = hamAciklama || "";
  const index = kaynak.indexOf(URETIM_META_ETIKETI);

  if (index < 0) {
    return { not: kaynak, meta: {} as Partial<Uretim> };
  }

  const not = kaynak.slice(0, index).trim();
  const metaHam = kaynak.slice(index + URETIM_META_ETIKETI.length).trim();

  try {
    const meta = JSON.parse(metaHam) as Partial<Uretim>;
    return { not, meta };
  } catch {
    return { not: kaynak, meta: {} as Partial<Uretim> };
  }
};

const uretimMetaOlustur = (kayit: Partial<Uretim>) => {
  const meta = Object.fromEntries(
    uretimMetaAlanlari
      .filter((alan) => kayit[alan] !== undefined && kayit[alan] !== null && kayit[alan] !== "")
      .map((alan) => [alan, kayit[alan]]),
  );

  return Object.keys(meta).length ? `${URETIM_META_ETIKETI}${JSON.stringify(meta)}` : "";
};

const uretimAciklamasiniBirlestir = (not: string, kayit: Partial<Uretim>) => {
  const meta = uretimMetaOlustur(kayit);
  const temizNot = (not || "").trim();
  if (!meta) return temizNot;
  return temizNot ? `${temizNot}\n${meta}` : meta;
};

const uretimKaydiniNormalizeEt = (kayit: Partial<Uretim>) => {
  const { not, meta } = uretimAciklamasiniAyir(kayit.aciklama);
  return {
    ...kayit,
    ...meta,
    uretim_tipi: (meta.uretim_tipi || kayit.uretim_tipi || "yogurt") as Uretim["uretim_tipi"],
    su_fiyat: sayiVeyaBos(meta.su_fiyat),
    krema: sayiVeyaBos(meta.krema),
    krema_fiyat: sayiVeyaBos(meta.krema_fiyat),
    diger_adet: sayiVeyaBos(meta.diger_adet),
    diger_kg: sayiVeyaBos(meta.diger_kg),
    diger_fiyat: sayiVeyaBos(meta.diger_fiyat),
    paket_2_adet: sayiVeyaBos(meta.paket_2_adet),
    paket_2_fiyat: sayiVeyaBos(meta.paket_2_fiyat),
    paket_3_adet: sayiVeyaBos(meta.paket_3_adet),
    paket_3_fiyat: sayiVeyaBos(meta.paket_3_fiyat),
    cikti_2kg: sayiVeyaBos(meta.cikti_2kg),
    cikti_2kg_kg: sayiVeyaBos(meta.cikti_2kg_kg),
    satis_2_fiyat: sayiVeyaBos(meta.satis_2_fiyat),
    cikti_3kg_kg: sayiVeyaBos(meta.cikti_3kg_kg),
    cikti_5kg_kg: sayiVeyaBos(meta.cikti_5kg_kg),
    cikan_toplam_kg: sayiDegeri(meta.cikan_toplam_kg) || sayiDegeri(kayit.cikan_toplam_kg),
    aciklama: not,
  } as Uretim;
};

const uretimGirenToplamKg = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  const ortakToplam =
    sayiDegeri(kayit.cig_sut) +
    sayiDegeri(kayit.tereyag) +
    sayiDegeri(kayit.katki_kg) +
    sayiDegeri(kayit.su);

  if (tip === "sut_kaymagi") {
    return ortakToplam + sayiDegeri(kayit.krema) + sayiDegeri(kayit.diger_kg);
  }

  return ortakToplam + sayiDegeri(kayit.sut_tozu);
};

const uretimCikanToplamKg = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  if (tip === "sut_kaymagi") {
    return (sayiDegeri(kayit.cikti_2kg_kg) || adettenKg(kayit.cikti_2kg, 2)) + (sayiDegeri(kayit.cikti_3kg_kg) || adettenKg(kayit.cikti_3kg, 3));
  }
  return (sayiDegeri(kayit.cikti_3kg_kg) || adettenKg(kayit.cikti_3kg, 3)) + (sayiDegeri(kayit.cikti_5kg_kg) || adettenKg(kayit.cikti_5kg, 5));
};

const uretimMaliyetToplami = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  const ortakMaliyet =
    kgSatirTutari(kayit.cig_sut, kayit.sut_fiyat) +
    kgSatirTutari(kayit.tereyag, kayit.tereyag_fiyat) +
    kgSatirTutari(kayit.katki_kg, kayit.katki_fiyat) +
    kgSatirTutari(kayit.su, kayit.su_fiyat);

  if (tip === "sut_kaymagi") {
    return ortakMaliyet +
      kgSatirTutari(kayit.krema, kayit.krema_fiyat) +
      miktarSatirTutari(kayit.diger_kg, kayit.diger_adet, kayit.diger_fiyat) +
      sayiDegeri(kayit.paket_2_adet) * sayiDegeri(kayit.paket_2_fiyat) +
      sayiDegeri(kayit.paket_3_adet) * sayiDegeri(kayit.paket_3_fiyat);
  }

  return ortakMaliyet +
    kgSatirTutari(kayit.sut_tozu, kayit.sut_tozu_fiyat) +
    sayiDegeri(kayit.kova_3_adet) * sayiDegeri(kayit.kova_3_fiyat) +
    sayiDegeri(kayit.kova_5_adet) * sayiDegeri(kayit.kova_5_fiyat);
};

const uretimSatisToplami = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  if (tip === "sut_kaymagi") {
    return sayiDegeri(kayit.cikti_2kg) * sayiDegeri(kayit.satis_2_fiyat) + sayiDegeri(kayit.cikti_3kg) * sayiDegeri(kayit.satis_3_fiyat);
  }
  return sayiDegeri(kayit.cikti_3kg) * sayiDegeri(kayit.satis_3_fiyat) + sayiDegeri(kayit.cikti_5kg) * sayiDegeri(kayit.satis_5_fiyat);
};

const satisFisleriniSirala = (kayitlar: Array<Partial<SatisFis>>) =>
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

const fisDevirMi = (fis: Partial<SatisFis>) => {
  const odemeTuru = odemeTurunuNormalizeEt(fis.odeme_turu);
  return odemeTuru === "DEVİR" || odemeTuru === "DEVIR" || odemeTuru === "PERSONEL DEVİR" || odemeTuru === "PERSONEL DEVIR";
};

const fisDonemDevirMi = (fis: Partial<SatisFis>) => {
  const odemeTuru = odemeTurunuNormalizeEt(fis.odeme_turu);
  return odemeTuru === "DEVİR" || odemeTuru === "DEVIR";
};

const fisPersonelDevirMi = (fis: Partial<SatisFis>) => {
  const odemeTuru = odemeTurunuNormalizeEt(fis.odeme_turu);
  return odemeTuru === "PERSONEL DEVİR" || odemeTuru === "PERSONEL DEVIR";
};

const fisKasayaDevirMi = (fis: Partial<SatisFis>) => {
  const odemeTuru = odemeTurunuNormalizeEt(fis.odeme_turu);
  return odemeTuru === "KASAYA DEVİR" || odemeTuru === "KASAYA DEVIR";
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

const sutOdemesiMi = (tur?: string | null) => giderTurunuNormalizeEt(tur).startsWith("sut odemesi");

const sutOdemesiCiftlikIsminiBul = (tur: string | null | undefined, ciftlikAdlari: string[]) => {
  const normalizeTur = giderTurunuNormalizeEt(tur);
  if (!normalizeTur.startsWith("sut odemesi")) return null;

  const adaylar = [...ciftlikAdlari].sort((a, b) => b.length - a.length);
  for (const isim of adaylar) {
    if (normalizeTur.includes(giderTurunuNormalizeEt(isim))) {
      return isim;
    }
  }

  return null;
};

const sutcuBorcunuHesapla = (sutKayitlari: SutGiris[], giderKayitlari: Gider[], sonDonem?: string) => {
  const toplamSutTutari = sutKayitlari.reduce((toplam, item) => {
    const donem = String(item.tarih || "").substring(0, 7);
    if (sonDonem && donem > sonDonem) return toplam;
    return toplam + Number(item.toplam_tl || 0);
  }, 0);

  const toplamSutOdemesi = giderKayitlari.reduce((toplam, item) => {
    const donem = String(item.tarih || "").substring(0, 7);
    if (sonDonem && donem > sonDonem) return toplam;
    if (!sutOdemesiMi(item.tur)) return toplam;
    return toplam + Number(item.tutar || 0);
  }, 0);

  return toplamSutTutari - toplamSutOdemesi;
};

const benzersizFisNoOlustur = (prefix: string, index = 0) => {
  const zaman = Date.now().toString(36).toUpperCase();
  const sira = index.toString().padStart(2, "0");
  const rastgele = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${zaman}${sira}${rastgele}`;
};

const gorunenFisNoOlustur = (fis?: { id?: string | number; fis_no?: string | null }) => {
  const idDegeri = Number(fis?.id);
  if (Number.isFinite(idDegeri) && idDegeri > 0) {
    return `F-${String(idDegeri).padStart(4, "0")}`;
  }

  const rakamlar = String(fis?.fis_no || "").replace(/\D/g, "");
  if (rakamlar) {
    return `F-${rakamlar.slice(-4).padStart(4, "0")}`;
  }

  return "F-0000";
};

const dosyaAdiIcinTemizle = (deger?: string | null) =>
  String(deger || "fis")
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "fis";

const uretimCikanToplamAdet = (kayit: Partial<Uretim>) => {
  const tip = kayit.uretim_tipi || "yogurt";
  if (tip === "sut_kaymagi") {
    return sayiDegeri(kayit.cikti_2kg) + sayiDegeri(kayit.cikti_3kg);
  }
  return sayiDegeri(kayit.cikti_3kg) + sayiDegeri(kayit.cikti_5kg);
};

const uretimNotunuKisalt = (not?: string | null, limit = 10) => {
  const temiz = String(not || "").trim();
  if (!temiz) return "-";
  return temiz.length > limit ? `${temiz.slice(0, limit)}...` : temiz;
};

const bosUretimFormu = (
  tarih: string,
  tip: "yogurt" | "sut_kaymagi",
  fiyatlar?: Record<string, number | string>,
): Uretim => ({
  tarih,
  uretim_tipi: tip,
  cig_sut: "",
  sut_fiyat: fiyatlar?.sut || "",
  sut_tozu: "",
  sut_tozu_fiyat: fiyatlar?.toz || "",
  tereyag: "",
  tereyag_fiyat: fiyatlar?.yag || "",
  katki_kg: "",
  katki_fiyat: fiyatlar?.katki || "",
  su: "",
  su_fiyat: fiyatlar?.su || "",
  krema: "",
  krema_fiyat: fiyatlar?.krema || "",
  diger_adet: "",
  diger_kg: "",
  diger_fiyat: fiyatlar?.diger || "",
  paket_2_adet: "",
  paket_2_fiyat: fiyatlar?.paket2 || "",
  paket_3_adet: "",
  paket_3_fiyat: fiyatlar?.paket3 || "",
  kova_3_adet: "",
  kova_3_fiyat: fiyatlar?.kova3 || "",
  kova_5_adet: "",
  kova_5_fiyat: fiyatlar?.kova5 || "",
  cikti_2kg: "",
  cikti_2kg_kg: "",
  satis_2_fiyat: fiyatlar?.satis2 || "",
  cikti_3kg: "",
  cikti_3kg_kg: "",
  satis_3_fiyat: fiyatlar?.satis3 || "",
  cikti_5kg: "",
  cikti_5kg_kg: "",
  satis_5_fiyat: fiyatlar?.satis5 || "",
  toplam_kg: 0,
  cikan_toplam_kg: 0,
  toplam_maliyet: 0,
  kar: 0,
  aciklama: "",
});

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [activeTab, setActiveTab] = useState<AppTabId>("satis");
  const [isBottomMenuOpen, setIsBottomMenuOpen] = useState(false);
  const oturumAcilisSekmesiRef = useRef<string | null>(null);
  const bottomMenuRef = useRef<HTMLElement | null>(null);

  // DÖNEM YÖNETİMİ (Kalıcı)
  const [aktifDonem, setAktifDonem] = useState<string>(() => {
      const saved = localStorage.getItem("aktifDonem");
      return saved || getLocalDateString().substring(0, 7);
  });
  const [isDonemModalOpen, setIsDonemModalOpen] = useState(false);
  const [donemOnay, setDonemOnay] = useState(false);

  // VERİ LİSTELERİ
  const [tedarikciler, setTedarikciler] = useState<Ciftlik[]>([]);
  const [bayiler, setBayiler] = useState<Bayi[]>([]);
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [sutList, setSutList] = useState<SutGiris[]>([]);
  const [satisFisList, setSatisFisList] = useState<SatisFis[]>([]); 
  const [satisList, setSatisList] = useState<SatisGiris[]>([]); 
  const [giderList, setGiderList] = useState<Gider[]>([]);
  const [giderTuruListesi, setGiderTuruListesi] = useState<GiderTuru[]>([]);
  const [uretimList, setUretimList] = useState<Uretim[]>([]);
  const [copKutusuList, setCopKutusuList] = useState<CopKutusu[]>([]);
  const [profilKullaniciListesi, setProfilKullaniciListesi] = useState<string[]>([]);

  // AYARLAR VE UI STATE'LERİ
  const temaRengi = TEMA_RENGI;
  const [detayNot, setDetayNot] = useState<any>(null);
  const [tabYetkileri, setTabYetkileri] = useState<KullaniciSekmeYetkisi[]>([]);
  const [yetkiKaynak, setYetkiKaynak] = useState<"supabase" | "local">("local");
  const [yetkiUyari, setYetkiUyari] = useState("");
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [depolamaDurumu, setDepolamaDurumu] = useState<DepolamaDurumu | null>(null);
  const [isDepolamaLoading, setIsDepolamaLoading] = useState(false);
  const [depolamaHata, setDepolamaHata] = useState("");
  const [veriYuklemeHata, setVeriYuklemeHata] = useState("");
  const [authHata, setAuthHata] = useState("");
  const [adminKullanicilar, setAdminKullanicilar] = useState<AdminKullanici[]>([]);
  const [isAdminKullaniciLoading, setIsAdminKullaniciLoading] = useState(false);
  const [adminKullaniciHata, setAdminKullaniciHata] = useState("");
  
  // AÇILIR MENÜLER
  const [openDropdown, setOpenDropdown] = useState<{type: string, id: string} | null>(null);

  // DİĞER İŞLEMLER (Sadece Kasaya Devir Kaldı)
  const [digerModalConfig, setDigerModalConfig] = useState<{
    isOpen: boolean;
    type: 'kasa_devir' | null;
    mode: 'create' | 'edit' | 'view';
    fisId: number | null;
  }>({ isOpen: false, type: null, mode: 'create', fisId: null });
  const [digerForm, setDigerForm] = useState({tarih: getLocalDateString(), tutar: "", aciklama: ""});

  // YENİ AYARLAR STATE'İ (Çöp Kutusu Eklendi)
  const [activeAyarTab, setActiveAyarTab] = useState<ActiveAyarTab>("musteriler");
  const [yeniAyarDeger, setYeniAyarDeger] = useState("");

  const bugun = getLocalDateString();
  const aktifDonemTarihi = (donem = aktifDonem) => (bugun.startsWith(donem) ? bugun : `${donem}-01`);

  // --- SÜT STATE'LERİ ---
  const [isSutModalOpen, setIsSutModalOpen] = useState<boolean>(false);
  const [editingSutId, setEditingSutId] = useState<any>(null);
  const [sutForm, setSutForm] = useState<SutGiris>({ tarih: aktifDonemTarihi(), ciftlik: "", kg: "", fiyat: "", aciklama: "" });
  const [sutFiltre, setSutFiltre] = useState<{ ciftlikler: string[], baslangic: string, bitis: string }>({ ciftlikler: [], baslangic: "", bitis: "" });
  const [sutSort, setSutSort] = useState<SortConfig>({ key: 'tarih', direction: 'desc' });

  // --- SATIŞ STATE'LERİ ---
  const [satisFiltreKisi, setSatisFiltreKisi] = useState<"benim" | "herkes">("benim");
  const [satisFiltreTip, setSatisFiltreTip] = useState<"tumu" | "satis" | "tahsilat" | "kasa_devir">("tumu");
  
  const [isFisModalOpen, setIsFisModalOpen] = useState<boolean>(false);
  const [isTahsilatModalOpen, setIsTahsilatModalOpen] = useState<boolean>(false);
  const [tahsilatForm, setTahsilatForm] = useState({ tarih: aktifDonemTarihi(), bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" });
  
  const [editingFisId, setEditingFisId] = useState<string | null>(null);
  const [editingFisNo, setEditingFisNo] = useState<string | null>(null);
  const [fisUst, setFisUst] = useState({ tarih: aktifDonemTarihi(), bayi: "", aciklama: "", odeme_turu: "PEŞİN", tahsilat: "", bos_kova: "", teslim_alan: "" });
  const [fisDetay, setFisDetay] = useState<FisDetayMap>({});
  const [fisGorselDosya, setFisGorselDosya] = useState<File | null>(null);
  const [fisGorselMevcutYol, setFisGorselMevcutYol] = useState("");
  const [fisGorselOnizleme, setFisGorselOnizleme] = useState<{ url: string; baslik: string } | null>(null);
  const [gosterilenEkler, setGosterilenEkler] = useState({ tereyagi: false, yogurt_kaymagi: false, iade: false, bos_kova: false, urunler: [] as string[] });
  const [isDigerUrunMenuOpen, setIsDigerUrunMenuOpen] = useState(false);
  const digerUrunMenuRef = useRef<HTMLDivElement | null>(null);
  const [sonFisData, setSonFisData] = useState<any>(null);
  const [musteriEkstreData, setMusteriEkstreData] = useState<null | {
    musteri: string;
    donem: string;
    hareketler: Array<{
      tarih: string;
      fisNo: string;
      urunSatirlari: Array<{
        isim: string;
        adet: number;
        tutar: number;
      }>;
      tutar: number;
      tahsilat: number;
      fistenKalanBorc: number;
    }>;
  }>(null);
  const [bayiSecimModal, setBayiSecimModal] = useState<{ hedef: "fis" | "tahsilat" | null; arama: string }>({
    hedef: null,
    arama: "",
  });

  const [fisFiltre, setFisFiltre] = useState<{ bayiler: string[], baslangic: string, bitis: string }>({ bayiler: [], baslangic: "", bitis: "" });
  const [fisSort, setFisSort] = useState<SortConfig>({ key: 'tarih', direction: 'desc' });
  const [ozetBorcFiltre, setOzetBorcFiltre] = useState<{ bayiler: string[] }>({ bayiler: [] });
  const [ozetBorcSort, setOzetBorcSort] = useState<SortConfig>({ key: "isim", direction: "asc" });

  // --- ANALİZ STATE'LERİ ---
  const [analizFiltre, setAnalizFiltre] = useState<{bayiler: string[], urunler: string[], baslangic: string, bitis: string}>({ bayiler: [], urunler: [], baslangic: "", bitis: "" });
  const [analizSort, setAnalizSort] = useState<SortConfig>({ key: 'tarih', direction: 'desc' });

  // --- GİDER STATE'LERİ ---
  const [giderFiltreKisi, setGiderFiltreKisi] = useState<"benim" | "tumu">("benim");
  const [isGiderModalOpen, setIsGiderModalOpen] = useState<boolean>(false);
  const [editingGiderId, setEditingGiderId] = useState<any>(null);
  const [giderForm, setGiderForm] = useState<Gider>({ tarih: aktifDonemTarihi(), tur: "Genel Gider", aciklama: "", tutar: "" });
  const [giderGorselDosya, setGiderGorselDosya] = useState<File | null>(null);
  const [giderGorselMevcutYol, setGiderGorselMevcutYol] = useState("");
  const [giderSort, setGiderSort] = useState<SortConfig>({ key: 'tarih', direction: 'desc' });
  const giderTurleri = useMemo(() => {
    const veritabaniTurleri = giderTuruListesi
      .map((item) => item.isim)
      .filter(Boolean);
    return veritabaniTurleri.length > 0 ? veritabaniTurleri : [...GIDER_TURLERI];
  }, [giderTuruListesi]);

  // --- ÜRETİM STATE'LERİ ---
  const [isUretimModalOpen, setIsUretimModalOpen] = useState<boolean>(false);
  const [uretimDetayData, setUretimDetayData] = useState<any>(null);
  const [uretimMiniDetay, setUretimMiniDetay] = useState<null | {
    baslik: string;
    renk: string;
    satirlar: Array<{ etiket: string; deger: string; vurgu?: boolean }>;
  }>(null);
  const [ozetMiniDetay, setOzetMiniDetay] = useState<null | {
    baslik: string;
    renk: string;
    satirlar: Array<{ etiket: string; deger: string; vurgu?: boolean }>;
  }>(null);
  const [editingUretimId, setEditingUretimId] = useState<any>(null);
  const [uretimForm, setUretimForm] = useState<Uretim>(bosUretimFormu(aktifDonemTarihi(), "yogurt"));
  const [uretimSort, setUretimSort] = useState<SortConfig>({ key: 'tarih', direction: 'desc' });

  const masterKayitIsminiNormalizeEt = useCallback(
    (deger?: string | null) =>
      String(deger || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("tr-TR"),
    [],
  );
  const sistemIslemiMi = (deger?: string | null) => (deger || "") === "SİSTEM İŞLEMİ";

  const eslesenKayitIdBul = <T extends { id: string; isim: string }>(liste: T[], isim?: string | null) =>
    liste.find((item) => item.isim === isim)?.id ?? null;

  const seciliBayiId = useCallback((bayiAdi?: string | null) => eslesenKayitIdBul(bayiler, bayiAdi), [bayiler]);
  const seciliUrunId = useCallback((urunAdi?: string | null) => eslesenKayitIdBul(urunler, urunAdi), [urunler]);
  const seciliCiftlikId = useCallback((ciftlikAdi?: string | null) => eslesenKayitIdBul(tedarikciler, ciftlikAdi), [tedarikciler]);
  const kayitAktifMi = <T extends { aktif?: boolean | null }>(item: T) => item.aktif !== false;
  const aktifBayiler = useMemo(() => bayiler.filter(kayitAktifMi), [bayiler]);
  const aktifUrunler = useMemo(() => urunler.filter(kayitAktifMi), [urunler]);
  const aktifTedarikciler = useMemo(() => tedarikciler.filter(kayitAktifMi), [tedarikciler]);
  const tumBayiler = useMemo(() => [...bayiler], [bayiler]);
  const bayiMap = useMemo(() => new Map(bayiler.map((item) => [item.id, item.isim])), [bayiler]);
  const urunMap = useMemo(() => new Map(urunler.map((item) => [item.id, item.isim])), [urunler]);
  const ciftlikMap = useMemo(() => new Map(tedarikciler.map((item) => [item.id, item.isim])), [tedarikciler]);

  const satisFisBayiAdiGetir = useCallback(
    (fis?: Partial<SatisFis> | null) => (fis?.bayi_id ? bayiMap.get(fis.bayi_id) : undefined) || fis?.bayi || "",
    [bayiMap],
  );
  const satisSatiriBayiAdiGetir = useCallback(
    (satir?: Partial<SatisGiris> | null) => (satir?.bayi_id ? bayiMap.get(satir.bayi_id) : undefined) || satir?.bayi || "",
    [bayiMap],
  );
  const satisSatiriUrunAdiGetir = useCallback(
    (satir?: Partial<SatisGiris> | null) => (satir?.urun_id ? urunMap.get(satir.urun_id) : undefined) || satir?.urun || "",
    [urunMap],
  );
  const sutCiftlikAdiGetir = useCallback(
    (kayit?: Partial<SutGiris> | null) => (kayit?.ciftlik_id ? ciftlikMap.get(kayit.ciftlik_id) : undefined) || kayit?.ciftlik || "",
    [ciftlikMap],
  );
  const satisFisBayiAnahtariGetir = useCallback(
    (fis?: Partial<SatisFis> | null) => (fis?.bayi_id ? `id:${fis.bayi_id}` : `isim:${masterKayitIsminiNormalizeEt(fis?.bayi)}`),
    [masterKayitIsminiNormalizeEt],
  );
  const satisSatiriBayiAnahtariGetir = useCallback(
    (satir?: Partial<SatisGiris> | null) => (satir?.bayi_id ? `id:${satir.bayi_id}` : `isim:${masterKayitIsminiNormalizeEt(satir?.bayi)}`),
    [masterKayitIsminiNormalizeEt],
  );
  const satisSatiriUrunAnahtariGetir = useCallback(
    (satir?: Partial<SatisGiris> | null) => (satir?.urun_id ? `id:${satir.urun_id}` : `isim:${masterKayitIsminiNormalizeEt(satir?.urun)}`),
    [masterKayitIsminiNormalizeEt],
  );
  const sutCiftlikAnahtariGetir = useCallback(
    (kayit?: Partial<SutGiris> | null) => (kayit?.ciftlik_id ? `id:${kayit.ciftlik_id}` : `isim:${masterKayitIsminiNormalizeEt(kayit?.ciftlik)}`),
    [masterKayitIsminiNormalizeEt],
  );
  const sutSonFiyatHaritasi = useMemo(() => {
    const map = new Map<string, string>();
    const siraliKayitlar = [...sutList].sort((a, b) => {
      const tarihFarki = String(b.tarih || "").localeCompare(String(a.tarih || ""));
      if (tarihFarki !== 0) return tarihFarki;
      const createdAtFarki = String((b as any).created_at || "").localeCompare(String((a as any).created_at || ""));
      if (createdAtFarki !== 0) return createdAtFarki;
      return sayiDegeri((b as any).id) - sayiDegeri((a as any).id);
    });

    siraliKayitlar.forEach((kayit) => {
      const key = sutCiftlikAnahtariGetir(kayit);
      if (!key || map.has(key)) return;
      const fiyat = sayiDegeri(kayit.fiyat);
      if (fiyat > 0) map.set(key, String(kayit.fiyat));
    });

    return map;
  }, [sutCiftlikAnahtariGetir, sutList]);
  const sonSutFiyatiniGetir = useCallback(
    (ciftlikAdi?: string | null) => {
      if (!ciftlikAdi) return "";
      const ciftlikId = seciliCiftlikId(ciftlikAdi);
      const key = ciftlikId ? `id:${ciftlikId}` : `isim:${masterKayitIsminiNormalizeEt(ciftlikAdi)}`;
      return sutSonFiyatHaritasi.get(key) || "";
    },
    [masterKayitIsminiNormalizeEt, seciliCiftlikId, sutSonFiyatHaritasi],
  );

  const hesaplaMusteriBakiyeleri = useCallback((kayitlar: SatisFis[], sonDonem?: string) => {
    const bakiyeler: Record<string, number> = {};
    const labels: Record<string, string> = {};
    const map: Record<string, number> = {};

    satisFisleriniSirala(kayitlar).forEach((fis) => {
      const donem = String(fis.tarih || "").substring(0, 7);
      if (sonDonem && donem > sonDonem) return;

      const bayiAdi = satisFisBayiAdiGetir(fis);
      const bayiAnahtar = satisFisBayiAnahtariGetir(fis);
      if (!bayiAdi || bayiAdi === "SİSTEM İŞLEMİ") return;

      labels[bayiAnahtar] = bayiAdi;
      if (fisDonemDevirMi(fis)) {
        bakiyeler[bayiAnahtar] = Number(fis.kalan_bakiye || 0);
      } else {
        bakiyeler[bayiAnahtar] = (bakiyeler[bayiAnahtar] || 0) + Number(fis.kalan_bakiye || 0);
      }

      if (fis.id) {
        map[String(fis.id)] = bakiyeler[bayiAnahtar];
      }
    });

    return { bakiyeler, labels, map };
  }, [satisFisBayiAdiGetir, satisFisBayiAnahtariGetir]);

  const [activeFilterModal, setActiveFilterModal] = useState<'sut_ciftlik' | 'fis_bayi' | 'ozet_bayi' | 'analiz_bayi' | 'analiz_urun' | 'sut_tarih' | 'fis_tarih' | 'analiz_tarih' | null>(null);

  const bayiSecimModalAc = (hedef: "fis" | "tahsilat") => {
    setBayiSecimModal({ hedef, arama: "" });
  };

  const bayiSecimModalKapat = () => {
    setBayiSecimModal({ hedef: null, arama: "" });
  };

  const tabloKayitListesi = useMemo(
    () => ({
      bayiler,
      urunler,
      ciftlikler: tedarikciler,
      gider_turleri: giderTuruListesi,
    }),
    [bayiler, giderTuruListesi, tedarikciler, urunler],
  );

  const ayarKayitAdiVarMi = (
    tablo: "bayiler" | "urunler" | "ciftlikler" | "gider_turleri",
    isim: string,
    excludeId?: string | null,
  ) => {
    const normalized = masterKayitIsminiNormalizeEt(isim);
    if (!normalized) return false;
    return tabloKayitListesi[tablo].some(
      (item) =>
        String(item.id) !== String(excludeId || "") &&
        masterKayitIsminiNormalizeEt(item.isim) === normalized,
    );
  };

  useEffect(() => {
    if (!isDigerUrunMenuOpen) return;

    const handleDisTiklama = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (digerUrunMenuRef.current && target && !digerUrunMenuRef.current.contains(target)) {
        setIsDigerUrunMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDisTiklama);
    document.addEventListener("touchstart", handleDisTiklama, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleDisTiklama);
      document.removeEventListener("touchstart", handleDisTiklama);
    };
  }, [isDigerUrunMenuOpen]);

  useEffect(() => {
    if (!openDropdown) return;

    const handleDropdownDisTiklama = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest(".dropdown-menu") || target.closest(".actions-cell")) return;
      setOpenDropdown(null);
    };

    document.addEventListener("mousedown", handleDropdownDisTiklama);
    document.addEventListener("touchstart", handleDropdownDisTiklama, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handleDropdownDisTiklama);
      document.removeEventListener("touchstart", handleDropdownDisTiklama);
    };
  }, [openDropdown]);

  const handleIdleLogout = useEffectEvent(() => {
    void cikisYap("10 dakika işlem yapılmadığı için güvenlik amacıyla oturum kapatıldı.");
  });

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) setUsername(normalizeUsername(savedUser));

    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.setAttribute('name', 'viewport');
      document.head.appendChild(viewportMeta);
    }
    viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0');

    if (!document.getElementById("html2canvas-script")) {
      const script = document.createElement("script");
      script.id = "html2canvas-script";
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      document.head.appendChild(script);
    }

    supabase.auth
      .getSession()
      .then(async ({ data: { session: s }, error }: any) => {
        if (error?.message?.toLowerCase().includes("refresh token")) {
          await yerelOturumuTemizle();
          setAuthHata("Oturum süresi dolmuş veya bozulmuş. Lütfen tekrar giriş yapın.");
          return;
        }
        setSession(s);
      })
      .catch(async (error: Error) => {
        if (error.message?.toLowerCase().includes("refresh token")) {
          await yerelOturumuTemizle();
          setAuthHata("Oturum süresi dolmuş veya bozulmuş. Lütfen tekrar giriş yapın.");
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: any, s: any) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        return;
      }

      if (event === "TOKEN_REFRESHED" && !s) {
        await yerelOturumuTemizle();
        setAuthHata("Oturum yenilenemedi. Lütfen tekrar giriş yapın.");
        return;
      }

      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) verileriGetir("hepsi"); }, [session]);

  useEffect(() => {
    if (session?.user?.email) {
      setUsername(normalizeUsername(session.user.email));
      setAuthHata("");
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;

    kullaniciYetkileriniYukle().then(({ kayitlar, kaynak, uyari }) => {
      setTabYetkileri(kayitlar);
      setYetkiKaynak(kaynak);
      setYetkiUyari(uyari || "");
    });
  }, [session]);

  useEffect(() => {
      localStorage.setItem("aktifDonem", aktifDonem);
  }, [aktifDonem]);

  const oturumKullaniciKisa = normalizeUsername(session?.user?.email || "");
  const mevcutKullanici = normalizeUsername(session?.user?.email || username);
  const aktifKullaniciEposta =
    session?.user?.email || (username.includes("@") ? username : `${username}@sistem.local`);
  const aktifKullaniciKisa = normalizeUsername(aktifKullaniciEposta);
  const isAdmin = adminMi(mevcutKullanici);
  const uretimAksiyonYetkiliMi = oturumKullaniciKisa === "admin" || oturumKullaniciKisa === "yusuf";
  const kaydiSilebilirMi = (ekleyen?: string | null) =>
    isAdmin || (!!normalizeUsername(ekleyen) && normalizeUsername(ekleyen) === aktifKullaniciKisa);
  const kaydiDuzenleyebilirMi = (ekleyen?: string | null) => kaydiSilebilirMi(ekleyen);
  const satisFisEkleleyeniniBul = (fis?: Partial<SatisFis> | null) =>
    fis?.ekleyen ||
    satisFisList.find((kayit) => {
      if (fis?.id && kayit.id === fis.id) return true;
      if (fis?.fis_no && kayit.fis_no === fis.fis_no) return true;
      return false;
    })?.ekleyen ||
    null;
  const fisSilinebilirMi = (fis?: Partial<SatisFis> | null) => kaydiSilebilirMi(satisFisEkleleyeniniBul(fis));
  const fisDuzenlenebilirMi = (fis?: Partial<SatisFis> | null) => kaydiDuzenleyebilirMi(satisFisEkleleyeniniBul(fis));
  const mevcutSekmeYetkileri = useMemo(
    () => kullaniciYetkisiniBul(mevcutKullanici, tabYetkileri),
    [mevcutKullanici, tabYetkileri],
  );
  const gorunurSekmeler = useMemo(
    () => TAB_TANIMLARI.filter((tab) => mevcutSekmeYetkileri[tab.id]),
    [mevcutSekmeYetkileri],
  );
  const altMenuAnaSekmeleri = useMemo(
    () =>
      (["ozet", "satis", "gider"] as AppTabId[])
        .map((id) => gorunurSekmeler.find((tab) => tab.id === id))
        .filter(Boolean) as Array<{ id: AppTabId; ikon: string; etiket: string }>,
    [gorunurSekmeler],
  );
  const altMenuDigerSekmeleri = useMemo(
    () => gorunurSekmeler.filter((tab) => !["ozet", "satis", "gider"].includes(tab.id)),
    [gorunurSekmeler],
  );
  const altMenuGizliSekmeAktif = useMemo(
    () => altMenuDigerSekmeleri.some((tab) => tab.id === activeTab),
    [activeTab, altMenuDigerSekmeleri],
  );

  useEffect(() => {
    if (!gorunurSekmeler.some((tab) => tab.id === activeTab)) {
      const hedefSekme = gorunurSekmeler.some((tab) => tab.id === "satis") ? "satis" : gorunurSekmeler[0]?.id;
      if (hedefSekme) {
        setActiveTab(hedefSekme);
      }
    }
  }, [activeTab, gorunurSekmeler]);

  useEffect(() => {
    const kullaniciId = session?.user?.id || null;
    if (!kullaniciId) {
      oturumAcilisSekmesiRef.current = null;
      return;
    }
    if (oturumAcilisSekmesiRef.current === kullaniciId) return;

    const hedefSekme = gorunurSekmeler.some((tab) => tab.id === "satis") ? "satis" : gorunurSekmeler[0]?.id;
    if (hedefSekme) {
      setActiveTab(hedefSekme);
      oturumAcilisSekmesiRef.current = kullaniciId;
    }
  }, [gorunurSekmeler, session?.user?.id]);

  useEffect(() => {
    setIsBottomMenuOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!isBottomMenuOpen) return;

    const handleBottomMenuDisTiklama = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (bottomMenuRef.current && target && !bottomMenuRef.current.contains(target)) {
        setIsBottomMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleBottomMenuDisTiklama);
    document.addEventListener("touchstart", handleBottomMenuDisTiklama, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handleBottomMenuDisTiklama);
      document.removeEventListener("touchstart", handleBottomMenuDisTiklama);
    };
  }, [isBottomMenuOpen]);

  const veritabaniHatasiMesaji = (tablo: string, hata: { message?: string } | null) => {
    const mesaj = hata?.message || "Bilinmeyen veritabanı hatası";
    if (mesaj.toLowerCase().includes("row-level security policy")) {
      return `${tablo} kaydı engellendi. Supabase RLS politikası bu kullanıcı için insert/update izni vermiyor. Oturum: ${aktifKullaniciEposta}`;
    }
    return mesaj;
  };

  const rpcBulunamadiMi = (hata: { code?: string; message?: string } | null | undefined, fonksiyonAdi: string) => {
    const mesaj = String(hata?.message || "").toLowerCase();
    return (
      hata?.code === "PGRST202" ||
      hata?.code === "42883" ||
      (mesaj.includes(`public.${fonksiyonAdi}`.toLowerCase()) &&
        (mesaj.includes("schema cache") || mesaj.includes("not find") || mesaj.includes("does not exist")))
    );
  };

  const edgeFunctionBulunamadiMi = (hata: { message?: string; name?: string } | null | undefined, fonksiyonAdi: string) => {
    const mesaj = String(hata?.message || "").toLowerCase();
    const isim = String(hata?.name || "").toLowerCase();
    return (
      (mesaj.includes("edge function") && !mesaj.includes("401")) ||
      mesaj.includes("failed to send a request") ||
      mesaj.includes("404") ||
      mesaj.includes(`function ${fonksiyonAdi.toLowerCase()} not found`) ||
      isim.includes("functionshttperror")
    );
  };

  const kolonBulunamadiMi = (
    hata: { message?: string } | null | undefined,
    tabloAdi: string,
    kolonAdi: string,
  ) => {
    const mesaj = String(hata?.message || "").toLowerCase();
    return (
      (mesaj.includes(`'${kolonAdi.toLowerCase()}'`) && mesaj.includes("schema cache")) ||
      (mesaj.includes(`column "${kolonAdi.toLowerCase()}"`) && mesaj.includes(tabloAdi.toLowerCase())) ||
      (mesaj.includes(kolonAdi.toLowerCase()) && mesaj.includes(tabloAdi.toLowerCase()) && mesaj.includes("could not find"))
    );
  };

  const depolamaDurumunuGetir = async (force = false) => {
    if (isDepolamaLoading) return;
    if (!force && depolamaDurumu) return;

    setIsDepolamaLoading(true);
    setDepolamaHata("");

    const { data, error } = await supabase.rpc("get_storage_usage_summary");

    if (error) {
      if (rpcBulunamadiMi(error, "get_storage_usage_summary")) {
        setDepolamaHata("Depolama raporu icin SQL fonksiyonu henuz kurulmamis. SQL dosyasini bir kez calistirman gerekiyor.");
      } else {
        setDepolamaHata(`Depolama bilgisi alinamadi: ${error.message || "Bilinmeyen hata"}`);
      }
      setIsDepolamaLoading(false);
      return;
    }

    const kayit = Array.isArray(data) ? data[0] : data;
    const databaseBytes = Number(kayit?.database_bytes || 0);
    const imageBytes = Number(kayit?.image_bytes || 0);
    const imageCount = Number(kayit?.image_count || 0);

    setDepolamaDurumu({
      databaseBytes,
      databaseTotalBytes: SUPABASE_FREE_DATABASE_LIMIT_BYTES,
      databaseRemainingBytes: Math.max(SUPABASE_FREE_DATABASE_LIMIT_BYTES - databaseBytes, 0),
      imageBytes,
      imageTotalBytes: SUPABASE_FREE_STORAGE_LIMIT_BYTES,
      imageRemainingBytes: Math.max(SUPABASE_FREE_STORAGE_LIMIT_BYTES - imageBytes, 0),
      imageCount,
      updatedAt: new Date().toISOString(),
    });
    setIsDepolamaLoading(false);
  };

  const yerelOturumuTemizle = async () => {
    await supabase.auth.signOut({ scope: "local" });
    setSession(null);
    setPassword("");
    setAdminKullanicilar([]);
    setAdminKullaniciHata("");
  };

  const adminKullaniciFonksiyonunuCagir = useCallback(
    async <T,>(payload: Record<string, unknown>) => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession?.access_token) {
        throw new Error("Kullanıcı yönetimi için oturum doğrulanamadı. Lütfen çıkış yapıp tekrar giriş yap.");
      }

      const { data, error } = await supabase.functions.invoke("user-admin", {
        body: payload,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      if (error) {
        if (edgeFunctionBulunamadiMi(error, "user-admin")) {
          throw new Error("Kullanıcı yönetimi Edge Function henüz deploy edilmemiş. Supabase Edge Function adımını tamamlaman gerekiyor.");
        }
        if (String(error.message || "").includes("401")) {
          throw new Error("Kullanıcı yönetimi yetkilendirmesi başarısız oldu. Çıkış yapıp tekrar giriş yapmanı öneririm.");
        }
        throw new Error(error.message || "Kullanıcı yönetimi çağrısı başarısız oldu.");
      }

      const sonuc = (data || {}) as { ok?: boolean; message?: string };
      if (sonuc.ok === false) {
        throw new Error(sonuc.message || "Kullanıcı yönetimi işlemi başarısız oldu.");
      }

      return data as T;
    },
    [],
  );

  const handleOwnPasswordChange = useCallback(
    async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { ok: false, message: error.message || "Şifre güncellenemedi." };
      }
      return { ok: true, message: "Şifreniz başarıyla güncellendi." };
    },
    [],
  );

  const handleAdminUsersLoad = useCallback(
    async (force = false) => {
      if (!isAdmin) return;
      if (!force && adminKullanicilar.length > 0) return;

      setIsAdminKullaniciLoading(true);
      setAdminKullaniciHata("");

      try {
        const data = await adminKullaniciFonksiyonunuCagir<{ users: AdminKullanici[] }>({ action: "list-users" });
        setAdminKullanicilar(Array.isArray(data.users) ? data.users : []);
      } catch (error: any) {
        setAdminKullaniciHata(error?.message || "Kullanıcı listesi alınamadı.");
      } finally {
        setIsAdminKullaniciLoading(false);
      }
    },
    [adminKullanicilar.length, adminKullaniciFonksiyonunuCagir, isAdmin],
  );

  const handleAdminCreateUser = useCallback(
    async (payload: { email: string; password: string; displayName: string }) => {
      try {
        setIsAdminKullaniciLoading(true);
        setAdminKullaniciHata("");
        const data = await adminKullaniciFonksiyonunuCagir<{ message?: string }>({
          action: "create-user",
          email: payload.email,
          password: payload.password,
          displayName: payload.displayName,
        });
        await handleAdminUsersLoad(true);
        await verileriGetir("ayar");
        return { ok: true, message: data?.message || "Kullanıcı oluşturuldu." };
      } catch (error: any) {
        setAdminKullaniciHata(error?.message || "Kullanıcı oluşturulamadı.");
        return { ok: false, message: error?.message || "Kullanıcı oluşturulamadı." };
      } finally {
        setIsAdminKullaniciLoading(false);
      }
    },
    [adminKullaniciFonksiyonunuCagir, handleAdminUsersLoad],
  );

  const handleAdminResetUserPassword = useCallback(
    async (payload: { userId: string; newPassword: string }) => {
      try {
        setIsAdminKullaniciLoading(true);
        setAdminKullaniciHata("");
        const data = await adminKullaniciFonksiyonunuCagir<{ message?: string }>({
          action: "set-password",
          userId: payload.userId,
          password: payload.newPassword,
        });
        return { ok: true, message: data?.message || "Kullanıcı şifresi güncellendi." };
      } catch (error: any) {
        setAdminKullaniciHata(error?.message || "Kullanıcı şifresi güncellenemedi.");
        return { ok: false, message: error?.message || "Kullanıcı şifresi güncellenemedi." };
      } finally {
        setIsAdminKullaniciLoading(false);
      }
    },
    [adminKullaniciFonksiyonunuCagir],
  );

  async function coptKutusunaAt(tablo: string, veri: any) {
      const { error } = await supabase
        .from("cop_kutusu")
        .insert({ tablo_adi: tablo, veri, silinme_tarihi: new Date().toISOString() });
      if (error) {
        console.warn("Çöp kutusuna atılamadı:", error.message);
        return false;
      }
      return true;
  }

  async function verileriGetir(hedef: "hepsi" | "satis" | "sut" | "gider" | "uretim" | "ayar" | "cop" = "hepsi") {
    try {
      setVeriYuklemeHata("");

      if (hedef === "hepsi" || hedef === "ayar") {
        const [{ data: c, error: cErr }, { data: b, error: bErr }, { data: u, error: uErr }, { data: p, error: pErr }, { data: gt, error: gtErr }] = await Promise.all([
          supabase.from("ciftlikler").select("*").order("isim"),
          supabase.from("bayiler").select("*").order("isim"),
          supabase.from("urunler").select("*").order("isim"),
          supabase.from("profiles").select("username").order("username"),
          supabase.from("gider_turleri").select("*").order("isim"),
        ]);
        if (cErr || bErr || uErr || pErr || gtErr) throw cErr || bErr || uErr || pErr || gtErr;
        if (c) setTedarikciler(c);
        if (b) setBayiler(b);
        if (gt) setGiderTuruListesi(gt);
        if (u) {
          setUrunler(u);
          setFisDetay(prev => {
            const yeniDetay: any = { ...prev };
            u.forEach(urun => { if (!yeniDetay[urun.id]) yeniDetay[urun.id] = { adet: "", kg: "", fiyat: urun.fiyat || "" }; });
            if (!yeniDetay["v_iade"]) yeniDetay["v_iade"] = { adet: "", kg: "", fiyat: "" };
            if (!yeniDetay["v_bos_kova"]) yeniDetay["v_bos_kova"] = { adet: "", kg: "", fiyat: "" };
            return yeniDetay;
          });
        }
        if (p) {
          const kullanicilar = Array.from(
            new Set(
              (p as Array<{ username?: string | null }>)
                .map((profil) => normalizeUsername(profil.username))
                .filter(Boolean),
            ),
          ).sort((a, b) => a.localeCompare(b, "tr"));
          setProfilKullaniciListesi(kullanicilar);
        }
      }

      if (hedef === "hepsi" || hedef === "satis") {
        const [{ data: f, error: fErr }, { data: st, error: stErr }] = await Promise.all([
          supabase.from("satis_fisleri").select("*").order("tarih", { ascending: true }).order("id", { ascending: true }),
          supabase.from("satis_giris").select("*").order("tarih", { ascending: true }).order("id", { ascending: true })
        ]);
        if (fErr || stErr) throw fErr || stErr;
        if (f) setSatisFisList(f);
        if (st) setSatisList(st);
      }

      if (hedef === "hepsi" || hedef === "sut") {
        const { data: s, error: sErr } = await supabase.from("sut_giris").select("*").order("tarih", { ascending: true }).order("id", { ascending: true });
        if (sErr) throw sErr;
        if (s) setSutList(s);
      }

      if (hedef === "hepsi" || hedef === "gider") {
        const { data: g, error: gErr } = await supabase.from("giderler").select("*").order("tarih", { ascending: true }).order("id", { ascending: true });
        if (gErr) throw gErr;
        if (g) setGiderList(g);
      }

      if (hedef === "hepsi" || hedef === "uretim") {
        const { data: ur, error: urErr } = await supabase.from("uretim").select("*").order("tarih", { ascending: true }).order("id", { ascending: true });
        if (urErr) throw urErr;
        if (ur) setUretimList(ur.map((kayit) => uretimKaydiniNormalizeEt(kayit as Uretim)));
      }

      if (hedef === "hepsi" || hedef === "cop") {
          const { data: cop, error: copErr } = await supabase.from("cop_kutusu").select("*").order("silinme_tarihi", { ascending: false });
          if (copErr) throw copErr;
          if(cop) setCopKutusuList(cop);
      }

    } catch (error: any) {
      console.error(error);
      setVeriYuklemeHata(error?.message || "Veriler alinirken beklenmeyen bir hata olustu.");
    }
  }

  // DÖNEM GEÇİŞ LİSTESİ OLUŞTURUCU
  const aylar = useMemo(() => {
     const set = new Set<string>();
     [...sutList, ...satisFisList, ...giderList, ...uretimList].forEach(item => {
         if(item.tarih) set.add(item.tarih.substring(0, 7)); 
     });
     set.add(getLocalDateString().substring(0, 7)); 
     set.add(aktifDonem);
     return Array.from(set).sort().reverse(); 
  }, [sutList, satisFisList, giderList, uretimList, aktifDonem]);

  // Tüm Fişlerden Müşteri Borç Durumu Hesaplama
  const bayiBorclari = useMemo(() => {
    const { bakiyeler, labels } = hesaplaMusteriBakiyeleri(satisFisList, aktifDonem);
    return Object.keys(bakiyeler)
        .map((k) => ({ anahtar: k, isim: labels[k] || k, borc: bakiyeler[k] }))
        .filter((b) => Math.abs(b.borc) > 0.01)
        .sort((a, b) => b.borc - a.borc);
  }, [aktifDonem, hesaplaMusteriBakiyeleri, satisFisList]);

  const ozetBorcFiltreSecenekleri = useMemo(
    () => [...new Set(bayiBorclari.map((item) => item.isim))].sort((a, b) => a.localeCompare(b, "tr")),
    [bayiBorclari],
  );

  const filtrelenmisBayiBorclari = useMemo(() => {
    const filtreliListe = bayiBorclari.filter(
      (item) => ozetBorcFiltre.bayiler.length === 0 || ozetBorcFiltre.bayiler.includes(item.isim),
    );

    return [...filtreliListe].sort((a, b) => {
      if (ozetBorcSort.key === "borc") {
        const fark = Number(a.borc) - Number(b.borc);
        return ozetBorcSort.direction === "asc" ? fark : -fark;
      }

      const sonuc = a.isim.localeCompare(b.isim, "tr");
      return ozetBorcSort.direction === "asc" ? sonuc : -sonuc;
    });
  }, [bayiBorclari, ozetBorcFiltre.bayiler, ozetBorcSort]);

  const musteriEkstreHesapla = useCallback((bayiAnahtar: string, musteriAdi: string) => {
    const ilgiliFisler = [...satisFisList]
      .filter((fis) => {
        if (satisFisBayiAnahtariGetir(fis) !== bayiAnahtar) return false;
        if (fisKasayaDevirMi(fis)) return false;
        return !sistemIslemiMi(satisFisBayiAdiGetir(fis)) || fisDonemDevirMi(fis);
      })
      .sort((a, b) => {
        const tarihKarsilastirma = String(a.tarih || "").localeCompare(String(b.tarih || ""));
        if (tarihKarsilastirma !== 0) return tarihKarsilastirma;
        const createdAtKarsilastirma = String((a as any).created_at || "").localeCompare(String((b as any).created_at || ""));
        if (createdAtKarsilastirma !== 0) return createdAtKarsilastirma;
        return sayiDegeri((a as any).id) - sayiDegeri((b as any).id);
      });

    const hareketler = ilgiliFisler
      .filter((fis) => String(fis.tarih || "").startsWith(aktifDonem))
      .filter((fis) => !fisDevirMi(fis))
      .map((fis) => {
        const urunSatirlari = satisList
          .filter((satir) => satir.fis_no === fis.fis_no)
          .reduce<Array<{ isim: string; adet: number; tutar: number }>>((acc, satir) => {
            const urunAdi = satisSatiriUrunAdiGetir(satir);
            if (!urunAdi || urunAdi === "İade Kova" || urunAdi === "Boş Kova") return acc;
            const adet = sayiDegeri(satir.adet);
            if (adet <= 0) return acc;
            acc.push({
              isim: urunAdi,
              adet,
              tutar: Number(satir.tutar || 0),
            });
            return acc;
          }, []);
        return {
          tarih: fis.tarih,
          fisNo: gorunenFisNoOlustur(fis),
          urunSatirlari,
          tutar: Number(fis.toplam_tutar || 0),
          tahsilat: Number(fis.tahsilat || 0),
          fistenKalanBorc: Number(fis.kalan_bakiye || 0),
        };
      });

    return {
      musteri: musteriAdi,
      donem: aktifDonem,
      hareketler,
    };
  }, [aktifDonem, satisFisBayiAdiGetir, satisFisBayiAnahtariGetir, satisList, satisSatiriUrunAdiGetir, satisFisList]);

  const handleMusteriEkstreAc = useCallback((bayiAnahtar: string, musteriAdi: string) => {
    setMusteriEkstreData(musteriEkstreHesapla(bayiAnahtar, musteriAdi));
  }, [musteriEkstreHesapla]);

  const musteriEkstreToplamlari = useMemo(() => {
    if (!musteriEkstreData) {
      return { tutar: 0, tahsilat: 0, fistenKalanBorc: 0 };
    }

    return musteriEkstreData.hareketler.reduce(
      (acc, hareket) => {
        acc.tutar += hareket.tutar;
        acc.tahsilat += hareket.tahsilat;
        acc.fistenKalanBorc += hareket.fistenKalanBorc;
        return acc;
      },
      { tutar: 0, tahsilat: 0, fistenKalanBorc: 0 },
    );
  }, [musteriEkstreData]);

  const satisFisToplamBorcMap = useMemo(() => {
    return hesaplaMusteriBakiyeleri(satisFisList).map;
  }, [hesaplaMusteriBakiyeleri, satisFisList]);

  const handleDonemKapat = async () => {
     if(!donemOnay) return;
     const [yyyy, mm] = aktifDonem.split('-');
     let nextM = parseInt(mm) + 1;
     let nextY = parseInt(yyyy);
     if(nextM > 12) { nextM = 1; nextY++; }
     const nextDonem = `${nextY}-${nextM.toString().padStart(2, '0')}`;

     const { data: rpcData, error: rpcError } = await supabase.rpc("app_close_period", {
       p_aktif_donem: aktifDonem,
     });
     if (!rpcError) {
       const sonuc = Array.isArray(rpcData) ? rpcData[0] : rpcData;
       const sonrakiDonem = sonuc?.next_donem || nextDonem;
       setAktifDonem(sonrakiDonem);
       setIsDonemModalOpen(false);
       setDonemOnay(false);
       await verileriGetir("satis");
       if (sonuc?.skipped && sonuc?.message) {
         alert(String(sonuc.message));
       }
       return;
     }
     if (!rpcBulunamadiMi(rpcError, "app_close_period")) {
       alert("Dönem kapatma hatası: " + (rpcError.message || "Bilinmeyen RPC hatası"));
       return;
     }

     const hedefDevirTarihi = `${nextDonem}-01`;
     const devirZatenOlusmus = satisFisList.some((fis) =>
       fis.tarih === hedefDevirTarihi &&
       fisDevirMi(fis) &&
       String(fis.aciklama || "").includes(aktifDonem),
     );

     if (devirZatenOlusmus) {
       setAktifDonem(nextDonem);
       setIsDonemModalOpen(false);
       setDonemOnay(false);
       await verileriGetir("satis");
       alert(`${aktifDonem} dönemi daha önce kapatılmış. Devir fişleri tekrar oluşturulmadı.`);
       return;
     }

     const devirFisleri = bayiBorclari.map((b, index) => ({
        fis_no: benzersizFisNoOlustur("DEVIR", index),
        tarih: `${nextDonem}-01`,
        bayi: b.isim,
        bayi_id: seciliBayiId(b.isim),
        toplam_tutar: b.borc > 0 ? b.borc : 0,
         tahsilat: b.borc < 0 ? Math.abs(b.borc) : 0,
         kalan_bakiye: b.borc,
         odeme_turu: "DEVİR",
         aciklama: `${aktifDonem} Döneminden Devir`,
         ekleyen: aktifKullaniciEposta
     }));

     const personelDevirFisleri = personelOzetleri
       .filter(p => Math.abs(p.net) > 0.01 || Math.abs(p.acikBakiye) > 0.01)
       .map((p, index) => ({
         fis_no: benzersizFisNoOlustur("PDEVIR", index),
         tarih: `${nextDonem}-01`,
         bayi_id: null,
         bayi: "SİSTEM İŞLEMİ",
         toplam_tutar: p.net,
         tahsilat: 0,
         kalan_bakiye: p.acikBakiye,
         odeme_turu: "PERSONEL DEVİR",
         aciklama: `${aktifDonem} Personel Devir (${p.isim})`,
         ekleyen: aktifKullaniciEposta
       }));

     if(devirFisleri.length > 0 || personelDevirFisleri.length > 0) {
         const { error } = await supabase.from("satis_fisleri").insert([...devirFisleri, ...personelDevirFisleri]);
         if (error) {
           alert("Dönem kapatma hatası: " + veritabaniHatasiMesaji("satis_fisleri", error));
           return;
         }
     }
     
     setAktifDonem(nextDonem);
     setIsDonemModalOpen(false);
     setDonemOnay(false);
     await verileriGetir("satis");
  }

  // DÖNEM İZOLASYONLARI
  const periodSatisFis = useMemo(() => satisFisList.filter(f => f.tarih.startsWith(aktifDonem)), [satisFisList, aktifDonem]);
  const periodSut = useMemo(() => sutList.filter(s => s.tarih.startsWith(aktifDonem)), [sutList, aktifDonem]);
  const periodSatisList = useMemo(() => satisList.filter(s => s.tarih.startsWith(aktifDonem)), [satisList, aktifDonem]);
  const periodGider = useMemo(() => giderList.filter(g => g.tarih.startsWith(aktifDonem)), [giderList, aktifDonem]);
  const periodUretim = useMemo(() => uretimList.filter(u => u.tarih.startsWith(aktifDonem)), [uretimList, aktifDonem]);

  const fSayi = (num: any) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(num) || 0).replace(/,00$/, '');
  const fSayiNoDec = (num: any) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(num) || 0);
  const donemMetni = (donem: string) => donem.replace("-", " / ");
  const paraGirdisiniTemizle = (value: string) => {
    const temiz = String(value || "")
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=.*\.)/g, "");
    const negatif = temiz.startsWith("-");
    const isaretsiz = negatif ? temiz.slice(1) : temiz;
    const noktasiz = isaretsiz.replace(/\./g, "");
    const [tamKisim = "", ...ondalikParcalar] = noktasiz.split(",");
    const ondalik = ondalikParcalar.join("").slice(0, 2);
    return `${negatif ? "-" : ""}${tamKisim}${ondalik ? `.${ondalik}` : ""}`;
  };
  const paraGirdisiniSayiyaCevir = (value: string) => Number(paraGirdisiniTemizle(value)) || 0;
  const paraGirdisiniFormatla = (value: string) => {
    const temiz = paraGirdisiniTemizle(value);
    if (!temiz) return "";
    const negatif = temiz.startsWith("-");
    const isaretsiz = negatif ? temiz.slice(1) : temiz;
    const [tamKisim = "", ondalik] = isaretsiz.split(".");
    const formatliTamKisim = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Number(tamKisim || 0));
    return `${negatif ? "-" : ""}${formatliTamKisim}${ondalik !== undefined ? `,${ondalik}` : ""}`;
  };
  const renderKompaktToplamlar = (
    kartlar: Array<{ etiket: string; deger: string; renk: string; onClick?: () => void }>,
    style?: CSSProperties,
    variant: "auto" | "three" | "two" = "auto",
    extraClassName = "",
  ) => (
    <div className={`compact-totals ${variant} ${extraClassName}`.trim()} style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px", ...style }}>
      {kartlar.map((kart) => (
        <div
          key={kart.etiket}
          onClick={kart.onClick}
          className="c-kutu"
          style={{
            border: `1px solid ${kart.renk}33`,
            background: `${kart.renk}10`,
            color: kart.renk,
            borderRadius: "999px",
            padding: "4px 8px",
            fontSize: "11px",
            fontWeight: "bold",
            cursor: kart.onClick ? "pointer" : "default",
            userSelect: "none",
            overflow: "hidden",
          }}
        >
          <span>{kart.etiket}</span>
          <b>{kart.deger}</b>
        </div>
      ))}
    </div>
  );

  const renderNot = (not: any) => {
    if (!not) return "";
    return not.length <= 15 ? not : <span onClick={(e) => { e.stopPropagation(); setDetayNot(not); }} style={{ cursor: "pointer", borderBottom: "1px dashed #94a3b8", color: "#3b82f6" }}>{not.substring(0, 15)}...</span>;
  };

  const fisGorunenBayi = (fis: SatisFis) => {
    const bayiAdi = satisFisBayiAdiGetir(fis);
    if (bayiAdi !== "SİSTEM İŞLEMİ") return bayiAdi;
    const odemeTuru = odemeTurunuNormalizeEt(fis.odeme_turu);
    if (odemeTuru === "PERSONEL DEVİR" || odemeTuru === "PERSONEL DEVIR") return "PERSONEL DEVİRİ";
    if (odemeTuru === "DEVİR" || odemeTuru === "DEVIR") return "DÖNEM DEVİRİ";
    if (odemeTuru === "KASAYA DEVİR" || odemeTuru === "KASAYA DEVIR") return "KASAYA DEVİR";
    return fis.odeme_turu || "SİSTEM İŞLEMİ";
  };

  async function ayarIslem(tablo: string, isim: any, islemTip: string, id: any, resetFn?: any) {
    if (islemTip === "ekle") {
      if (!isim.trim()) return;
      if (tablo !== "gider_turleri" && ayarKayitAdiVarMi(tablo as "bayiler" | "urunler" | "ciftlikler", isim)) {
        return alert("Aynı isimde kayıt zaten var. Lütfen farklı bir isim kullanın.");
      }
      if (tablo === "gider_turleri" && ayarKayitAdiVarMi("gider_turleri", isim)) {
        return alert("Aynı isimde gider türü zaten var.");
      }
      const insertData: any = tablo === "gider_turleri" ? { isim } : { isim, aktif: true };
      const { error } = await supabase.from(tablo).insert(insertData);
      if (error) return alert(`Hata: ${error.message}`);
      if(resetFn) resetFn("");
    } else if (islemTip === "guncelle") {
      if (!isim?.trim() || !id) return;
      if (ayarKayitAdiVarMi(tablo as "bayiler" | "urunler" | "ciftlikler" | "gider_turleri", isim, id)) {
        return alert("Aynı isimde başka bir kayıt zaten var.");
      }
      const { error } = await supabase.from(tablo).update({ isim }).eq("id", id);
      if (error) return alert(`Hata: ${error.message}`);
    } else if (islemTip === "durum") {
      if (!id) return;
      const { error } = await supabase.from(tablo).update({ aktif: Boolean(isim) }).eq("id", id);
      if (error) return alert(`Hata: ${error.message}`);
    } else if (islemTip === "sil") {
      await supabase.from(tablo).delete().eq("id", id);
    }
    verileriGetir("ayar"); 
  }

  const handleAyarEkle = () => {
      if (!yeniAyarDeger.trim()) return;
      if (!["musteriler", "urunler", "ciftlikler", "gider_turleri"].includes(activeAyarTab)) return;
      const tabloAdi =
        activeAyarTab === 'musteriler'
          ? 'bayiler'
          : activeAyarTab === 'urunler'
            ? 'urunler'
            : activeAyarTab === 'ciftlikler'
              ? 'ciftlikler'
              : 'gider_turleri';
      ayarIslem(tabloAdi, yeniAyarDeger, "ekle", null, setYeniAyarDeger);
  };

  const sortData = (data: any[], sortConfig: any) => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      const valA = a[sortConfig.key], valB = b[sortConfig.key];
      const numA = Number(valA), numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
        if (numA < numB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (numA > numB) return sortConfig.direction === 'asc' ? 1 : -1;
      } else {
        const strA = String(valA || ''), strB = String(valB || '');
        if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
      }

      const createdAtA = Date.parse(String(a.created_at || ""));
      const createdAtB = Date.parse(String(b.created_at || ""));
      if (!Number.isNaN(createdAtA) && !Number.isNaN(createdAtB) && createdAtA !== createdAtB) {
        return sortConfig.direction === 'asc' ? createdAtA - createdAtB : createdAtB - createdAtA;
      }

      const idA = Number(a.id);
      const idB = Number(b.id);
      if (!Number.isNaN(idA) && !Number.isNaN(idB) && idA !== idB) {
        return sortConfig.direction === 'asc' ? idA - idB : idB - idA;
      }

      return sortConfig.direction === 'asc'
        ? String(a.id || '').localeCompare(String(b.id || ''))
        : String(b.id || '').localeCompare(String(a.id || ''));
    });
  };

  const handleCheckboxToggle = (listName: 'ciftlikler' | 'bayiler' | 'urunler', setStateFn: any, val: string) => {
    setStateFn((prev: any) => {
      const arr = prev[listName];
      if (arr.includes(val)) return { ...prev, [listName]: arr.filter((x: string) => x !== val) };
      return { ...prev, [listName]: [...arr, val] };
    });
  };

  const handleSortClick = (sortKey: string, currentSort: any, setSort: any) => {
      if (currentSort.key === sortKey) {
          setSort({ key: sortKey, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' });
      } else {
          setSort({ key: sortKey, direction: 'desc' });
      }
  };

  const Th = ({ label, sortKey, currentSort, setSort, align="left", filterType = null, isAnaliz = false, hideSortIndicator = false, compact = false, cellStyle = {} }: any) => (
    <th style={{ textAlign: align, ...cellStyle }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: align === 'center' ? 'center' : 'space-between', gap: compact ? '2px' : '4px', cursor: 'pointer' }} onClick={() => handleSortClick(sortKey, currentSort, setSort)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '2px' : '4px', justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start', flex: align === 'center' ? '0 1 auto' : 1 }}>
            <span>{label}</span>
            {filterType && (
              <span onClick={(e) => { e.stopPropagation(); setActiveFilterModal(filterType); }} style={{ fontSize: compact ? '8px' : '10px', padding: compact ? '1px' : '2px', background: isAnaliz ? '#7c3aed' : '#e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                🔽
              </span>
            )}
          </div>
          <span style={{fontSize:'9px', color: isAnaliz ? '#d8b4fe' : '#94a3b8', paddingLeft: hideSortIndicator ? '0' : '2px', textAlign: 'right', visibility: hideSortIndicator ? 'hidden' : 'visible', width: hideSortIndicator ? '0' : 'auto', overflow: 'hidden'}}>
            {currentSort.key === sortKey ? (currentSort.direction === 'asc' ? '▲' : '▼') : ''}
          </span>
        </div>
      </div>
    </th>
  );

  async function handleSutKaydet() {
    if (!sutForm.ciftlik || !sutForm.kg || !sutForm.fiyat) return alert("Çiftlik, KG ve Fiyat alanları zorunludur!");
    const duzenlenenKayit = sutList.find((item) => item.id === editingSutId);
    if (editingSutId && !kaydiDuzenleyebilirMi(duzenlenenKayit?.ekleyen)) {
      return alert("Bu süt kaydını sadece ekleyen kullanıcı veya admin düzenleyebilir.");
    }
    const p = {
      ...sutForm,
      ciftlik_id: seciliCiftlikId(sutForm.ciftlik),
      kg: Number(sutForm.kg),
      fiyat: Number(sutForm.fiyat),
      toplam_tl: Number(sutForm.kg) * Number(sutForm.fiyat),
      ekleyen: aktifKullaniciEposta,
    };
    const { error } = editingSutId ? await supabase.from("sut_giris").update(p).eq("id", editingSutId) : await supabase.from("sut_giris").insert(p);
    if (error) return alert("Hata: " + error.message);
    setSutForm({ tarih: aktifDonemTarihi(), ciftlik: "", kg: "", fiyat: "", aciklama: "" }); 
    setEditingSutId(null); setIsSutModalOpen(false); verileriGetir("sut"); 
  }

  const handleSutCiftlikSecimi = (secilenCiftlik: string) => {
    const hafizaFiyati = sonSutFiyatiniGetir(secilenCiftlik);
    setSutForm((prev) => ({
      ...prev,
      ciftlik: secilenCiftlik,
      fiyat: hafizaFiyati || prev.fiyat || "",
    }));
  };

  const handleYeniSutModalAc = () => {
    setSutForm({ tarih: aktifDonemTarihi(), ciftlik: "", kg: "", fiyat: "", aciklama: "" });
    setEditingSutId(null);
    setIsSutModalOpen(true);
  };

  async function handleGiderKaydet() {
    if (!giderForm.tarih || !giderForm.tur || !giderForm.tutar) return alert("Tarih, Tür ve Tutar zorunludur!");
    const duzenlenenKayit = giderList.find((item) => item.id === editingGiderId);
    if (editingGiderId && !kaydiDuzenleyebilirMi(duzenlenenKayit?.ekleyen)) {
      return alert("Bu gider kaydını sadece ekleyen kullanıcı veya admin düzenleyebilir.");
    }
    const oncekiGorsel = duzenlenenKayit?.gorsel || giderGorselMevcutYol || "";
    let yuklenenGorselYolu = giderGorselMevcutYol || null;

    try {
      yuklenenGorselYolu = await giderGorseliYukle();
    } catch (error: any) {
      alert(`Gider görseli yüklenemedi: ${error?.message || "Bilinmeyen hata"}`);
      return;
    }

    const giderPayload = {
      ...giderForm,
      tutar: Number(giderForm.tutar),
      ekleyen: aktifKullaniciEposta,
      gorsel: yuklenenGorselYolu,
    };

    const kaydet = (payload: typeof giderPayload) =>
      editingGiderId
        ? supabase.from("giderler").update(payload).eq("id", editingGiderId)
        : supabase.from("giderler").insert(payload);

    let { error } = await kaydet(giderPayload);

    if (error && kolonBulunamadiMi(error, "giderler", "gorsel")) {
      if (giderGorselDosya || giderGorselMevcutYol) {
        if (giderGorselDosya && yuklenenGorselYolu && yuklenenGorselYolu !== oncekiGorsel) {
          await fisGorseliniSil(yuklenenGorselYolu);
        }
        alert("Gider görseli kolonu veritabanında yok. Önce SQL dosyasını çalıştırın: add-gider-gorseli-column.sql");
        return;
      }

      const sonuc = await kaydet({
        ...giderPayload,
        gorsel: undefined,
      } as any);
      error = sonuc.error;
    }

    if (error) {
      if (giderGorselDosya && yuklenenGorselYolu && yuklenenGorselYolu !== oncekiGorsel) {
        await fisGorseliniSil(yuklenenGorselYolu);
      }
      return alert("Hata: " + error.message);
    }

    if (editingGiderId && oncekiGorsel && oncekiGorsel !== yuklenenGorselYolu) {
      await fisGorseliniSil(oncekiGorsel);
    }

    setGiderForm({ tarih: aktifDonemTarihi(), tur: "Genel Gider", aciklama: "", tutar: "" });
    setGiderGorselDosya(null);
    setGiderGorselMevcutYol("");
    setEditingGiderId(null);
    setIsGiderModalOpen(false);
    verileriGetir("gider");
  }

  const uretimSonFiyatlar = useMemo(() => {
    const sirali = [...uretimList].sort((a, b) => {
      const tarihFarki = new Date(b.tarih).getTime() - new Date(a.tarih).getTime();
      if (tarihFarki !== 0) return tarihFarki;
      return sayiDegeri(b.id) - sayiDegeri(a.id);
    });
    const yogurtKayitlari = sirali.filter((item) => (item.uretim_tipi || "yogurt") === "yogurt");
    const kaymakKayitlari = sirali.filter((item) => item.uretim_tipi === "sut_kaymagi");
    const sonDoluFiyat = (liste: Uretim[], alan: keyof Uretim) =>
      liste.find((item) => sayiDegeri(item[alan]) > 0)?.[alan] || "";

    return {
      sut: sonDoluFiyat(yogurtKayitlari, "sut_fiyat"),
      toz: sonDoluFiyat(yogurtKayitlari, "sut_tozu_fiyat"),
      yag: sonDoluFiyat(yogurtKayitlari, "tereyag_fiyat"),
      katki: sonDoluFiyat(yogurtKayitlari, "katki_fiyat"),
      su: sonDoluFiyat(yogurtKayitlari, "su_fiyat"),
      kova3: sonDoluFiyat(yogurtKayitlari, "kova_3_fiyat"),
      kova5: sonDoluFiyat(yogurtKayitlari, "kova_5_fiyat"),
      satis2: sonDoluFiyat(kaymakKayitlari, "satis_2_fiyat"),
      satis3: sonDoluFiyat(yogurtKayitlari, "satis_3_fiyat"),
      satis5: sonDoluFiyat(yogurtKayitlari, "satis_5_fiyat"),
      krema: sonDoluFiyat(kaymakKayitlari, "krema_fiyat"),
      diger: sonDoluFiyat(kaymakKayitlari, "diger_fiyat"),
      yogurt: {
        sut: sonDoluFiyat(yogurtKayitlari, "sut_fiyat"),
        toz: sonDoluFiyat(yogurtKayitlari, "sut_tozu_fiyat"),
        yag: sonDoluFiyat(yogurtKayitlari, "tereyag_fiyat"),
        katki: sonDoluFiyat(yogurtKayitlari, "katki_fiyat"),
        su: sonDoluFiyat(yogurtKayitlari, "su_fiyat"),
        kova3: sonDoluFiyat(yogurtKayitlari, "kova_3_fiyat"),
        kova5: sonDoluFiyat(yogurtKayitlari, "kova_5_fiyat"),
        satis3: sonDoluFiyat(yogurtKayitlari, "satis_3_fiyat"),
        satis5: sonDoluFiyat(yogurtKayitlari, "satis_5_fiyat"),
      },
      sut_kaymagi: {
        sut: sonDoluFiyat(kaymakKayitlari, "sut_fiyat"),
        yag: sonDoluFiyat(kaymakKayitlari, "tereyag_fiyat"),
        katki: sonDoluFiyat(kaymakKayitlari, "katki_fiyat"),
        su: sonDoluFiyat(kaymakKayitlari, "su_fiyat"),
        krema: sonDoluFiyat(kaymakKayitlari, "krema_fiyat"),
        diger: sonDoluFiyat(kaymakKayitlari, "diger_fiyat"),
        paket2: sonDoluFiyat(kaymakKayitlari, "paket_2_fiyat"),
        paket3: sonDoluFiyat(kaymakKayitlari, "paket_3_fiyat"),
        satis2: sonDoluFiyat(kaymakKayitlari, "satis_2_fiyat"),
        satis3: sonDoluFiyat(kaymakKayitlari, "satis_3_fiyat"),
      },
    };
  }, [uretimList]);

  async function handleUretimKaydet() {
    if (!uretimForm.tarih) return alert("Tarih zorunludur!");
    const duzenlenenKayit = uretimList.find((item) => item.id === editingUretimId);
    if (editingUretimId && !kaydiDuzenleyebilirMi(duzenlenenKayit?.ekleyen)) {
      return alert("Bu üretim kaydını sadece ekleyen kullanıcı veya admin düzenleyebilir.");
    }
    const maliyet = uretimMaliyetToplami(uretimForm);
    const satisDegeri = uretimSatisToplami(uretimForm);
    const hesaplananKar = satisDegeri - maliyet;
    const topKg = uretimGirenToplamKg(uretimForm);
    const cikanToplamKg = uretimCikanToplamKg(uretimForm);

    const p = {
      tarih: uretimForm.tarih,
      cig_sut: sayiDegeri(uretimForm.cig_sut),
      sut_fiyat: sayiDegeri(uretimForm.sut_fiyat),
      sut_tozu: sayiDegeri(uretimForm.sut_tozu),
      sut_tozu_fiyat: sayiDegeri(uretimForm.sut_tozu_fiyat),
      tereyag: sayiDegeri(uretimForm.tereyag),
      tereyag_fiyat: sayiDegeri(uretimForm.tereyag_fiyat),
      katki_kg: sayiDegeri(uretimForm.katki_kg),
      katki_fiyat: sayiDegeri(uretimForm.katki_fiyat),
      su: sayiDegeri(uretimForm.su),
      kova_3_adet: sayiDegeri(uretimForm.kova_3_adet),
      kova_3_fiyat: sayiDegeri(uretimForm.kova_3_fiyat),
      kova_5_adet: sayiDegeri(uretimForm.kova_5_adet),
      kova_5_fiyat: sayiDegeri(uretimForm.kova_5_fiyat),
      cikti_3kg: sayiDegeri(uretimForm.cikti_3kg),
      satis_3_fiyat: sayiDegeri(uretimForm.satis_3_fiyat),
      cikti_5kg: sayiDegeri(uretimForm.cikti_5kg),
      satis_5_fiyat: sayiDegeri(uretimForm.satis_5_fiyat),
      toplam_kg: topKg,
      toplam_maliyet: maliyet,
      kar: hesaplananKar,
      aciklama: uretimAciklamasiniBirlestir(uretimForm.aciklama, {
        uretim_tipi: uretimForm.uretim_tipi || "yogurt",
        su_fiyat: sayiVeyaBos(uretimForm.su_fiyat),
        krema: sayiVeyaBos(uretimForm.krema),
        krema_fiyat: sayiVeyaBos(uretimForm.krema_fiyat),
        diger_adet: sayiVeyaBos(uretimForm.diger_adet),
        diger_kg: sayiVeyaBos(uretimForm.diger_kg),
        diger_fiyat: sayiVeyaBos(uretimForm.diger_fiyat),
        paket_2_adet: sayiVeyaBos(uretimForm.paket_2_adet),
        paket_2_fiyat: sayiVeyaBos(uretimForm.paket_2_fiyat),
        paket_3_adet: sayiVeyaBos(uretimForm.paket_3_adet),
        paket_3_fiyat: sayiVeyaBos(uretimForm.paket_3_fiyat),
        cikti_2kg: sayiVeyaBos(uretimForm.cikti_2kg),
        cikti_2kg_kg: sayiVeyaBos(uretimForm.cikti_2kg_kg),
        satis_2_fiyat: sayiVeyaBos(uretimForm.satis_2_fiyat),
        cikti_3kg_kg: sayiVeyaBos(uretimForm.cikti_3kg_kg),
        cikti_5kg_kg: sayiVeyaBos(uretimForm.cikti_5kg_kg),
        cikan_toplam_kg: cikanToplamKg,
      }),
      ekleyen: aktifKullaniciEposta,
    };

    let { error } = editingUretimId
      ? await supabase.from("uretim").update(p).eq("id", editingUretimId)
      : await supabase.from("uretim").insert(p);

    if (error?.message?.includes("'ekleyen'")) {
      const fallbackPayload = { ...p } as Partial<typeof p>;
      delete fallbackPayload.ekleyen;
      const retryResult = editingUretimId
        ? await supabase.from("uretim").update(fallbackPayload).eq("id", editingUretimId)
        : await supabase.from("uretim").insert(fallbackPayload);
      error = retryResult.error;
    }

    if (error) return alert("Hata: " + error.message);

    const sonrakiTip = uretimForm.uretim_tipi || "yogurt";
    setUretimForm(bosUretimFormu(aktifDonemTarihi(), sonrakiTip, uretimSonFiyatlar[sonrakiTip]));
    setEditingUretimId(null); setIsUretimModalOpen(false); verileriGetir("uretim");
  }

  async function handleTahsilatKaydet() {
    if (!tahsilatForm.bayi || !tahsilatForm.miktar) return alert("Bayi ve miktar alanları zorunludur!");
    if (!tumBayiler.some(b => b.isim === tahsilatForm.bayi)) return alert("Lütfen listeden geçerli bir Bayi/Müşteri seçin! Kendiniz rastgele isim giremezsiniz.");

    const tMiktar = paraGirdisiniSayiyaCevir(tahsilatForm.miktar);
    if (tMiktar <= 0) return alert("Geçerli bir tahsilat tutarı girin.");

    const fNo = `T-${Date.now().toString().slice(-6)}${Math.floor(Math.random()*1000)}`;
    const fData = {
        fis_no: fNo,
        tarih: tahsilatForm.tarih,
        bayi: tahsilatForm.bayi,
        bayi_id: seciliBayiId(tahsilatForm.bayi),
        toplam_tutar: 0,
        tahsilat: tMiktar,
        kalan_bakiye: -tMiktar,
        odeme_turu: tahsilatForm.odeme_turu,
        aciklama: tahsilatForm.aciklama ? `[Sadece Tahsilat] - ${tahsilatForm.aciklama}` : `[Sadece Tahsilat]`,
        ekleyen: aktifKullaniciEposta
    };

    const { error } = await supabase.from("satis_fisleri").insert(fData);
    if (error) return alert("Hata: " + veritabaniHatasiMesaji("satis_fisleri", error));

    setTahsilatForm({ tarih: aktifDonemTarihi(), bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" });
    setIsTahsilatModalOpen(false);
    verileriGetir("satis");
  }

  const resetDigerForm = () => {
    setDigerModalConfig({ isOpen: false, type: null, mode: "create", fisId: null });
    setDigerForm({ tarih: getLocalDateString(), tutar: "", aciklama: "" });
  };

  const handleKasaDevirGoruntule = (fis: SatisFis) => {
    setDigerForm({
      tarih: fis.tarih || getLocalDateString(),
      tutar: paraGirdisiniTemizle(String(Number(fis.tahsilat || 0) || "")),
      aciklama: fis.aciklama || "",
    });
    setDigerModalConfig({ isOpen: true, type: "kasa_devir", mode: "view", fisId: Number(fis.id) || null });
  };

  const handleKasaDevirDuzenle = (fis: SatisFis) => {
    if (!fisDuzenlenebilirMi(fis)) {
      alert("Bu kasa devir fiÅŸini sadece ekleyen kullanÄ±cÄ± veya admin dÃ¼zenleyebilir.");
      return;
    }
    setDigerForm({
      tarih: fis.tarih || getLocalDateString(),
      tutar: paraGirdisiniTemizle(String(Number(fis.tahsilat || 0) || "")),
      aciklama: fis.aciklama || "",
    });
    setDigerModalConfig({ isOpen: true, type: "kasa_devir", mode: "edit", fisId: Number(fis.id) || null });
  };

  async function handleDigerIslemKaydet() {
    return handleKasaDevirKaydet();
    if (!digerForm.tutar || paraGirdisiniSayiyaCevir(digerForm.tutar) <= 0) return alert("Geçerli bir tutar girin.");

    const fNo = `D-${Date.now().toString().slice(-6)}${Math.floor(Math.random()*1000)}`;
    const tahsilat = paraGirdisiniSayiyaCevir(digerForm.tutar);

    const fData = {
        fis_no: fNo,
        tarih: digerForm.tarih,
        bayi_id: null,
        bayi: "SİSTEM İŞLEMİ",
        toplam_tutar: 0,
        tahsilat: tahsilat,
        kalan_bakiye: 0,
        odeme_turu: 'KASAYA DEVİR',
        aciklama: digerForm.aciklama,
        ekleyen: aktifKullaniciEposta
    };

    const { error } = await supabase.from("satis_fisleri").insert(fData);
    if (error) return alert("Hata: " + veritabaniHatasiMesaji("satis_fisleri", error));

    resetDigerForm();
    verileriGetir("satis");
  }

  async function handleKasaDevirKaydet() {
    if (!digerForm.tutar || paraGirdisiniSayiyaCevir(digerForm.tutar) <= 0) return alert("Geçerli bir tutar girin.");

    const tahsilat = paraGirdisiniSayiyaCevir(digerForm.tutar);
    const ortakData = {
      tarih: digerForm.tarih,
      bayi_id: null,
      bayi: "SİSTEM İŞLEMİ",
      toplam_tutar: 0,
      tahsilat,
      kalan_bakiye: 0,
      odeme_turu: "KASAYA DEVİR",
      aciklama: digerForm.aciklama,
    };

    const { error } =
      digerModalConfig.mode === "edit" && digerModalConfig.fisId
        ? await supabase.from("satis_fisleri").update(ortakData).eq("id", digerModalConfig.fisId)
        : await supabase.from("satis_fisleri").insert({
            ...ortakData,
            fis_no: `D-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)}`,
            ekleyen: aktifKullaniciEposta,
          });

    if (error) return alert("Hata: " + veritabaniHatasiMesaji("satis_fisleri", error));

    resetDigerForm();
    verileriGetir("satis");
  }

  const handleBayiSecimi = (secilenBayi: string) => {
    if (!secilenBayi) return;
    const yeniDetay = { ...fisDetay };
    const secilenBayiId = seciliBayiId(secilenBayi);
    const secilenBayiAnahtari = secilenBayiId
      ? `id:${secilenBayiId}`
      : `isim:${masterKayitIsminiNormalizeEt(secilenBayi)}`;
    
    urunler.forEach(u => {
      const urunAnahtari = `id:${u.id}`;
      const bayiSatislari = satisList.filter(
        (s) =>
          satisSatiriBayiAnahtariGetir(s) === secilenBayiAnahtari &&
          (
            satisSatiriUrunAnahtariGetir(s) === urunAnahtari ||
            masterKayitIsminiNormalizeEt(satisSatiriUrunAdiGetir(s)) === masterKayitIsminiNormalizeEt(u.isim)
          ),
      );
      let hafizaFiyat = u.fiyat || "";
      if (bayiSatislari.length > 0) {
        const sonSatis = [...bayiSatislari].sort((a, b) => {
          const tarihFarki = String(b.tarih || "").localeCompare(String(a.tarih || ""));
          if (tarihFarki !== 0) return tarihFarki;
          return Number(b.id || 0) - Number(a.id || 0);
        })[0];
        hafizaFiyat = sonSatis.fiyat;
      }
      if (!editingFisId) yeniDetay[u.id] = { adet: fisDetay[u.id]?.adet || "", kg: fisDetay[u.id]?.kg || "", fiyat: String(hafizaFiyat) };
    });

    const bayiIadeler = satisList.filter(
      (s) =>
        satisSatiriBayiAnahtariGetir(s) === secilenBayiAnahtari &&
        satisSatiriUrunAdiGetir(s) === "İade",
    );
    let hafizaIadeFiyat = "15";
    if (bayiIadeler.length > 0) {
        const sonIade = [...bayiIadeler].sort((a, b) => {
          const tarihFarki = String(b.tarih || "").localeCompare(String(a.tarih || ""));
          if (tarihFarki !== 0) return tarihFarki;
          return Number(b.id || 0) - Number(a.id || 0);
        })[0];
        hafizaIadeFiyat = String(Math.abs(Number(sonIade.fiyat)));
    }
    
    const bayiKovalar = satisList.filter(
      (s) =>
        satisSatiriBayiAnahtariGetir(s) === secilenBayiAnahtari &&
        satisSatiriUrunAdiGetir(s) === "Boş Kova",
    );
    let hafizaKovaFiyat = "15";
    if (bayiKovalar.length > 0) {
        const sonKova = [...bayiKovalar].sort((a, b) => {
          const tarihFarki = String(b.tarih || "").localeCompare(String(a.tarih || ""));
          if (tarihFarki !== 0) return tarihFarki;
          return Number(b.id || 0) - Number(a.id || 0);
        })[0];
        hafizaKovaFiyat = String(Math.abs(Number(sonKova.fiyat)));
    }

    if (!editingFisId) {
        yeniDetay["v_iade"] = { adet: fisDetay["v_iade"]?.adet || "", kg: "", fiyat: hafizaIadeFiyat };
        yeniDetay["v_bos_kova"] = { adet: fisDetay["v_bos_kova"]?.adet || "", kg: "", fiyat: hafizaKovaFiyat };
    }

    setFisDetay(yeniDetay);
  };

  const handleBayiModalSecimi = (secilenBayi: string) => {
    if (!secilenBayi) return;

    if (bayiSecimModal.hedef === "fis") {
      setFisUst((prev) => ({ ...prev, bayi: secilenBayi }));
      handleBayiSecimi(secilenBayi);
    }

    if (bayiSecimModal.hedef === "tahsilat") {
      setTahsilatForm((prev) => ({ ...prev, bayi: secilenBayi }));
    }

    bayiSecimModalKapat();
  };

  const filtrelenmisBayiler = useMemo(() => {
    const arama = bayiSecimModal.arama.trim().toLocaleLowerCase("tr-TR");
    const kaynakListe =
      bayiSecimModal.hedef === "tahsilat" || editingFisId
        ? tumBayiler
        : aktifBayiler;
    if (!arama) return kaynakListe;
    return kaynakListe.filter((bayi) => bayi.isim.toLocaleLowerCase("tr-TR").includes(arama));
  }, [aktifBayiler, bayiSecimModal.arama, bayiSecimModal.hedef, editingFisId, tumBayiler]);

  const aktifBayi = fisUst.bayi;
  const aktifBayiId = useMemo(() => seciliBayiId(aktifBayi), [aktifBayi, seciliBayiId]);
  const aktifBayiAnahtari = useMemo(
    () => (aktifBayiId ? `id:${aktifBayiId}` : `isim:${masterKayitIsminiNormalizeEt(aktifBayi)}`),
    [aktifBayi, aktifBayiId, masterKayitIsminiNormalizeEt],
  );
  
  const eskiBorc = useMemo(() => {
      if (!aktifBayi) return 0;
      const bayiFisleri = periodSatisFis.filter(
        (f) =>
          satisFisBayiAnahtariGetir(f) === aktifBayiAnahtari &&
          f.id !== editingFisId &&
          !sistemIslemiMi(satisFisBayiAdiGetir(f)),
      );
      return bayiFisleri.reduce((toplam, f) => toplam + Number(f.kalan_bakiye || 0), 0);
  }, [aktifBayi, aktifBayiAnahtari, editingFisId, periodSatisFis, satisFisBayiAdiGetir, satisFisBayiAnahtariGetir]);

  const fisCanliToplam = useMemo(() => {
    const urunToplami = urunler.reduce((toplam, u) => {
      const adet = Number(fisDetay[u.id]?.adet) || 0;
      const kg = Number(fisDetay[u.id]?.kg) || 0;
      const fiyat = Number(fisDetay[u.id]?.fiyat) || 0;
      const isKova = u.isim.match(/([345])\s*kg/i);
      const miktar = isKova ? adet : (kg > 0 ? kg : adet); 
      return toplam + (miktar * fiyat);
    }, 0);
    
    const iAdet = Number(fisDetay["v_iade"]?.adet) || 0;
    const iKg = Number(fisDetay["v_iade"]?.kg) || 0;
    const iFiyat = Number(fisDetay["v_iade"]?.fiyat) || 0;
    const iMiktar = iKg > 0 ? iKg : iAdet;

    const kAdet = Number(fisDetay["v_bos_kova"]?.adet) || 0;
    const kKg = Number(fisDetay["v_bos_kova"]?.kg) || 0;
    const kFiyat = Number(fisDetay["v_bos_kova"]?.fiyat) || 0;
    const kMiktar = kKg > 0 ? kKg : kAdet;

    return urunToplami - (iMiktar * iFiyat) - (kMiktar * kFiyat);
  }, [urunler, fisDetay]);

  const toplamGenelBorc = eskiBorc + (fisCanliToplam - paraGirdisiniSayiyaCevir(fisUst.tahsilat || ""));

  const fisGorselDosyaAdi = useMemo(() => {
    if (fisGorselDosya?.name) return fisGorselDosya.name;
    if (!fisGorselMevcutYol) return "";
    return fisGorselMevcutYol.split("/").pop() || fisGorselMevcutYol;
  }, [fisGorselDosya, fisGorselMevcutYol]);

  const giderGorselDosyaAdi = useMemo(() => {
    if (giderGorselDosya?.name) return giderGorselDosya.name;
    if (!giderGorselMevcutYol) return "";
    return giderGorselMevcutYol.split("/").pop() || giderGorselMevcutYol;
  }, [giderGorselDosya, giderGorselMevcutYol]);

  const fisGorselStorageYolu = (raw?: string | null) => {
    if (!raw) return "";

    const ayiraclar = [
      "/storage/v1/object/sign/fis_gorselleri/",
      "/storage/v1/object/public/fis_gorselleri/",
      "/object/public/fis_gorselleri/",
    ];

    for (const ayirac of ayiraclar) {
      if (raw.includes(ayirac)) {
        return raw.split(ayirac).pop()?.split("?")[0] || "";
      }
    }

    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return "";
    }

    return raw;
  };

  const handleFisGorselSec = (event: ChangeEvent<HTMLInputElement>) => {
    const secilen = event.target.files?.[0];
    event.target.value = "";
    if (!secilen) return;
    if (!secilen.type.startsWith("image/")) {
      alert("Lütfen sadece görsel dosyası seçin.");
      return;
    }
    setFisGorselDosya(secilen);
  };

  const handleFisGorselTemizle = () => {
    setFisGorselDosya(null);
    setFisGorselMevcutYol("");
  };

  const handleGiderGorselSec = (event: ChangeEvent<HTMLInputElement>) => {
    const secilen = event.target.files?.[0];
    event.target.value = "";
    if (!secilen) return;
    if (!secilen.type.startsWith("image/")) {
      alert("Lütfen sadece görsel dosyası seçin.");
      return;
    }
    setGiderGorselDosya(secilen);
  };

  const handleGiderGorselTemizle = () => {
    setGiderGorselDosya(null);
    setGiderGorselMevcutYol("");
  };

  const fisGorseliniSil = async (yol?: string | null) => {
    const storageYolu = fisGorselStorageYolu(yol);
    if (!storageYolu) return;
    const { error } = await supabase.storage.from("fis_gorselleri").remove([storageYolu]);
    if (error) {
      console.warn("Fiş görseli silinemedi:", error.message);
    }
  };

  const handleFisGorselGoster = async (fis: SatisFis) => {
    if (!fis.fis_gorseli) return;

    const raw = fis.fis_gorseli;
    const storageYolu = fisGorselStorageYolu(raw);
    const baslik = `${fis.bayi || "Fiş"} • ${gorunenFisNoOlustur(fis)}`;

    if (!storageYolu && (raw.startsWith("http://") || raw.startsWith("https://"))) {
      setFisGorselOnizleme({ url: raw, baslik });
      return;
    }

    if (!storageYolu) {
      alert("Fiş görseli açılamadı.");
      return;
    }

    const { data, error } = await supabase.storage
      .from("fis_gorselleri")
      .createSignedUrl(storageYolu, 60 * 5);

    if (error || !data?.signedUrl) {
      alert("Fiş görseli açılamadı: " + (error?.message || "Bilinmeyen hata"));
      return;
    }

    setFisGorselOnizleme({ url: data.signedUrl, baslik });
  };

  const handleGiderGorselGoster = async (gider: Gider) => {
    if (!gider.gorsel) return;

    const raw = gider.gorsel;
    const storageYolu = fisGorselStorageYolu(raw);
    const baslik = `${gider.tur || "Gider"} • ${gider.tarih ? gider.tarih.split("-").reverse().join(".") : ""}`;

    if (!storageYolu && (raw.startsWith("http://") || raw.startsWith("https://"))) {
      setFisGorselOnizleme({ url: raw, baslik });
      return;
    }

    if (!storageYolu) {
      alert("Gider görseli açılamadı.");
      return;
    }

    const { data, error } = await supabase.storage
      .from("fis_gorselleri")
      .createSignedUrl(storageYolu, 60 * 10);

    if (error || !data?.signedUrl) {
      alert(`Gider görseli açılamadı: ${error?.message || "Bilinmeyen hata"}`);
      return;
    }

    setFisGorselOnizleme({ url: data.signedUrl, baslik });
  };

  const giderGorseliYukle = async () => {
    if (!giderGorselDosya) return giderGorselMevcutYol || null;

    const uzanti = giderGorselDosya.name.split(".").pop()?.toLowerCase() || "jpg";
    const tarihParcasi = String(giderForm.tarih || getLocalDateString()).replace(/-/g, "");
    const turSlug = dosyaAdiIcinTemizle(giderForm.tur || "gider");
    const kullaniciSlug = dosyaAdiIcinTemizle(aktifKullaniciKisa || aktifKullaniciEposta || "kullanici");
    const rastgeleEk = Math.random().toString(36).slice(2, 8).toUpperCase();
    const dosyaYolu = `giderler/${turSlug}/${tarihParcasi}-${turSlug}-${kullaniciSlug}-${rastgeleEk}.${uzanti}`;

    const { error } = await supabase.storage.from("fis_gorselleri").upload(dosyaYolu, giderGorselDosya, {
      contentType: giderGorselDosya.type,
      upsert: false,
    });

    if (error) throw error;
    return dosyaYolu;
  };

  const handleKayitSil = async (
    tablo: "sut_giris" | "giderler" | "uretim",
    kayit: { id?: string; ekleyen?: string | null; gorsel?: string | null },
    hedef: "sut" | "gider" | "uretim",
  ) => {
    if (!kaydiSilebilirMi(kayit.ekleyen)) {
      alert("Bu kaydı sadece ekleyen kullanıcı veya admin silebilir.");
      return;
    }

    if (!confirm("Sil?")) return;

    const copBasarili = await coptKutusunaAt(tablo, kayit);
    if (!copBasarili) {
      alert("Kayıt çöp kutusuna alınamadığı için silme iptal edildi.");
      return;
    }
    const { error } = await supabase.from(tablo).delete().eq("id", kayit.id);
    if (error) {
      alert(`Silme hatası: ${veritabaniHatasiMesaji(tablo, error)}`);
      return;
    }

    if (tablo === "giderler" && kayit.gorsel) {
      await fisGorseliniSil(kayit.gorsel);
    }

    verileriGetir(hedef);
    verileriGetir("cop");
  };

  const fisGorseliYukle = async (fisNo: string) => {
    if (!fisGorselDosya) return fisGorselMevcutYol || null;

    const uzanti = fisGorselDosya.name.split(".").pop()?.toLowerCase() || "jpg";
    const bayiSlug = dosyaAdiIcinTemizle(fisUst.bayi || "baysiz");
    const yuklemeTarihi = new Date();
    const tarihParcasi = [
      yuklemeTarihi.getFullYear(),
      String(yuklemeTarihi.getMonth() + 1).padStart(2, "0"),
      String(yuklemeTarihi.getDate()).padStart(2, "0"),
      String(yuklemeTarihi.getHours()).padStart(2, "0"),
      String(yuklemeTarihi.getMinutes()).padStart(2, "0"),
      String(yuklemeTarihi.getSeconds()).padStart(2, "0"),
    ].join("");
    const guvenliEk = fisNo.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || Math.random().toString(36).slice(2, 8).toUpperCase();
    const dosyaYolu = `${bayiSlug}/${bayiSlug}-${tarihParcasi}-${guvenliEk}.${uzanti}`;

    const { error } = await supabase.storage.from("fis_gorselleri").upload(dosyaYolu, fisGorselDosya, {
      contentType: fisGorselDosya.type,
      upsert: false,
    });

    if (error) {
      throw error;
    }

    return dosyaYolu;
  };

  async function handleTopluFisKaydet() {
    if (!fisUst.bayi) return alert("Lütfen bir Bayi/Market seçin!");
    const secilebilirBayiler = editingFisId ? tumBayiler : aktifBayiler;
    if (!secilebilirBayiler.some(b => b.isim === fisUst.bayi)) return alert("Lütfen listeden geçerli bir Bayi/Market seçin! Kendiniz rastgele isim giremezsiniz.");
    if (editingFisId && !fisDuzenlenebilirMi({ id: editingFisId, fis_no: editingFisNo || undefined })) {
      return alert("Bu fişi sadece ekleyen kullanıcı veya admin düzenleyebilir.");
    }

    const eklenecekUrunler = urunler.filter(u => Number(fisDetay[u.id]?.adet) > 0 || Number(fisDetay[u.id]?.kg) > 0);
    
    const iadeAdet = Number(fisDetay["v_iade"]?.adet) || 0;
    const iadeKg = Number(fisDetay["v_iade"]?.kg) || 0;
    const iadeFiyat = Number(fisDetay["v_iade"]?.fiyat) || 0;
    const iadeMiktar = iadeKg > 0 ? iadeKg : iadeAdet;

    const kovaAdet = Number(fisDetay["v_bos_kova"]?.adet) || 0;
    const kovaKg = Number(fisDetay["v_bos_kova"]?.kg) || 0;
    const kovaFiyat = Number(fisDetay["v_bos_kova"]?.fiyat) || 0;
    const kovaMiktar = kovaKg > 0 ? kovaKg : kovaAdet;

    if (eklenecekUrunler.length === 0 && iadeMiktar === 0 && kovaMiktar === 0) return alert("Fişte işlem yok! Ürün, iade veya kova girin.");

    let ortakFisNo = editingFisNo || benzersizFisNoOlustur("F");
    const tahsilat = paraGirdisiniSayiyaCevir(fisUst.tahsilat || "");
    const kalanBakiye = fisCanliToplam - tahsilat;
    const yeniGorselSecildi = Boolean(fisGorselDosya);
    let fisGorselYolu = fisGorselMevcutYol || null;
    const secilenBayiId = seciliBayiId(fisUst.bayi);

    const detayPayloadlari = () => {
      const insertArray = eklenecekUrunler.map((u) => {
        const adet = Number(fisDetay[u.id].adet);
        const kg = Number(fisDetay[u.id].kg);
        const fiyat = Number(fisDetay[u.id].fiyat);
        const kgEslesme = u.isim.match(/(\d+(?:\.\d+)?)\s*(kg|lt|l|gr)\b/i);
        const isKova = u.isim.match(/([345])\s*kg/i);

        const hesaplananKg = isKova ? (adet * Number(isKova[1])) : (kg > 0 ? kg : (kgEslesme ? Number(kgEslesme[1]) * adet : adet));
        const miktar = isKova ? adet : (kg > 0 ? kg : adet);
        const tutar = miktar * fiyat;

        return {
          fis_no: ortakFisNo,
          tarih: fisUst.tarih,
          bayi: fisUst.bayi,
          bayi_id: secilenBayiId,
          urun: u.isim,
          urun_id: seciliUrunId(u.isim),
          adet,
          fiyat,
          birim: kgEslesme ? Number(kgEslesme[1]) : 1,
          toplam_kg: hesaplananKg,
          tutar,
          bos_kova: 0,
          aciklama: `Bağlı Fiş: ${ortakFisNo}`,
          ekleyen: aktifKullaniciEposta,
        };
      });

      if (iadeMiktar > 0) {
        insertArray.push({
          fis_no: ortakFisNo,
          tarih: fisUst.tarih,
          bayi_id: secilenBayiId,
          bayi: fisUst.bayi,
          urun_id: null,
          urun: "İade",
          adet: iadeAdet,
          fiyat: -iadeFiyat,
          birim: 1,
          toplam_kg: iadeKg,
          tutar: -(iadeMiktar * iadeFiyat),
          bos_kova: 0,
          aciklama: `Bağlı Fiş: ${ortakFisNo}`,
          ekleyen: aktifKullaniciEposta,
        });
      }

      if (kovaMiktar > 0) {
        insertArray.push({
          fis_no: ortakFisNo,
          tarih: fisUst.tarih,
          bayi_id: secilenBayiId,
          bayi: fisUst.bayi,
          urun_id: null,
          urun: "Boş Kova",
          adet: kovaAdet,
          fiyat: -kovaFiyat,
          birim: 1,
          toplam_kg: kovaKg,
          tutar: -(kovaMiktar * kovaFiyat),
          bos_kova: kovaAdet,
          aciklama: `Bağlı Fiş: ${ortakFisNo}`,
          ekleyen: aktifKullaniciEposta,
        });
      }

      return insertArray;
    };

    const yeniGorseliTemizle = async () => {
      if (yeniGorselSecildi && fisGorselYolu && fisGorselYolu !== fisGorselMevcutYol) {
        await fisGorseliniSil(fisGorselYolu);
      }
    };

    const idsizKayitlar = (kayitlar: Array<Record<string, any>>) =>
      kayitlar.map((kayit) => Object.fromEntries(Object.entries(kayit).filter(([anahtar]) => anahtar !== "id")));

    try {
      fisGorselYolu = await fisGorseliYukle(ortakFisNo);
    } catch (error: any) {
      return alert(`Fiş görseli yüklenemedi: ${error?.message || "Bilinmeyen hata"}`);
    }
    
    const genelNot = [
        fisUst.teslim_alan ? `[Teslim Alan: ${fisUst.teslim_alan}]` : '',
        `[Ödeme: ${fisUst.odeme_turu}]`, 
        fisUst.aciklama
    ].filter(Boolean).join(" - ");

    const fisMaster = {
      fis_no: ortakFisNo,
      tarih: fisUst.tarih,
      bayi: fisUst.bayi,
      bayi_id: secilenBayiId,
      toplam_tutar: fisCanliToplam,
      tahsilat: tahsilat,
      kalan_bakiye: kalanBakiye,
      odeme_turu: fisUst.odeme_turu,
      aciklama: genelNot,
      ekleyen: aktifKullaniciEposta,
      fis_gorseli: fisGorselYolu,
    };

    let savedFisId = editingFisId;

    const rpcDetaylari = detayPayloadlari().map((detay) => ({
      bayi_id: detay.bayi_id,
      urun: detay.urun,
      urun_id: detay.urun_id,
      birim: Number(detay.birim) || 0,
      adet: Number(detay.adet) || 0,
      fiyat: Number(detay.fiyat) || 0,
      toplam_kg: Number(detay.toplam_kg) || 0,
      bos_kova: Number(detay.bos_kova) || 0,
      tutar: Number(detay.tutar) || 0,
      aciklama: detay.aciklama,
    }));

    const { data: rpcFisData, error: rpcFisError } = await supabase.rpc("app_save_satis_fisi", {
      p_fis_id: editingFisId ?? null,
      p_tarih: fisUst.tarih,
      p_bayi: fisUst.bayi,
      p_bayi_id: secilenBayiId,
      p_toplam_tutar: fisCanliToplam,
      p_tahsilat: tahsilat,
      p_kalan_bakiye: kalanBakiye,
      p_odeme_turu: fisUst.odeme_turu,
      p_aciklama: genelNot,
      p_detaylar: rpcDetaylari,
      p_fis_gorseli: fisGorselYolu,
      p_fis_no: ortakFisNo,
    });

    if (!rpcFisError) {
      const sonuc = Array.isArray(rpcFisData) ? rpcFisData[0] : rpcFisData;
      savedFisId = sonuc?.fis_id ?? editingFisId;
      ortakFisNo = sonuc?.fis_no || ortakFisNo;

      if (yeniGorselSecildi && fisGorselMevcutYol && fisGorselMevcutYol !== fisGorselYolu) {
        await fisGorseliniSil(fisGorselMevcutYol);
      }

      const ekstraIndirimler = [];
      if (iadeMiktar > 0) ekstraIndirimler.push({ isim: "İade", adet: iadeAdet, kg: iadeKg, fiyat: iadeFiyat, tutar: -(iadeMiktar * iadeFiyat) });
      if (kovaMiktar > 0) ekstraIndirimler.push({ isim: "Boş Kova", adet: kovaAdet, kg: kovaKg, fiyat: kovaFiyat, tutar: -(kovaMiktar * kovaFiyat) });

      const fisGosterimData = {
        id: savedFisId,
        fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, aciklama: fisUst.aciklama, teslim_alan: fisUst.teslim_alan,
        fis_gorseli: fisGorselYolu,
        ekleyen: aktifKullaniciEposta,
        urunler: eklenecekUrunler.map(u => {
          const adet = Number(fisDetay[u.id].adet);
          const kg = Number(fisDetay[u.id].kg);
          const fiyat = Number(fisDetay[u.id].fiyat);
          const isKova = u.isim.match(/([345])\s*kg/i);
          const miktar = isKova ? adet : (kg > 0 ? kg : adet);
          return { isim: u.isim, adet: adet, kg: kg, fiyat: fiyat, tutar: miktar * fiyat };
        }),
        ekstraIndirimler,
        genelToplam: fisCanliToplam, tahsilat: tahsilat, kalanBakiye: (fisCanliToplam - tahsilat), odeme: fisUst.odeme_turu,
        eskiBorc: eskiBorc, genelBorc: toplamGenelBorc,
        gosterBakiye: false
      };

      resetFisForm(); setIsFisModalOpen(false); verileriGetir("satis"); setSonFisData(fisGosterimData);
      return;
    }

    if (!rpcBulunamadiMi(rpcFisError, "app_save_satis_fisi")) {
      await yeniGorseliTemizle();
      return alert("Kayıt Hatası: " + (rpcFisError.message || "Bilinmeyen RPC hatası"));
    }

    if (editingFisId) {
      const eskiDetaylar = satisList.filter(s => s.fis_no === ortakFisNo);
      const yedekDetaylar = idsizKayitlar(eskiDetaylar as Array<Record<string, any>>);
      const insertArray = detayPayloadlari();

      const { error: detaySilError } = await supabase.from("satis_giris").delete().eq("fis_no", ortakFisNo);
      if (detaySilError) {
        await yeniGorseliTemizle();
        return alert("Güncelleme Hatası: Eski fiş detayları silinemedi. " + veritabaniHatasiMesaji("satis_giris", detaySilError));
      }

      const { error: yeniDetayError } = await supabase.from("satis_giris").insert(insertArray);
      if (yeniDetayError) {
        const geriYuklemeSonucu = yedekDetaylar.length === 0
          ? { error: null }
          : await supabase.from("satis_giris").insert(yedekDetaylar);
        await yeniGorseliTemizle();
        await verileriGetir("satis");
        if (geriYuklemeSonucu.error) {
          return alert("Kritik Hata: Yeni detaylar kaydedilemedi ve eski detaylar geri yüklenemedi. Lütfen yedekten kontrol edin. Hata: " + yeniDetayError.message);
        }
        return alert("Detaylar kaydedilemedi, eski fiş detayları geri yüklendi. Hata: " + yeniDetayError.message);
      }

      const { error: errFisUpd } = await supabase.from("satis_fisleri").update(fisMaster).eq("id", editingFisId);
      if (errFisUpd) {
        const yeniDetaySilmeSonucu = await supabase.from("satis_giris").delete().eq("fis_no", ortakFisNo);
        const geriYuklemeSonucu = !yeniDetaySilmeSonucu.error && yedekDetaylar.length > 0
          ? await supabase.from("satis_giris").insert(yedekDetaylar)
          : { error: null };
        await yeniGorseliTemizle();
        await verileriGetir("satis");
        if (yeniDetaySilmeSonucu.error || geriYuklemeSonucu.error) {
          return alert("Kritik Hata: Fiş başlığı güncellenemedi ve detay rollback'i tamamlanamadı. Lütfen yedekten kontrol edin. Hata: " + veritabaniHatasiMesaji("satis_fisleri", errFisUpd));
        }
        return alert("Fiş güncellenemedi, eski detaylar geri yüklendi. Hata: " + veritabaniHatasiMesaji("satis_fisleri", errFisUpd));
      }
    } else {
      const { data: newFisData, error: errFisIns } = await supabase.from("satis_fisleri").insert(fisMaster).select().single();
      if (errFisIns) {
        await yeniGorseliTemizle();
        return alert("Kayıt Hatası: " + veritabaniHatasiMesaji("satis_fisleri", errFisIns));
      }
      savedFisId = newFisData?.id;
      const insertArray = detayPayloadlari();
      const { error: errDetay } = await supabase.from("satis_giris").insert(insertArray);
      if (errDetay && savedFisId) {
          const { error: fisSilError } = await supabase.from("satis_fisleri").delete().eq("id", savedFisId);
          if (fisSilError) {
            await verileriGetir("satis");
            return alert("Kritik Hata: Satış detayları kaydedilemedi ve fiş geri alınamadı. Lütfen yedekten kontrol edin. Hata: " + errDetay.message);
          }
          await yeniGorseliTemizle();
          return alert("Sistemsel Hata: Detaylar kaydedilemediği için fiş iptal edildi. Lütfen tekrar deneyin. Hata: " + errDetay.message);
      }
    }

    if (yeniGorselSecildi && fisGorselMevcutYol && fisGorselMevcutYol !== fisGorselYolu) {
      await fisGorseliniSil(fisGorselMevcutYol);
    }
    
    const ekstraIndirimler = [];
    if (iadeMiktar > 0) ekstraIndirimler.push({ isim: "İade", adet: iadeAdet, kg: iadeKg, fiyat: iadeFiyat, tutar: -(iadeMiktar * iadeFiyat) });
    if (kovaMiktar > 0) ekstraIndirimler.push({ isim: "Boş Kova", adet: kovaAdet, kg: kovaKg, fiyat: kovaFiyat, tutar: -(kovaMiktar * kovaFiyat) });

    const fisGosterimData = {
      id: savedFisId,
      fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, aciklama: fisUst.aciklama, teslim_alan: fisUst.teslim_alan,
      fis_gorseli: fisGorselYolu,
      ekleyen: aktifKullaniciEposta,
      urunler: eklenecekUrunler.map(u => {
         const adet = Number(fisDetay[u.id].adet);
         const kg = Number(fisDetay[u.id].kg);
         const fiyat = Number(fisDetay[u.id].fiyat);
         const isKova = u.isim.match(/([345])\s*kg/i);
         const miktar = isKova ? adet : (kg > 0 ? kg : adet);
         return { isim: u.isim, adet: adet, kg: kg, fiyat: fiyat, tutar: miktar * fiyat };
      }),
      ekstraIndirimler,
      genelToplam: fisCanliToplam, tahsilat: tahsilat, kalanBakiye: (fisCanliToplam - tahsilat), odeme: fisUst.odeme_turu,
      eskiBorc: eskiBorc, genelBorc: toplamGenelBorc,
      gosterBakiye: false
    };
    
    resetFisForm(); setIsFisModalOpen(false); verileriGetir("satis"); setSonFisData(fisGosterimData);
  }

  const resetFisForm = () => {
    setEditingFisId(null); setEditingFisNo(null);
    setFisUst({ tarih: aktifDonemTarihi(), bayi: "", aciklama: "", odeme_turu: "PEŞİN", tahsilat: "", bos_kova: "", teslim_alan: "" });
    setFisGorselDosya(null);
    setFisGorselMevcutYol("");
    setIsDigerUrunMenuOpen(false);
    setGosterilenEkler({ tereyagi: false, yogurt_kaymagi: false, iade: false, bos_kova: false, urunler: [] });
    const temizDetay: any = {};
    urunler.forEach(u => temizDetay[u.id] = { adet: "", kg: "", fiyat: u.fiyat || "" });
    temizDetay["v_iade"] = { adet: "", kg: "", fiyat: "" };
    temizDetay["v_bos_kova"] = { adet: "", kg: "", fiyat: "" };
    setFisDetay(temizDetay);
  };

  const handleYeniFisAc = () => { resetFisForm(); setIsFisModalOpen(true); };

  const handleFisDuzenle = (fis: any) => {
    if (!fisDuzenlenebilirMi(fis)) {
      alert("Bu fişi sadece ekleyen kullanıcı veya admin düzenleyebilir.");
      return;
    }
    setIsDigerUrunMenuOpen(false);
    setEditingFisId(fis.id); setEditingFisNo(fis.fis_no);
    setFisGorselDosya(null);
    setFisGorselMevcutYol(fis.fis_gorseli || "");
    let safAciklama = fis.aciklama || "";
    let tAlan = "";

    const tMatch = safAciklama.match(/\[Teslim Alan: (.*?)\]/);
    if (tMatch) { tAlan = tMatch[1]; safAciklama = safAciklama.replace(/\[Teslim Alan: .*?\]\s*-\s*/, "").replace(/\[Teslim Alan: .*?\]/, ""); }
    if (safAciklama.includes("[Ödeme: ")) safAciklama = safAciklama.replace(/\[Ödeme: .*?\]\s*-\s*/, "").replace(/\[Ödeme: .*?\]/, "");
    if (safAciklama.includes("[Sadece Tahsilat]")) safAciklama = safAciklama.replace(/\[Sadece Tahsilat\]\s*-\s*/, "").replace(/\[Sadece Tahsilat\]/, "");

    const iadeUrun = periodSatisList.find((s) => s.fis_no === fis.fis_no && satisSatiriUrunAdiGetir(s) === "İade");
    const kovaUrun = periodSatisList.find(
      (s) =>
        s.fis_no === fis.fis_no &&
        (satisSatiriUrunAdiGetir(s) === "İade Kova" || satisSatiriUrunAdiGetir(s) === "Boş Kova"),
    );
    
    const iadeAdetStr = iadeUrun?.adet ? String(iadeUrun.adet) : "";
    const iadeKgStr = iadeUrun?.toplam_kg && Number(iadeUrun.toplam_kg) > 0 ? String(iadeUrun.toplam_kg) : "";
    const iadeFiyatStr = iadeUrun ? String(Math.abs(Number(iadeUrun.fiyat))) : "";

    const kovaAdetStr = kovaUrun?.adet ? String(kovaUrun.adet) : "";
    const kovaKgStr = kovaUrun?.toplam_kg && Number(kovaUrun.toplam_kg) > 0 ? String(kovaUrun.toplam_kg) : "";
    const kovaFiyatStr = kovaUrun ? String(Math.abs(Number(kovaUrun.fiyat))) : "";

    setFisUst({ tarih: fis.tarih, bayi: satisFisBayiAdiGetir(fis), aciklama: safAciklama, odeme_turu: fis.odeme_turu || "PEŞİN", tahsilat: fis.tahsilat > 0 ? String(fis.tahsilat) : "", bos_kova: "", teslim_alan: tAlan });
    
    const ilgiliUrunler = periodSatisList.filter(s => s.fis_no === fis.fis_no);
    const dolanDetay: any = {};
    urunler.forEach(u => {
      const buUrun = ilgiliUrunler.find(
        (s) =>
          satisSatiriUrunAnahtariGetir(s) === `id:${u.id}` ||
          masterKayitIsminiNormalizeEt(satisSatiriUrunAdiGetir(s)) === masterKayitIsminiNormalizeEt(u.isim),
      );
      let calculatedKg = "";
      if (buUrun) {
          const adetNum = Number(buUrun.adet), tutarNum = Number(buUrun.tutar), fiyatNum = Number(buUrun.fiyat);
          const isKova = u.isim.match(/([345])\s*kg/i);
          if (fiyatNum !== 0 && !isKova && Math.abs(tutarNum - (adetNum * fiyatNum)) > 0.01) calculatedKg = String(tutarNum / fiyatNum);
      }
      dolanDetay[u.id] = { adet: buUrun ? String(buUrun.adet) : "", kg: calculatedKg, fiyat: buUrun ? String(buUrun.fiyat) : String(u.fiyat || "") };
    });
    
    dolanDetay["v_iade"] = { adet: iadeAdetStr, kg: iadeKgStr, fiyat: iadeFiyatStr };
    dolanDetay["v_bos_kova"] = { adet: kovaAdetStr, kg: kovaKgStr, fiyat: kovaFiyatStr };
    setFisDetay(dolanDetay); setIsFisModalOpen(true);
  };

  const handleFisDetayGoster = (fis: SatisFis) => {
    const ilgiliUrunler = periodSatisList.filter((s) => {
      const urunAdi = satisSatiriUrunAdiGetir(s);
      return s.fis_no === fis.fis_no && urunAdi !== "İade Kova" && urunAdi !== "Boş Kova" && urunAdi !== "İade";
    });
    const iadeUrun = periodSatisList.find((s) => s.fis_no === fis.fis_no && satisSatiriUrunAdiGetir(s) === "İade");
    const kovaUrun = periodSatisList.find(
      (s) =>
        s.fis_no === fis.fis_no &&
        (satisSatiriUrunAdiGetir(s) === "İade Kova" || satisSatiriUrunAdiGetir(s) === "Boş Kova"),
    );
    
    const fisBayiAnahtari = satisFisBayiAnahtariGetir(fis);
    const bayiFisleri = periodSatisFis.filter(
      (f) =>
        satisFisBayiAnahtariGetir(f) === fisBayiAnahtari &&
        !sistemIslemiMi(satisFisBayiAdiGetir(f)) &&
        (f.tarih < fis.tarih || (f.tarih === fis.tarih && Number(f.id) < Number(fis.id))),
    );
    const oGunkuEskiBorc = bayiFisleri.reduce((toplam, f) => toplam + Number(f.kalan_bakiye || 0), 0);
    
    const ekstraIndirimler = [];
    if (iadeUrun) ekstraIndirimler.push({ isim: "İade", adet: iadeUrun.adet, kg: iadeUrun.toplam_kg, fiyat: Math.abs(Number(iadeUrun.fiyat)), tutar: -Math.abs(Number(iadeUrun.tutar)) });
    if (kovaUrun) ekstraIndirimler.push({ isim: kovaUrun.urun === "İade Kova" ? "İade Kova" : "Boş Kova", adet: kovaUrun.adet, kg: kovaUrun.toplam_kg, fiyat: Math.abs(Number(kovaUrun.fiyat)), tutar: -Math.abs(Number(kovaUrun.tutar)) });

    let safAciklama = fis.aciklama || "";
    let tAlan = "";
    const tMatch = safAciklama.match(/\[Teslim Alan: (.*?)\]/);
    if (tMatch) { tAlan = tMatch[1]; safAciklama = safAciklama.replace(/\[Teslim Alan: .*?\]\s*-\s*/, "").replace(/\[Teslim Alan: .*?\]/, ""); }
    if (safAciklama.includes("[Ödeme: ")) safAciklama = safAciklama.replace(/\[Ödeme: .*?\]\s*-\s*/, "").replace(/\[Ödeme: .*?\]/, "");
    if (safAciklama.includes("[Sadece Tahsilat]")) safAciklama = safAciklama.replace(/\[Sadece Tahsilat\]\s*-\s*/, "").replace(/\[Sadece Tahsilat\]/, "");

    setSonFisData({ 
      id: fis.id, fis_no: fis.fis_no, tarih: fis.tarih, bayi: satisFisBayiAdiGetir(fis), aciklama: safAciklama, teslim_alan: tAlan, fis_gorseli: fis.fis_gorseli, ekleyen: fis.ekleyen,
      urunler: ilgiliUrunler.map(u => {
          let calculatedKg = 0;
          const a = Number(u.adet), t = Number(u.tutar), f = Number(u.fiyat);
          const isKova = String(u.urun).match(/([345])\s*kg/i);
          if (f !== 0 && !isKova && Math.abs(t - (a * f)) > 0.01) calculatedKg = t / f;
          return { isim: u.urun, adet: a, kg: calculatedKg, fiyat: f, tutar: t };
      }), 
      ekstraIndirimler,
      genelToplam: fis.toplam_tutar, tahsilat: fis.tahsilat, kalanBakiye: fis.kalan_bakiye, odeme: fis.odeme_turu || "Bilinmiyor",
      eskiBorc: oGunkuEskiBorc, genelBorc: oGunkuEskiBorc + fis.kalan_bakiye,
      gosterBakiye: false 
    });
  };

  async function handleFisSil(fis: any) {
    if (!fisSilinebilirMi(fis)) {
      alert("Bu fişi sadece ekleyen kullanıcı veya admin silebilir.");
      return;
    }
    if (!confirm(`Bu işlemi (${fis.fis_no || fis.id}) silmek istediğinize emin misiniz?`)) return;

    const { data: rpcSilData, error: rpcSilError } = await supabase.rpc("app_delete_satis_fisi", {
      p_fis_id: fis.id,
    });
    if (!rpcSilError) {
      const sonuc = Array.isArray(rpcSilData) ? rpcSilData[0] : rpcSilData;
      if (sonuc?.fis_gorseli) {
        const key = fisGorselStorageYolu(sonuc.fis_gorseli);
        if (key) {
          const { error: removeError } = await supabase
            .storage
            .from("fis_gorselleri")
            .remove([key]);
          if (removeError) {
            console.warn("Fiş görseli silinemedi:", removeError.message);
          }
        }
      }
      verileriGetir("satis"); verileriGetir("cop");
      return;
    }
    if (!rpcBulunamadiMi(rpcSilError, "app_delete_satis_fisi")) {
      alert("Silme Hatası: " + (rpcSilError.message || "Bilinmeyen RPC hatası"));
      return;
    }

    const ilgiliDetaylar = satisList.filter((detay) => detay.fis_no === fis.fis_no);
    const copBasarili = await coptKutusunaAt('satis_fisleri', { ...fis, satis_detaylari: ilgiliDetaylar });
    if (!copBasarili) {
      alert("Fiş çöp kutusuna alınamadığı için silme iptal edildi.");
      return;
    }

    const { error: detaySilError } = await supabase.from("satis_giris").delete().eq("fis_no", fis.fis_no);
    if (detaySilError) {
      alert("Silme Hatası: " + veritabaniHatasiMesaji("satis_giris", detaySilError));
      return;
    }

    const { error: fisSilError } = await supabase.from("satis_fisleri").delete().eq("id", fis.id);
    if (fisSilError) {
      const kurtarilacakDetaylar = ilgiliDetaylar.map((detay) =>
        Object.fromEntries(Object.entries(detay).filter(([anahtar]) => anahtar !== "id")),
      );
      const geriYuklemeSonucu = kurtarilacakDetaylar.length === 0
        ? { error: null }
        : await supabase.from("satis_giris").insert(kurtarilacakDetaylar);
      if (geriYuklemeSonucu.error) {
        alert("Kritik Hata: Fiş silinemedi ve detaylar geri yüklenemedi. Lütfen yedekten kontrol edin. Hata: " + veritabaniHatasiMesaji("satis_fisleri", fisSilError));
        return;
      }
      alert("Silme Hatası: " + veritabaniHatasiMesaji("satis_fisleri", fisSilError));
      return;
    }

    if (fis.fis_gorseli) {
      const key = fisGorselStorageYolu(fis.fis_gorseli);
      if (key) {
        const { error: removeError } = await supabase
          .storage
          .from("fis_gorselleri")
          .remove([key]);
        if (removeError) {
          console.warn("Fiş görseli silinemedi:", removeError.message);
        }
      }
    }

    verileriGetir("satis"); verileriGetir("cop");
  }

  const goruntuyuJpegOlarakPaylas = async (elementId: string, dosyaAdi: string, baslik: string) => {
    const hedefElement = document.getElementById(elementId);
    if (!hedefElement) return;
    if (typeof (window as any).html2canvas === "undefined") {
      alert("Yukleniyor, tekrar deneyin.");
      return;
    }

    const canvas = await (window as any).html2canvas(hedefElement, { scale: 3, backgroundColor: "#ffffff" });
    canvas.toBlob((blob: Blob | null) => {
      if (!blob) return;
      const file = new File([blob], dosyaAdi, { type: "image/jpeg" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: baslik, files: [file] }).catch(() => {});
        return;
      }
      const link = document.createElement("a");
      link.download = file.name;
      link.href = canvas.toDataURL("image/jpeg", 0.9);
      link.click();
    }, "image/jpeg", 0.9);
  };

  const handleWhatsappResimGonder = () =>
    goruntuyuJpegOlarakPaylas(
      "print-receipt",
      `Fis_${sonFisData?.fis_no || Date.now()}.jpg`,
      "Fis Ozeti",
    );

  const handleMusteriEkstrePaylas = () =>
    goruntuyuJpegOlarakPaylas(
      "print-customer-statement",
      `Ekstre_${dosyaAdiIcinTemizle(musteriEkstreData?.musteri || "musteri")}_${musteriEkstreData?.donem || aktifDonem}.jpg`,
      "Musteri Ekstresi",
    );

  const filteredForTotals = useMemo(() => periodSatisFis.filter((f: any) => {
    const isBayiMatch = fisFiltre.bayiler.length === 0 || fisFiltre.bayiler.includes(satisFisBayiAdiGetir(f));
    const isTarihMatch = (!fisFiltre.baslangic || f.tarih >= fisFiltre.baslangic) && (!fisFiltre.bitis || f.tarih <= fisFiltre.bitis);
    const isKisiMatch = satisFiltreKisi === 'herkes' || normalizeUsername(f.ekleyen) === aktifKullaniciKisa;
    return isBayiMatch && isTarihMatch && isKisiMatch && !fisDevirMi(f);
  }), [aktifKullaniciKisa, periodSatisFis, fisFiltre, satisFiltreKisi, satisFisBayiAdiGetir]);

  const tFisToplam = useMemo(() => filteredForTotals.filter(f => !fisKasayaDevirMi(f)).reduce((a: number, b: any) => a + Number(b.toplam_tutar), 0), [filteredForTotals]);
  const tFisTahsilatRaw = useMemo(() => filteredForTotals.filter(f => !fisKasayaDevirMi(f)).reduce((a: number, b: any) => a + Number(b.tahsilat), 0), [filteredForTotals]);
  const tFisKalan = useMemo(() => filteredForTotals.filter(f => !fisKasayaDevirMi(f)).reduce((a: number, b: any) => a + Number(b.kalan_bakiye), 0), [filteredForTotals]);

  // GİDERLER TAHSİLATTAN DÜŞÜYOR (Kullanıcının giderleri net tahsilatı belirler)
  const tKullaniciGider = useMemo(() => periodGider.filter(g => normalizeUsername(g.ekleyen) === aktifKullaniciKisa).reduce((a: number, b: any) => a + Number(b.tutar), 0), [aktifKullaniciKisa, periodGider]);
  const tKasayaDevir = useMemo(() => filteredForTotals.filter(f => fisKasayaDevirMi(f)).reduce((a: number, b: any) => a + Number(b.tahsilat), 0), [filteredForTotals]);
  const tNetTahsilat = tFisTahsilatRaw - tKullaniciGider - tKasayaDevir;

  const fFisList = useMemo(() => sortData(filteredForTotals.filter((f: any) => {
    if (satisFiltreTip === 'tumu') return !fisKasayaDevirMi(f); 
    if (satisFiltreTip === 'kasa_devir') return fisKasayaDevirMi(f);
    if (satisFiltreTip === 'tahsilat') return f.toplam_tutar === 0 && !fisKasayaDevirMi(f);
    if (satisFiltreTip === 'satis') return f.toplam_tutar > 0 && !fisKasayaDevirMi(f);
    return true;
  }), fisSort), [filteredForTotals, satisFiltreTip, fisSort]);

  const fSutList = useMemo(() => sortData(periodSut.filter((s: any) => 
    (sutFiltre.ciftlikler.length === 0 || sutFiltre.ciftlikler.includes(sutCiftlikAdiGetir(s))) && 
    (!sutFiltre.baslangic || s.tarih >= sutFiltre.baslangic) && (!sutFiltre.bitis || s.tarih <= sutFiltre.bitis)
  ), sutSort), [periodSut, sutFiltre, sutSort, sutCiftlikAdiGetir]);
  const tSutKg = useMemo(() => fSutList.reduce((a: number, b: any) => a + Number(b.kg), 0), [fSutList]);
  const tSutTl = useMemo(() => fSutList.reduce((a: number, b: any) => a + Number(b.toplam_tl), 0), [fSutList]);

  const fAnalizList = useMemo(() => sortData(periodSatisList.filter((s: any) => 
    (analizFiltre.bayiler.length === 0 || analizFiltre.bayiler.includes(satisSatiriBayiAdiGetir(s))) && 
    (analizFiltre.urunler.length === 0 || analizFiltre.urunler.includes(satisSatiriUrunAdiGetir(s))) && 
    (!analizFiltre.baslangic || s.tarih >= analizFiltre.baslangic) && (!analizFiltre.bitis || s.tarih <= analizFiltre.bitis)
  ), analizSort), [periodSatisList, analizFiltre, analizSort, satisSatiriBayiAdiGetir, satisSatiriUrunAdiGetir]);
  const tAnalizAdet = useMemo(() => fAnalizList.reduce((a: number, b: any) => a + Number(b.adet), 0), [fAnalizList]);
  const tAnalizKg = useMemo(() => fAnalizList.reduce((a: number, b: any) => a + Number(b.toplam_kg), 0), [fAnalizList]);
  const tAnalizTutar = useMemo(() => fAnalizList.reduce((a: number, b: any) => a + Number(b.tutar), 0), [fAnalizList]);

  const fGiderList = useMemo(() => sortData(periodGider.filter((g: any) => 
    giderFiltreKisi === 'tumu' || normalizeUsername(g.ekleyen) === aktifKullaniciKisa
  ), giderSort), [aktifKullaniciKisa, periodGider, giderSort, giderFiltreKisi]);
  const fGTutarNormal = useMemo(() => fGiderList.reduce((a: number, b: any) => a + Number(b.tutar), 0), [fGiderList]);

  const tGiderNormal = useMemo(() => periodGider.reduce((a: number, b: any) => a + Number(b.tutar), 0), [periodGider]);
  const sutcuyeBorcumuz = useMemo(() => sutcuBorcunuHesapla(sutList, giderList, aktifDonem), [aktifDonem, giderList, sutList]);
  const sutBorcDetaySatirlari = useMemo(() => {
    const kayitMap = new Map<string, { isim: string; alim: number; odeme: number }>();
    const isimdenAnahtarMap = new Map<string, { key: string; isim: string }>();
    const ciftlikKayitlari = [
      ...tedarikciler
        .filter((item) => item?.isim)
        .map((item) => ({
          isim: item.isim,
          key: item.id ? `id:${item.id}` : `isim:${masterKayitIsminiNormalizeEt(item.isim)}`,
        })),
      ...sutList
        .map((item) => ({
          isim: sutCiftlikAdiGetir(item),
          key: sutCiftlikAnahtariGetir(item),
        }))
        .filter((item) => item.isim),
    ];
    const ciftlikAdlari = Array.from(new Set(ciftlikKayitlari.map((item) => item.isim).filter(Boolean)));

    const ensure = (key: string, isim: string) => {
      if (!kayitMap.has(key)) kayitMap.set(key, { isim, alim: 0, odeme: 0 });
      return kayitMap.get(key)!;
    };

    ciftlikKayitlari.forEach((item) => {
      const normalized = masterKayitIsminiNormalizeEt(item.isim);
      if (!normalized || isimdenAnahtarMap.has(normalized)) return;
      isimdenAnahtarMap.set(normalized, { key: item.key, isim: item.isim });
    });

    sutList.forEach((item) => {
      const donem = String(item.tarih || "").substring(0, 7);
      if (aktifDonem && donem > aktifDonem) return;
      const isim = sutCiftlikAdiGetir(item) || "Bilinmeyen Çiftlik";
      const key = sutCiftlikAnahtariGetir(item);
      ensure(key, isim).alim += Number(item.toplam_tl || 0);
    });

    giderList.forEach((item) => {
      const donem = String(item.tarih || "").substring(0, 7);
      if (aktifDonem && donem > aktifDonem) return;
      if (!sutOdemesiMi(item.tur)) return;
      const ciftlikIsmi = sutOdemesiCiftlikIsminiBul(item.tur, ciftlikAdlari) || "Eşleşmeyen Ödeme";
      const normalized = masterKayitIsminiNormalizeEt(ciftlikIsmi);
      const eslesenKayit = isimdenAnahtarMap.get(normalized);
      ensure(eslesenKayit?.key || `isim:${normalized}`, eslesenKayit?.isim || ciftlikIsmi).odeme += Number(item.tutar || 0);
    });

    const detaylar = Array.from(kayitMap.entries())
      .map(([, degerler]) => ({
        isim: degerler.isim,
        alim: degerler.alim,
        odeme: degerler.odeme,
        borc: degerler.alim - degerler.odeme,
      }))
      .filter((item) => Math.abs(item.alim) > 0.01 || Math.abs(item.odeme) > 0.01 || Math.abs(item.borc) > 0.01)
      .sort((a, b) => a.isim.localeCompare(b.isim, "tr"));

    if (detaylar.length === 0) {
      return [{ etiket: "Kayıt", deger: "Detay bulunamadı" }];
    }

    return detaylar.map((item) => ({
      etiket: item.isim,
      deger: `${fSayi(item.borc)} TL`,
      vurgu: true,
    }));
  }, [aktifDonem, giderList, masterKayitIsminiNormalizeEt, sutCiftlikAdiGetir, sutCiftlikAnahtariGetir, sutList, tedarikciler]);
  const aktifUretimTipi = uretimForm.uretim_tipi || "yogurt";
  const siraliUretimList = useMemo(() => sortData(periodUretim, uretimSort), [periodUretim, uretimSort]);
  const yogurtUretimListesi = useMemo(
    () => siraliUretimList.filter((kayit) => (kayit.uretim_tipi || "yogurt") !== "sut_kaymagi"),
    [siraliUretimList],
  );
  const sutKaymagiUretimListesi = useMemo(
    () => siraliUretimList.filter((kayit) => (kayit.uretim_tipi || "yogurt") === "sut_kaymagi"),
    [siraliUretimList],
  );
  const aktifUretimMaliyet = useMemo(() => uretimMaliyetToplami(uretimForm), [uretimForm]);
  const aktifUretimSatisToplami = useMemo(() => uretimSatisToplami(uretimForm), [uretimForm]);
  const aktifUretimKar = aktifUretimSatisToplami - aktifUretimMaliyet;
  const aktifUretimGirenKg = useMemo(() => uretimGirenToplamKg(uretimForm), [uretimForm]);
  const aktifUretimCikanKg = useMemo(() => uretimCikanToplamKg(uretimForm), [uretimForm]);
  const bayiNetDurum = bayiBorclari.reduce((a, b) => a + b.borc, 0);
  
  const personelOzetleri = useMemo(() => {
    const map: Record<string, PersonelOzeti> = {};
    const getKey = (val?: string | null) => (val ? normalizeUsername(val) || "Bilinmiyor" : "Bilinmiyor");
    const getPersonelDevirKey = (aciklama?: string | null) => {
      const eslesme = aciklama?.match(/\((.*?)\)/);
      return eslesme?.[1] ? normalizeUsername(eslesme[1]) || eslesme[1] : "Bilinmiyor";
    };

    periodSatisFis.forEach((f: any) => {
      const personelDevir = fisPersonelDevirMi(f) && f.bayi === "SİSTEM İŞLEMİ";
      const donemDevir = fisDonemDevirMi(f);
      const key = personelDevir ? getPersonelDevirKey(f.aciklama) : getKey(f.ekleyen);
      if (!map[key]) {
        map[key] = { isim: key, satis: 0, tahsilat: 0, gider: 0, kasayaDevir: 0, net: 0, acikBakiye: 0, devirNet: 0, devirAcik: 0 };
      }

      if (fisKasayaDevirMi(f)) {
        map[key].kasayaDevir += Number(f.tahsilat) || 0;
      } else if (personelDevir) {
        map[key].devirNet += Number(f.toplam_tutar) || 0;
        map[key].devirAcik += Number(f.kalan_bakiye) || 0;
      } else if (donemDevir) {
        return;
      } else {
        if (f.bayi !== "SİSTEM İŞLEMİ" && Number(f.toplam_tutar) > 0) {
          map[key].satis += Number(f.toplam_tutar) || 0;
        }
        map[key].tahsilat += Number(f.tahsilat) || 0;
        map[key].acikBakiye += Number(f.kalan_bakiye) || 0;
      }
    });

    periodGider.forEach((g: any) => {
      const key = getKey(g.ekleyen);
      if (!map[key]) {
        map[key] = { isim: key, satis: 0, tahsilat: 0, gider: 0, kasayaDevir: 0, net: 0, acikBakiye: 0, devirNet: 0, devirAcik: 0 };
      }
      map[key].gider += Number(g.tutar) || 0;
    });

    return Object.values(map)
      .map(p => {
        const net = p.devirNet + (p.tahsilat - p.gider - p.kasayaDevir);
        const acikBakiye = p.devirAcik + p.acikBakiye;
        return { ...p, net, acikBakiye };
      })
      .filter(p =>
        Math.abs(p.satis) > 0.01 ||
        Math.abs(p.tahsilat) > 0.01 ||
        Math.abs(p.gider) > 0.01 ||
        Math.abs(p.kasayaDevir) > 0.01 ||
        Math.abs(p.net) > 0.01 ||
        Math.abs(p.acikBakiye) > 0.01
      )
      .sort((a, b) => a.isim.localeCompare(b.isim));
  }, [periodSatisFis, periodGider]);

  const sekmeSecenekleri = useMemo(
    () => TAB_TANIMLARI.map((tab) => ({ id: tab.id, etiket: tab.etiket })),
    [],
  );

  const kullaniciListesi = useMemo(() => {
    const set = new Set<string>();
    const ekle = (deger?: string | null) => {
      const normalized = normalizeUsername(deger);
      if (normalized) set.add(normalized);
    };

    ekle(session?.user?.email || username);
    satisFisList.forEach((item) => ekle(item.ekleyen));
    satisList.forEach((item) => ekle(item.ekleyen));
    giderList.forEach((item) => ekle(item.ekleyen));
    sutList.forEach((item) => ekle(item.ekleyen));
    uretimList.forEach((item) => ekle(item.ekleyen));
    profilKullaniciListesi.forEach((item) => ekle(item));
    tabYetkileri.forEach((item) => ekle(item.username));

    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [
    giderList,
    profilKullaniciListesi,
    satisFisList,
    satisList,
    session?.user?.email,
    sutList,
    tabYetkileri,
    uretimList,
    username,
  ]);

  const ozetKartlari = useMemo<OzetKart[]>(
    () => [
      { baslik: "Satış", deger: tFisToplam },
      { baslik: "Gider", deger: tGiderNormal },
      { baslik: "Tahsilat", deger: tFisTahsilatRaw },
      { baslik: "Açık Hesap", deger: bayiNetDurum },
      { baslik: "Süt Borcu", deger: sutcuyeBorcumuz },
    ],
    [bayiNetDurum, sutcuyeBorcumuz, tFisTahsilatRaw, tFisToplam, tGiderNormal],
  );

  const yedekVerisi = useMemo<YedekVerisi>(
    () => ({
      alindiTarih: new Date().toISOString(),
      aktifDonem,
      kaynak: yetkiKaynak,
      ozetKartlari,
      bayiBorclari: bayiBorclari.map((item) => ({ isim: item.isim, deger: item.borc })),
      personelOzetleri,
      sutList,
      satisFisList,
      satisList,
      giderList,
      uretimList,
      bayiler,
      urunler,
      ciftlikler: tedarikciler,
      copKutusuList,
      tabYetkileri,
    }),
    [
      aktifDonem,
      bayiBorclari,
      bayiler,
      copKutusuList,
      giderList,
      ozetKartlari,
      personelOzetleri,
      satisFisList,
      satisList,
      sutList,
      tabYetkileri,
      tedarikciler,
      uretimList,
      urunler,
      yetkiKaynak,
    ],
  );

  const handleExcelBackup = async () => {
    setIsBackupLoading(true);
    try {
      yedegiExcelIndir(yedekVerisi);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleJsonBackup = async () => {
    setIsBackupLoading(true);
    try {
      yedegiJsonIndir(yedekVerisi);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleHtmlBackup = async () => {
    setIsBackupLoading(true);
    try {
      yedegiHtmlIndir(yedekVerisi);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handlePermissionSave = async (next: KullaniciSekmeYetkisi[]) => {
    const { kayitlar, kaynak, uyari } = await kullaniciYetkileriniKaydet(next);
    setTabYetkileri(kayitlar);
    setYetkiKaynak(kaynak);
    setYetkiUyari(uyari || "");
  };

  const handleEmptyTrash = async () => {
    if (!isAdmin) return;
    if (copKutusuList.length === 0) return;
    if (!confirm(`Çöp kutusundaki ${copKutusuList.length} kayıt kalıcı olarak silinecek. Devam edilsin mi?`)) return;

    const { error } = await supabase.from("cop_kutusu").delete().not("id", "is", null);
    if (error) {
      alert(`Çöp kutusu boşaltılamadı: ${error.message}`);
      return;
    }

    setCopKutusuList([]);
    alert("Çöp kutusu boşaltıldı.");
  };

  const cikisYap = async (mesaj?: string) => {
    await yerelOturumuTemizle();
    setUsername(normalizeUsername(username || session?.user?.email || ""));
    if (mesaj) {
      setAuthHata(mesaj);
    }
  };

  useEffect(() => {
    if (!session) return;

    const IDLE_LIMIT_MS = 10 * 60 * 1000;
    let timeoutId: number | null = null;

    const resetIdleTimer = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        handleIdleLogout();
      }, IDLE_LIMIT_MS);
    };

    const olaylar: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    olaylar.forEach((olay) => window.addEventListener(olay, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      olaylar.forEach((olay) => window.removeEventListener(olay, resetIdleTimer));
    };
  }, [session]);

  const renderOzet = () => (
    <div className="tab-fade-in main-content-area" style={{ display: "flex", flexDirection: "column" }}>
      {renderKompaktToplamlar([
        { etiket: "SATIŞ", deger: `${fSayiNoDec(tFisToplam)} ₺`, renk: "#059669" },
        { etiket: "TAHSİLAT", deger: `${fSayiNoDec(tFisTahsilatRaw)} ₺`, renk: "#2563eb" },
        { etiket: "AÇIK HESAP", deger: `${fSayiNoDec(bayiNetDurum)} ₺`, renk: "#f59e0b" },
      ], { marginBottom: "6px" }, "three", "summary-c")}
      {renderKompaktToplamlar([
        { etiket: "GİDER", deger: `${fSayiNoDec(tGiderNormal)} ₺`, renk: "#dc2626" },
        {
          etiket: "SÜT BORCU",
          deger: `${fSayiNoDec(sutcuyeBorcumuz)} ₺`,
          renk: "#0f766e",
          onClick: () => setOzetMiniDetay({
            baslik: "Süt Borcu Detayı",
            renk: "#0f766e",
            satirlar: sutBorcDetaySatirlari,
          }),
        },
      ], { marginBottom: "4px" }, "two", "summary-c")}
      <div className="card" style={{marginTop: "5px", order: 2}}>
        <h4 style={{ margin: "0 0 10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "5px" }}>Müşteri Borç Durumları</h4>
        <div style={{maxHeight: '300px', overflowY: 'auto', paddingRight: '5px'}}>
          <table className="tbl" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <Th
                  label="Bayi"
                  sortKey="isim"
                  currentSort={ozetBorcSort}
                  setSort={setOzetBorcSort}
                  filterType="ozet_bayi"
                  compact
                />
                <Th
                  label="Tutar"
                  sortKey="borc"
                  currentSort={ozetBorcSort}
                  setSort={setOzetBorcSort}
                  align="right"
                  compact
                />
                <th style={{ width: "34px" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtrelenmisBayiBorclari.map((b) => (
                <tr key={b.anahtar}>
                  <td>
                    <b className="truncate-text" style={{ fontSize: "12px" }}>{b.isim}</b>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <b style={{ fontSize: "12px", color: b.borc > 0 ? "#dc2626" : (b.borc < 0 ? "#059669" : "#64748b") }}>
                      {fSayi(b.borc)} ₺
                    </b>
                  </td>
                  <td className="actions-cell" style={{ position: "relative" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdown({ type: "ozet_borc", id: b.anahtar });
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "0 6px", color: "#64748b" }}
                    >
                      ⋮
                    </button>
                    {openDropdown?.type === "ozet_borc" && openDropdown.id === b.anahtar && (
                      <div className="dropdown-menu">
                        <button
                          title="Ekstre"
                          className="dropdown-item-icon"
                          onClick={() => {
                            setOpenDropdown(null);
                            handleMusteriEkstreAc(b.anahtar, b.isim);
                          }}
                        >
                          🧾
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtrelenmisBayiBorclari.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: "#94a3b8", fontSize: "12px", textAlign: "center" }}>
                    Açık hesap bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card" style={{marginTop: "5px", order: 1}}>
        <h4 style={{ margin: "0 0 10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "5px" }}>Personel Özetleri</h4>
        <div style={{maxHeight: '300px', overflowY: 'auto', paddingRight: '0'}}>
          <table className="tbl tbl-personel" style={{ fontSize: "11px", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th>Personel</th>
                <th style={{ textAlign: "right" }}>Satış</th>
                <th style={{ textAlign: "right" }}>Tahs.</th>
                <th style={{ textAlign: "right" }}>Gider</th>
                <th style={{ textAlign: "right" }}>K. Devir</th>
                <th style={{ textAlign: "right" }}>Net</th>
                <th style={{ textAlign: "right" }}>Açık</th>
              </tr>
            </thead>
            <tbody>
              {personelOzetleri.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: "bold" }}>{p.isim}</td>
                  <td style={{ textAlign: "right", color: "#059669", fontWeight: "bold", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{fSayi(p.satis)}</td>
                  <td style={{ textAlign: "right", color: "#2563eb", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{fSayi(p.tahsilat)}</td>
                  <td style={{ textAlign: "right", color: "#dc2626", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{fSayi(p.gider)}</td>
                  <td style={{ textAlign: "right", color: "#0f766e", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{fSayi(p.kasayaDevir)}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold", color: p.net >= 0 ? "#16a34a" : "#dc2626", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{fSayi(p.net)}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold", color: p.acikBakiye >= 0 ? "#f59e0b" : "#059669", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{fSayi(p.acikBakiye)}</td>
                </tr>
              ))}
              {personelOzetleri.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8" }}>
                    Bu döneme ait personel hareketi bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderSut = () => (
    <div className="tab-fade-in main-content-area">
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", flex: 1 }}>
          <div style={{ border: `1px solid ${temaRengi}33`, background: `${temaRengi}10`, color: temaRengi, borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold" }}>
            SÜT: {fSayi(tSutKg)} KG
          </div>
          <div style={{ border: `1px solid ${temaRengi}33`, background: `${temaRengi}10`, color: temaRengi, borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold" }}>
            TUTAR: {fSayiNoDec(tSutTl)} ₺
          </div>
        </div>
        <button onClick={handleYeniSutModalAc} className="btn-anim m-btn blue-btn inline-mobile-btn" style={{ margin: 0, minWidth: "150px", width: "auto", fontSize: "13px", flex: "0 0 auto" }}>➕ YENİ SÜT GİRİŞİ</button>
      </div>
      <div className="table-wrapper"><table className="tbl">
        <thead><tr>
          <Th label="TARİH" sortKey="tarih" currentSort={sutSort} setSort={setSutSort} filterType="sut_tarih" />
          <Th label="ÇİFTLİK" sortKey="ciftlik" currentSort={sutSort} setSort={setSutSort} filterType="sut_ciftlik" />
          <Th label="KG" sortKey="kg" currentSort={sutSort} setSort={setSutSort} align="right" />
          <Th label="FİYAT" sortKey="fiyat" currentSort={sutSort} setSort={setSutSort} align="right" />
          <Th label="TUTAR" sortKey="toplam_tl" currentSort={sutSort} setSort={setSutSort} align="right" />
          <th></th>
        </tr></thead>
        <tbody>{fSutList.map(s => {
          const silinebilir = kaydiSilebilirMi(s.ekleyen);
          const duzenlenebilir = kaydiDuzenleyebilirMi(s.ekleyen);
          return (
          <tr key={s.id}>
            <td>{s.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold" }} className="truncate-text-td">{sutCiftlikAdiGetir(s)}</td>
            <td style={{ textAlign: "right" }}>{fSayi(s.kg)}</td>
            <td style={{ textAlign: "right" }}>{fSayi(s.fiyat)}</td>
            <td style={{ textAlign: "right", color: temaRengi, fontWeight: "bold" }}>{fSayiNoDec(s.toplam_tl)}</td>
            <td className="actions-cell" style={{position: 'relative'}}>
               {renderNot(s.aciklama)}
               <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: 'sut', id: s.id as string }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 8px', color: '#64748b' }}>⋮</button>
               {openDropdown?.type === 'sut' && openDropdown.id === s.id && (
                  <div className="dropdown-menu">
                     {duzenlenebilir && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setEditingSutId(s.id); setSutForm({ ...(s as any), ciftlik: sutCiftlikAdiGetir(s) }); setIsSutModalOpen(true); }}>✏️</button>}
                     {silinebilir && <button title="Sil" className="dropdown-item-icon" style={{ color: '#dc2626' }} onClick={async () => { setOpenDropdown(null); await handleKayitSil("sut_giris", s, "sut"); }}>🗑️</button>}
                  </div>
               )}
            </td>
          </tr>);
        })}
        </tbody>
      </table></div>
    </div>
  );

  const renderSatis = () => (
    <div className="tab-fade-in main-content-area">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
         <button onClick={handleYeniFisAc} className="btn-anim m-btn green-btn" style={{ margin: 0, flex: 2, fontSize: '13px' }}>➕ YENİ SATIŞ FİŞİ</button>
         <button onClick={() => { setTahsilatForm({ tarih: aktifDonemTarihi(), bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" }); setIsTahsilatModalOpen(true); }} className="btn-anim m-btn blue-btn" style={{ margin: 0, flex: 1.2, fontSize: '13px', background: '#3b82f6' }}>💸 TAHSİLAT</button>
         <button onClick={() => setDigerModalConfig({ isOpen: true, type: 'kasa_devir', mode: 'create', fisId: null })} className="btn-anim m-btn" style={{ margin: 0, flex: 1, fontSize: '13px', background: '#64748b', padding: '12px 0' }}>🏦 KASA DEVİR</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
         <div style={{ display: 'flex', background: '#cbd5e1', borderRadius: '6px', overflow: 'hidden', flex: 2 }}>
            <button onClick={() => setSatisFiltreTip('tumu')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: satisFiltreTip==='tumu'?'#059669':'transparent', color: satisFiltreTip==='tumu'?'#fff':'#475569' }}>Tümü</button>
            <button onClick={() => setSatisFiltreTip('satis')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: satisFiltreTip==='satis'?'#059669':'transparent', color: satisFiltreTip==='satis'?'#fff':'#475569' }}>Satış</button>
            <button onClick={() => setSatisFiltreTip('tahsilat')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: satisFiltreTip==='tahsilat'?'#059669':'transparent', color: satisFiltreTip==='tahsilat'?'#fff':'#475569' }}>Tahsilat</button>
            <button onClick={() => setSatisFiltreTip('kasa_devir')} style={{ flex: 1.2, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', background: satisFiltreTip === 'kasa_devir' ? '#059669' : 'transparent', color: satisFiltreTip === 'kasa_devir' ? '#fff' : '#475569' }}>Kasa Devir</button>
         </div>
         <div style={{ display: 'flex', background: '#cbd5e1', borderRadius: '6px', overflow: 'hidden', flex: 1 }}>
            <button onClick={() => setSatisFiltreKisi('benim')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: satisFiltreKisi==='benim'?'#2563eb':'transparent', color: satisFiltreKisi==='benim'?'#fff':'#475569' }}>Benim</button>
            <button onClick={() => setSatisFiltreKisi('herkes')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: satisFiltreKisi==='herkes'?'#2563eb':'transparent', color: satisFiltreKisi==='herkes'?'#fff':'#475569' }}>Herkes</button>
         </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.45fr 1fr", gap: "6px", marginBottom: "10px", alignItems: "stretch" }}>
        <div style={{ minWidth: 0, border: "1px solid #05966933", background: "#05966910", color: "#059669", borderRadius: "12px", padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontSize: "9px", fontWeight: "bold", opacity: 0.85, whiteSpace: "nowrap" }}>TOPLAM SATIŞ</span>
          <b style={{ fontSize: "14px", marginTop: "2px", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{fSayi(tFisToplam)} ₺</b>
        </div>
        <div style={{ minWidth: 0, border: "1px solid #2563eb33", background: "#2563eb10", color: "#2563eb", borderRadius: "12px", padding: "6px 8px", display: "flex", flexDirection: "column", gap: "4px", justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
            <span style={{ fontSize: "9px", fontWeight: "bold", opacity: 0.9, whiteSpace: "nowrap" }}>TAHSİLAT</span>
            <b style={{ fontSize: "14px", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05, textAlign: "right" }}>{fSayi(tFisTahsilatRaw)} ₺</b>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "5px" }}>
            <div style={{ borderRadius: "999px", background: "#ffffffb8", padding: "4px 6px", color: "#64748b", fontWeight: "bold", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: 1.1 }}>
              <span style={{ fontSize: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>GİDER</span>
              <span style={{ fontSize: "9px", whiteSpace: "nowrap" }}>{fSayiNoDec(tKullaniciGider)}</span>
            </div>
            <div style={{ borderRadius: "999px", background: "#ffffffb8", padding: "4px 6px", color: "#475569", fontWeight: "bold", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: 1.1 }}>
              <span style={{ fontSize: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>KASAYA</span>
              <span style={{ fontSize: "9px", whiteSpace: "nowrap" }}>{fSayiNoDec(tKasayaDevir)}</span>
            </div>
            <div style={{ borderRadius: "999px", background: "#ffffffd8", padding: "4px 6px", color: "#0f172a", fontWeight: "bold", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: 1.1 }}>
              <span style={{ fontSize: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>NET</span>
              <span style={{ fontSize: "9px", whiteSpace: "nowrap" }}>{fSayiNoDec(tNetTahsilat)}</span>
            </div>
          </div>
        </div>
        <div style={{ minWidth: 0, border: "1px solid #dc262633", background: "#dc262610", color: "#dc2626", borderRadius: "12px", padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontSize: "9px", fontWeight: "bold", opacity: 0.85, whiteSpace: "nowrap" }}>AÇIK HESAP</span>
          <b style={{ fontSize: "14px", marginTop: "2px", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{fSayi(tFisKalan)} ₺</b>
        </div>
      </div>

      <div className="table-wrapper"><table className="tbl tbl-satis" style={{ tableLayout: "fixed" }}>
        <thead><tr>
          <Th label="TAR." sortKey="tarih" currentSort={fisSort} setSort={setFisSort} filterType="fis_tarih" hideSortIndicator={true} compact={true} cellStyle={{ width: "68px" }} />
          <Th label={satisFiltreTip === 'kasa_devir' ? "AÇIKLAMA" : "BAYİ"} sortKey={satisFiltreTip === 'kasa_devir' ? "aciklama" : "bayi"} currentSort={fisSort} setSort={setFisSort} filterType="fis_bayi" hideSortIndicator={true} compact={true} cellStyle={{ width: satisFiltreTip === 'kasa_devir' ? "136px" : "112px", paddingLeft: "18px" }} />
          <Th label="TUTAR" sortKey="toplam_tutar" currentSort={fisSort} setSort={setFisSort} align="right" />
          <Th label="TAHS." sortKey="tahsilat" currentSort={fisSort} setSort={setFisSort} align="right" />
          <Th label="BORÇ" sortKey="kalan_bakiye" currentSort={fisSort} setSort={setFisSort} align="right" />
          <Th label="KİŞİ" sortKey="ekleyen" currentSort={fisSort} setSort={setFisSort} align="center" />
          <th></th>
        </tr></thead>
        <tbody>{fFisList.map(f => {
          const satirToplamBorc = f.id ? satisFisToplamBorcMap[String(f.id)] ?? 0 : 0;
          const silinebilir = fisSilinebilirMi(f);
          const duzenlenebilir = fisDuzenlenebilirMi(f);
          const kasaDevirMi = fisKasayaDevirMi(f);
          const sistemFisMi = sistemIslemiMi(satisFisBayiAdiGetir(f));
          return (
          <tr key={f.id}>
            <td style={{ textAlign: "center" }}>{f.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold", minWidth: 0, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: f.toplam_tutar === 0 && f.odeme_turu !== 'KASAYA DEVİR' ? "#8b5cf6" : (sistemIslemiMi(satisFisBayiAdiGetir(f)) ? "#475569" : "inherit") }}>
               {fisGorunenBayi(f)}
            </td>
            <td style={{ textAlign: "right", color: "#059669", fontWeight: "bold" }}>{f.toplam_tutar === 0 ? "-" : fSayi(f.toplam_tutar)}</td>
            <td style={{ textAlign: "right", color: f.odeme_turu === 'KASAYA DEVİR' ? "#dc2626" : "#2563eb", fontWeight: "bold" }}>
               {f.odeme_turu === 'KASAYA DEVİR' && f.tahsilat > 0 ? "-" : ""}{fSayi(f.tahsilat)}
            </td>
            <td style={{ textAlign: "right", color: satirToplamBorc > 0 ? "#dc2626" : (satirToplamBorc < 0 ? "#059669" : "#64748b"), fontWeight: "bold" }} title="Bu fiş sonundaki toplam borç">
                {sistemIslemiMi(satisFisBayiAdiGetir(f)) ? "-" : (satirToplamBorc === 0 ? "-" : fSayi(satirToplamBorc))}
            </td>
            <td style={{ textAlign: "center", color: "#64748b" }}>{f.ekleyen ? f.ekleyen.split('@')[0] : "-"}</td>
            <td className="actions-cell" style={{position: 'relative'}}>
               <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: 'satis', id: f.id as string }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 8px', color: '#64748b' }}>⋮</button>
               {openDropdown?.type === 'satis' && openDropdown.id === f.id && (
                     <div className="dropdown-menu">
                     {f.fis_gorseli && <button title="Fotoğrafı Gör" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); handleFisGorselGoster(f); }}>📷</button>}
                     {(!sistemFisMi || kasaDevirMi) && <button title="Görüntüle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); if (kasaDevirMi) { handleKasaDevirGoruntule(f); } else { handleFisDetayGoster(f); } }}>🔍</button>}
                     {(!sistemFisMi || kasaDevirMi) && duzenlenebilir && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); if (kasaDevirMi) { handleKasaDevirDuzenle(f); } else { handleFisDuzenle(f); } }}>✏️</button>}
                     {silinebilir && <button title="Sil" className="dropdown-item-icon" style={{ color: '#dc2626' }} onClick={() => { setOpenDropdown(null); handleFisSil(f); }}>🗑️</button>}
                  </div>
               )}
            </td>
          </tr>
        )})}
        </tbody>
      </table></div>
    </div>
  );

  const renderAnaliz = () => (
    <div className="tab-fade-in main-content-area">
      {renderKompaktToplamlar([
        { etiket: "TOP ADET", deger: fSayi(tAnalizAdet), renk: "#8b5cf6" },
        { etiket: "TOP KG", deger: fSayi(tAnalizKg), renk: "#8b5cf6" },
        { etiket: "TOP TUTAR", deger: `${fSayi(tAnalizTutar)} ₺`, renk: "#8b5cf6" },
      ], { marginTop: "5px" })}
      <div className="table-wrapper"><table className="tbl tbl-analiz">
        <thead><tr>
          <Th label="TARİH" sortKey="tarih" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} filterType="analiz_tarih" />
          <Th label="BAYİ" sortKey="bayi" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} filterType="analiz_bayi" />
          <Th label="ÜRÜN" sortKey="urun" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} filterType="analiz_urun" />
          <Th label="ADET" sortKey="adet" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} align="right" />
          <Th label="KG" sortKey="toplam_kg" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} align="right" />
          <Th label="FİYAT" sortKey="fiyat" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} align="right" />
          <Th label="TUTAR" sortKey="tutar" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} align="right" />
        </tr></thead>
        <tbody>{fAnalizList.map(s => (
          <tr key={s.id}>
            <td>{s.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold" }}>{satisSatiriBayiAdiGetir(s)}</td>
            <td>{satisSatiriUrunAdiGetir(s)}</td>
            <td style={{ textAlign: "right" }}>{fSayi(s.adet)}</td>
            <td style={{ textAlign: "right" }}>{fSayi(s.toplam_kg)}</td>
            <td style={{ textAlign: "right" }}>{fSayi(Math.abs(Number(s.fiyat)))}</td>
            <td style={{ textAlign: "right", color: Number(s.fiyat) < 0 ? "#dc2626" : "#8b5cf6", fontWeight: "bold" }}>
              {Number(s.fiyat) < 0 ? "-" : ""}{fSayi(Math.abs(Number(s.tutar)))}
            </td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );

  const renderGider = () => (
    <div className="tab-fade-in main-content-area">
      <div className="gider-ust-satir" style={{ display: "flex", gap: "8px", flexWrap: "nowrap", alignItems: "center", marginBottom: "10px" }}>
        <div className="gider-filtre-grup" style={{ display: 'flex', background: '#cbd5e1', borderRadius: '8px', overflow: 'hidden', flex: '0 0 auto', minWidth: '110px' }}>
          <button onClick={() => setGiderFiltreKisi('benim')} style={{ flex: 1, padding: '8px 10px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: giderFiltreKisi==='benim'?'#dc2626':'transparent', color: giderFiltreKisi==='benim'?'#fff':'#475569' }}>Benim</button>
          <button onClick={() => setGiderFiltreKisi('tumu')} style={{ flex: 1, padding: '8px 10px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: giderFiltreKisi==='tumu'?'#dc2626':'transparent', color: giderFiltreKisi==='tumu'?'#fff':'#475569' }}>Tümü</button>
        </div>
        <button onClick={() => { setGiderForm({ tarih: aktifDonemTarihi(), tur: "Genel Gider", aciklama: "", tutar: "" }); setGiderGorselDosya(null); setGiderGorselMevcutYol(""); setEditingGiderId(null); setIsGiderModalOpen(true); }} className="btn-anim m-btn inline-mobile-btn" style={{ background: "#dc2626", margin: 0, width: "auto", minWidth: "136px", flex: "0 0 auto", fontSize: "13px", padding: "10px 12px" }}>➕ YENİ GİDER EKLE</button>
        <div className="gider-ust-ozet" style={{ border: "1px solid #dc262633", background: "#dc262610", color: "#dc2626", borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", flex: "1 1 auto", minWidth: "110px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          GİDERLER: {fSayi(fGTutarNormal)} ₺
        </div>
      </div>
      <div className="table-wrapper"><table className="tbl" style={{borderTop: "3px solid #fca5a5"}}>
        <thead><tr>
          <Th label="TARİH" sortKey="tarih" currentSort={giderSort} setSort={setGiderSort} />
          <Th label="TÜR" sortKey="tur" currentSort={giderSort} setSort={setGiderSort} />
          <Th label="TUTAR" sortKey="tutar" currentSort={giderSort} setSort={setGiderSort} align="right" />
          <Th label="AÇIKLAMA" sortKey="aciklama" currentSort={giderSort} setSort={setGiderSort} />
          <Th label="KİŞİ" sortKey="ekleyen" currentSort={giderSort} setSort={setGiderSort} align="center" />
          <th></th>
        </tr></thead>
        <tbody>{fGiderList.map(g => {
          const silinebilir = kaydiSilebilirMi(g.ekleyen);
          const duzenlenebilir = kaydiDuzenleyebilirMi(g.ekleyen);
          return (
          <tr key={g.id}>
            <td>{g.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold" }}>{g.tur}</td>
            <td style={{ textAlign: "right", color: "#dc2626", fontWeight: "bold" }}>{fSayi(g.tutar)}</td>
            <td style={{ color: "#64748b" }} className="truncate-text-td">{g.aciklama}</td>
            <td style={{ textAlign: "center", color: "#64748b" }}>{g.ekleyen ? g.ekleyen.split('@')[0] : "-"}</td>
            <td className="actions-cell" style={{position: 'relative'}}>
               <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: 'gider', id: g.id as string }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 8px', color: '#64748b' }}>⋮</button>
               {openDropdown?.type === 'gider' && openDropdown.id === g.id && (
                  <div className="dropdown-menu">
                     {g.gorsel && <button title="Fotoğrafı Gör" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); handleGiderGorselGoster(g); }}>📷</button>}
                     {duzenlenebilir && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setEditingGiderId(g.id); setGiderForm(g as any); setGiderGorselDosya(null); setGiderGorselMevcutYol(g.gorsel || ""); setIsGiderModalOpen(true); }}>✏️</button>}
                     {silinebilir && <button title="Sil" className="dropdown-item-icon" style={{ color: '#dc2626' }} onClick={async () => { setOpenDropdown(null); await handleKayitSil("giderler", g, "gider"); }}>🗑️</button>}
                  </div>
               )}
            </td>
          </tr>);
        })}
        </tbody>
      </table></div>
    </div>
  );

  const yeniUretimFormunuAc = (tip: "yogurt" | "sut_kaymagi") => {
    setUretimForm(bosUretimFormu(aktifDonemTarihi(), tip, uretimSonFiyatlar[tip]));
    setEditingUretimId(null);
    setIsUretimModalOpen(true);
  };

  const renderKgSatiri = (
    etiket: string,
    kgField: keyof Uretim,
    fiyatField: keyof Uretim,
    renk = "#475569",
  ) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 52px 52px 58px", gap: "4px", alignItems: "center" }}>
      <span style={{ fontSize: "10px", fontWeight: "bold", color: renk, lineHeight: 1.15 }}>{etiket}</span>
      <input
        placeholder="KG"
        type="number"
        step="0.01"
        value={String(uretimForm[kgField] ?? "")}
        onChange={(e) => setUretimForm({ ...uretimForm, [kgField]: e.target.value })}
        className="m-inp small-inp"
        style={{ textAlign: "right", minWidth: 0 }}
      />
      <input
        placeholder="Fiyat"
        type="number"
        step="0.01"
        value={String(uretimForm[fiyatField] ?? "")}
        onChange={(e) => setUretimForm({ ...uretimForm, [fiyatField]: e.target.value })}
        className="m-inp small-inp"
        style={{ textAlign: "right", minWidth: 0 }}
      />
      <div style={{ textAlign: "right", fontWeight: "bold", fontSize: "10.5px", color: "#0f172a", minWidth: 0 }}>
        {fSayi(kgSatirTutari(uretimForm[kgField], uretimForm[fiyatField]))} ₺
      </div>
    </div>
  );

  const renderAdetFiyatSatiri = (
    etiket: string,
    adetField: keyof Uretim,
    fiyatField: keyof Uretim,
    renk = "#475569",
    mirrorField?: keyof Uretim,
    mirrorKgField?: keyof Uretim,
    mirrorKgMultiplier?: number,
  ) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 52px 52px 58px", gap: "4px", alignItems: "center" }}>
      <span style={{ fontSize: "10px", fontWeight: "bold", color: renk, lineHeight: 1.15 }}>{etiket}</span>
      <input
        placeholder="Adet"
        type="number"
        value={String(uretimForm[adetField] ?? "")}
        onChange={(e) => {
          const yeniDeger = e.target.value;
          const sonrakiForm = { ...uretimForm, [adetField]: yeniDeger } as Uretim;
          if (mirrorField) sonrakiForm[mirrorField] = yeniDeger as never;
          if (mirrorKgField && mirrorKgMultiplier) {
            sonrakiForm[mirrorKgField] = (yeniDeger === "" ? "" : String(sayiDegeri(yeniDeger) * mirrorKgMultiplier)) as never;
          }
          setUretimForm(sonrakiForm);
        }}
        className="m-inp small-inp"
        style={{ textAlign: "right", minWidth: 0 }}
      />
      <input
        placeholder="Fiyat"
        type="number"
        step="0.01"
        value={String(uretimForm[fiyatField] ?? "")}
        onChange={(e) => setUretimForm({ ...uretimForm, [fiyatField]: e.target.value })}
        className="m-inp small-inp"
        style={{ textAlign: "right", minWidth: 0 }}
      />
      <div style={{ textAlign: "right", fontWeight: "bold", fontSize: "10.5px", color: "#0f172a", minWidth: 0 }}>
        {fSayi(sayiDegeri(uretimForm[adetField]) * sayiDegeri(uretimForm[fiyatField]))} ₺
      </div>
    </div>
  );

  const renderPaketCiktiSatiri = (
    etiket: string,
    adetField: keyof Uretim,
    kgField: keyof Uretim,
    fiyatField: keyof Uretim,
    birimKg: number,
  ) => {
    const adetDegeri = sayiDegeri(uretimForm[adetField]);
    const kgDegeri = sayiDegeri(uretimForm[kgField]) || (adetDegeri * birimKg);
    const gorunenKg = String(uretimForm[kgField] ?? "") || (kgDegeri > 0 ? String(kgDegeri) : "");
    const tutar = adetDegeri * sayiDegeri(uretimForm[fiyatField]);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 42px 42px 52px 58px", gap: "4px", alignItems: "center" }}>
        <span style={{ fontSize: "10px", fontWeight: "bold", color: "#7c3aed", lineHeight: 1.15 }}>{etiket}</span>
        <input
          placeholder="Adet"
          type="number"
          value={String(uretimForm[adetField] ?? "")}
          onChange={(e) => setUretimForm({ ...uretimForm, [adetField]: e.target.value })}
          className="m-inp small-inp"
          style={{ textAlign: "right", borderColor: "#ddd6fe", minWidth: 0 }}
        />
        <input
          value={gorunenKg}
          placeholder="KG"
          type="number"
          step="0.01"
          onChange={(e) => setUretimForm({ ...uretimForm, [kgField]: e.target.value })}
          className="m-inp small-inp"
          style={{ textAlign: "right", background: "#f5f3ff", borderColor: "#ddd6fe", minWidth: 0 }}
        />
        <input
          placeholder="Fiyat"
          type="number"
          step="0.01"
          value={String(uretimForm[fiyatField] ?? "")}
          onChange={(e) => setUretimForm({ ...uretimForm, [fiyatField]: e.target.value })}
          className="m-inp small-inp"
          style={{ textAlign: "right", borderColor: "#ddd6fe", minWidth: 0 }}
        />
        <div style={{ textAlign: "right", fontWeight: "bold", fontSize: "10.5px", color: "#7c3aed", minWidth: 0 }}>
          {fSayi(tutar)} ₺
        </div>
      </div>
    );
  };

  const uretimToplamDetayiAc = (
    kayitlar: Uretim[],
    tip: "yogurt" | "sut_kaymagi",
    alan: "giren" | "cikan" | "maliyet",
    renk: string,
  ) => {
    if (alan === "giren") {
      const satirlar = tip === "sut_kaymagi"
        ? [
            { etiket: "Krema", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.krema), 0))} KG` },
            { etiket: "Süt", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cig_sut), 0))} KG` },
            { etiket: "Teremyağ", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.tereyag), 0))} KG` },
            { etiket: "Katkı", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.katki_kg), 0))} KG` },
            { etiket: "Şeker", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.diger_kg), 0))} KG` },
            { etiket: "Su", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.su), 0))} KG` },
            { etiket: "Toplam", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimGirenToplamKg(kayit), 0))} KG`, vurgu: true },
          ]
        : [
            { etiket: "Süt", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cig_sut), 0))} KG` },
            { etiket: "Süt Tozu", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.sut_tozu), 0))} KG` },
            { etiket: "Teremyağ", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.tereyag), 0))} KG` },
            { etiket: "Katkı", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.katki_kg), 0))} KG` },
            { etiket: "Toplam", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimGirenToplamKg(kayit), 0))} KG`, vurgu: true },
          ];
      setUretimMiniDetay({ baslik: "Giren Detayı", renk, satirlar });
      return;
    }

    if (alan === "cikan") {
      const satirlar = tip === "sut_kaymagi"
        ? [
            { etiket: "2 KG", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cikti_2kg), 0))} Adet / ${fSayi(kayitlar.reduce((toplam, kayit) => toplam + (sayiDegeri(kayit.cikti_2kg_kg) || adettenKg(kayit.cikti_2kg, 2)), 0))} KG` },
            { etiket: "3 KG", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cikti_3kg), 0))} Adet / ${fSayi(kayitlar.reduce((toplam, kayit) => toplam + (sayiDegeri(kayit.cikti_3kg_kg) || adettenKg(kayit.cikti_3kg, 3)), 0))} KG` },
            { etiket: "Toplam", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamAdet(kayit), 0))} Adet / ${fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamKg(kayit), 0))} KG`, vurgu: true },
          ]
        : [
            { etiket: "3 KG", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cikti_3kg), 0))} Adet / ${fSayi(kayitlar.reduce((toplam, kayit) => toplam + (sayiDegeri(kayit.cikti_3kg_kg) || adettenKg(kayit.cikti_3kg, 3)), 0))} KG` },
            { etiket: "5 KG", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cikti_5kg), 0))} Adet / ${fSayi(kayitlar.reduce((toplam, kayit) => toplam + (sayiDegeri(kayit.cikti_5kg_kg) || adettenKg(kayit.cikti_5kg, 5)), 0))} KG` },
            { etiket: "Toplam", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamAdet(kayit), 0))} Adet / ${fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamKg(kayit), 0))} KG`, vurgu: true },
          ];
      setUretimMiniDetay({ baslik: "Çıkan Detayı", renk, satirlar });
      return;
    }

    const satirlar = tip === "sut_kaymagi"
      ? [
          { etiket: "Krema", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.krema, kayit.krema_fiyat), 0))} ₺` },
          { etiket: "Süt", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.cig_sut, kayit.sut_fiyat), 0))} ₺` },
          { etiket: "Teremyağ", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.tereyag, kayit.tereyag_fiyat), 0))} ₺` },
          { etiket: "Katkı", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.katki_kg, kayit.katki_fiyat), 0))} ₺` },
          { etiket: "Şeker", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + miktarSatirTutari(kayit.diger_kg, kayit.diger_adet, kayit.diger_fiyat), 0))} ₺` },
          { etiket: "Su", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.su, kayit.su_fiyat), 0))} ₺` },
          { etiket: "Toplam", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.toplam_maliyet), 0))} ₺`, vurgu: true },
        ]
      : [
          { etiket: "Süt", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.cig_sut, kayit.sut_fiyat), 0))} ₺` },
          { etiket: "Süt Tozu", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.sut_tozu, kayit.sut_tozu_fiyat), 0))} ₺` },
          { etiket: "Teremyağ", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.tereyag, kayit.tereyag_fiyat), 0))} ₺` },
          { etiket: "Katkı", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.katki_kg, kayit.katki_fiyat), 0))} ₺` },
          { etiket: "Toplam", deger: `${fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.toplam_maliyet), 0))} ₺`, vurgu: true },
        ];
    setUretimMiniDetay({ baslik: "Maliyet Detayı", renk, satirlar });
  };

  const renderUretimToplamlari = (kayitlar: Uretim[], renk: string, tip: "yogurt" | "sut_kaymagi") => {
    const toplamGiren = kayitlar.reduce((toplam, kayit) => toplam + uretimGirenToplamKg(kayit), 0);
    const toplamCikan = kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamKg(kayit), 0);
    const toplamMaliyet = kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.toplam_maliyet), 0);

    return (
      <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "nowrap" }}>
        <button type="button" onClick={() => uretimToplamDetayiAc(kayitlar, tip, "giren", renk)} style={{ flex: 1, border: `1px solid ${renk}33`, background: `${renk}10`, color: renk, borderRadius: "999px", padding: "5px 8px", textAlign: "center", fontSize: "10px", fontWeight: "bold", whiteSpace: "nowrap", minWidth: 0, cursor: "pointer" }}>
          GİREN {fSayi(toplamGiren)} KG
        </button>
        <button type="button" onClick={() => uretimToplamDetayiAc(kayitlar, tip, "cikan", renk)} style={{ flex: 1, border: "1px solid #2563eb33", background: "#2563eb10", color: "#2563eb", borderRadius: "999px", padding: "5px 8px", textAlign: "center", fontSize: "10px", fontWeight: "bold", whiteSpace: "nowrap", minWidth: 0, cursor: "pointer" }}>
          ÇIKAN {fSayi(toplamCikan)} KG
        </button>
        <button type="button" onClick={() => uretimToplamDetayiAc(kayitlar, tip, "maliyet", renk)} style={{ flex: 1, border: "1px solid #dc262633", background: "#dc262610", color: "#dc2626", borderRadius: "999px", padding: "5px 8px", textAlign: "center", fontSize: "10px", fontWeight: "bold", whiteSpace: "nowrap", minWidth: 0, cursor: "pointer" }}>
          MALİYET {fSayi(toplamMaliyet)} ₺
        </button>
      </div>
    );
  };

  const renderUretimTablosu = (
    baslik: string,
    kayitlar: Uretim[],
    renk: string,
    butonMetni: string,
    onYeniClick: () => void,
    tip: "yogurt" | "sut_kaymagi",
  ) => {
    const ilkPaketBaslik = tip === "sut_kaymagi" ? "2KG" : "3L";
    const ikinciPaketBaslik = tip === "sut_kaymagi" ? "3KG" : "5L";

    return (
    <div style={{ marginTop: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "8px", flexWrap: "nowrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0, color: renk, fontSize: "14px" }}>{baslik}</h3>
        </div>
        {uretimAksiyonYetkiliMi && (
          <button onClick={onYeniClick} className="btn-anim m-btn inline-mobile-btn" style={{ background: renk, margin: 0, minWidth: "118px", width: "auto", padding: "8px 8px", fontSize: "10px", whiteSpace: "nowrap", flex: "0 0 auto" }}>
            {butonMetni}
          </button>
        )}
      </div>
      {renderUretimToplamlari(kayitlar, renk, tip)}

      <div className="table-wrapper">
        <table className="tbl tbl-uretim" style={{ borderTop: `3px solid ${renk}`, tableLayout: "fixed", fontSize: "11px" }}>
          <thead><tr>
            <Th label="TAR" sortKey="tarih" currentSort={uretimSort} setSort={setUretimSort} />
            <th style={{ textAlign: "right", width: "13%" }}>GİR</th>
            <th style={{ textAlign: "right", width: "12%" }}>ÇIK</th>
            <th style={{ textAlign: "right", width: "10%" }}>{ilkPaketBaslik}</th>
            <th style={{ textAlign: "right", width: "10%" }}>{ikinciPaketBaslik}</th>
            <th style={{ textAlign: "right", width: "16%" }}>MALİYET</th>
            <Th label="KÂR" sortKey="kar" currentSort={uretimSort} setSort={setUretimSort} align="right" />
            <Th label="NOT" sortKey="aciklama" currentSort={uretimSort} setSort={setUretimSort} />
            <th style={{ width: "5%" }}></th>
          </tr></thead>
          <tbody>
            {kayitlar.length > 0 ? kayitlar.map((u) => {
              const ilkPaketAdet = tip === "sut_kaymagi" ? sayiDegeri(u.cikti_2kg) : sayiDegeri(u.cikti_3kg);
              const ikinciPaketAdet = tip === "sut_kaymagi" ? sayiDegeri(u.cikti_3kg) : sayiDegeri(u.cikti_5kg);
              const cikanKg = uretimCikanToplamKg(u);
              const silinebilir = uretimAksiyonYetkiliMi;
              const duzenlenebilir = uretimAksiyonYetkiliMi;
              return (
                <tr key={u.id}>
                  <td>{u.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold", color: "#1d4ed8" }}>{fSayi(uretimGirenToplamKg(u))}</td>
                  <td style={{ textAlign: "right", color: renk, fontWeight: "bold" }}>{fSayi(cikanKg)}</td>
                  <td style={{ textAlign: "right", color: renk, fontWeight: "bold" }}>{fSayi(ilkPaketAdet)}</td>
                  <td style={{ textAlign: "right", color: renk, fontWeight: "bold" }}>{fSayi(ikinciPaketAdet)}</td>
                  <td style={{ textAlign: "right", color: "#dc2626" }}>{fSayi(u.toplam_maliyet)}</td>
                  <td style={{ textAlign: "right", color: "#059669", fontWeight: "bold" }}>{fSayi(u.kar)}</td>
                  <td className="truncate-text-td" style={{ maxWidth: "68px" }} title={u.aciklama || "-"}>
                    {uretimNotunuKisalt(u.aciklama, 8)}
                  </td>
                  <td className="actions-cell" style={{ position: "relative" }}>
                    {uretimAksiyonYetkiliMi && (
                      <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: "uretim", id: u.id as string }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "0 8px", color: "#64748b" }}>⋮</button>
                    )}
                    {uretimAksiyonYetkiliMi && openDropdown?.type === "uretim" && openDropdown.id === u.id && (
                      <div className="dropdown-menu">
                        <button title="Görüntüle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setUretimDetayData(u); }}>🔍</button>
                        {duzenlenebilir && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setEditingUretimId(u.id); setUretimForm(uretimKaydiniNormalizeEt(u as Uretim)); setIsUretimModalOpen(true); }}>✏️</button>}
                        {silinebilir && <button title="Sil" className="dropdown-item-icon" style={{ color: "#dc2626" }} onClick={async () => { setOpenDropdown(null); await handleKayitSil("uretim", u, "uretim"); }}>🗑️</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "18px 10px", color: "#94a3b8", fontWeight: "bold" }}>
                  Bu tabloda henüz kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
  };

  const renderUretimYeni = () => (
    <div className="tab-fade-in main-content-area">
      {renderUretimTablosu("Yoğurt Üretimleri", yogurtUretimListesi, "#8b5cf6", "➕ YENİ YOĞURT ÜRETİMİ", () => yeniUretimFormunuAc("yogurt"), "yogurt")}
      {renderUretimTablosu("Süt Kaymağı Üretimleri", sutKaymagiUretimListesi, "#0f766e", "➕ YENİ SÜT KAYMAĞI ÜRETİMİ", () => yeniUretimFormunuAc("sut_kaymagi"), "sut_kaymagi")}
    </div>
  );

  const renderUretimModalYeni = () => (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "10px" }}>
      <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "460px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", maxHeight: "95vh" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "8px 10px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", background: editingUretimId ? "#f3e8ff" : "#f8fafc", borderRadius: "12px 12px 0 0" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ margin: 0, color: aktifUretimTipi === "sut_kaymagi" ? "#0f766e" : "#8b5cf6", fontSize: "13px", lineHeight: 1.15 }}>
              {editingUretimId ? "✏️ Üretim Düzenle" : aktifUretimTipi === "sut_kaymagi" ? "🥛 Yeni Süt Kaymağı Üretimi" : "🏭 Yeni Yoğurt Üretimi"}
            </h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
            <input type="date" value={uretimForm.tarih} onChange={e => setUretimForm({ ...uretimForm, tarih: e.target.value })} className="m-inp small-inp date-click" style={{ width: "106px", minWidth: "106px", fontWeight: "bold", padding: "5px 6px" }} />
            <button onClick={() => setIsUretimModalOpen(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#94a3b8", padding: 0, lineHeight: 1, marginRight: "2px" }}>✕</button>
          </div>
        </div>
        <div style={{ padding: "8px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "6px", background: "#f8fafc", display: "grid", gap: "4px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 52px 52px 58px", gap: "4px", fontSize: "8px", color: "#94a3b8", fontWeight: "bold" }}>
              <span>GİREN HAMMADDE</span>
              <span style={{ textAlign: "right" }}>KG</span>
              <span style={{ textAlign: "right" }}>FYT</span>
              <span style={{ textAlign: "right" }}>TUT.</span>
            </div>
            {aktifUretimTipi === "sut_kaymagi" ? (
              <>
                {renderKgSatiri("Krema", "krema", "krema_fiyat", "#0f766e")}
                {renderKgSatiri("Süt", "cig_sut", "sut_fiyat", "#0f766e")}
                {renderKgSatiri("Teremyağ", "tereyag", "tereyag_fiyat", "#0f766e")}
                {renderKgSatiri("Katkı", "katki_kg", "katki_fiyat", "#0f766e")}
                {renderKgSatiri("Şeker", "diger_kg", "diger_fiyat", "#0f766e")}
                {renderKgSatiri("Su", "su", "su_fiyat", "#0f766e")}
                {renderAdetFiyatSatiri("2 KG Boş Paket", "paket_2_adet", "paket_2_fiyat", "#0f766e", "cikti_2kg", "cikti_2kg_kg", 2)}
                {renderAdetFiyatSatiri("3 KG Boş Paket", "paket_3_adet", "paket_3_fiyat", "#0f766e", "cikti_3kg", "cikti_3kg_kg", 3)}
              </>
            ) : (
              <>
                {renderKgSatiri("Süt", "cig_sut", "sut_fiyat")}
                {renderKgSatiri("Süt Tozu", "sut_tozu", "sut_tozu_fiyat")}
                {renderKgSatiri("Teremyağ", "tereyag", "tereyag_fiyat")}
                {renderKgSatiri("Katkı", "katki_kg", "katki_fiyat")}
                {renderKgSatiri("Su", "su", "su_fiyat")}
                {renderAdetFiyatSatiri("3'lük Boş Kova", "kova_3_adet", "kova_3_fiyat", "#475569", "cikti_3kg", "cikti_3kg_kg", 3)}
                {renderAdetFiyatSatiri("5'lik Boş Kova", "kova_5_adet", "kova_5_fiyat", "#475569", "cikti_5kg", "cikti_5kg_kg", 5)}
              </>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 52px 52px 58px", gap: "4px", alignItems: "end", borderTop: "1px dashed #cbd5e1", paddingTop: "6px" }}>
              <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "bold" }}>TOPLAM</span>
              <span style={{ textAlign: "right", fontSize: "10px", fontWeight: "bold", color: "#1d4ed8", lineHeight: 1.1 }}>{fSayi(aktifUretimGirenKg)}</span>
              <span />
              <span style={{ textAlign: "right", fontSize: "10px", fontWeight: "bold", color: "#dc2626", lineHeight: 1.1 }}>{fSayi(aktifUretimMaliyet)}</span>
            </div>
          </div>

          <div style={{ border: "1px solid #c4b5fd", borderRadius: "8px", padding: "6px", background: "#f5f3ff", display: "grid", gap: "4px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 42px 42px 52px 58px", gap: "4px", fontSize: "8px", color: "#8b5cf6", fontWeight: "bold" }}>
              <span>ÇIKAN ÜRÜN</span>
              <span style={{ textAlign: "right" }}>ADET</span>
              <span style={{ textAlign: "right" }}>KG</span>
              <span style={{ textAlign: "right" }}>FYT</span>
              <span style={{ textAlign: "right" }}>TUT.</span>
            </div>
            {aktifUretimTipi === "sut_kaymagi" ? (
              <>
                {renderPaketCiktiSatiri("2 KG Kaymak", "cikti_2kg", "cikti_2kg_kg", "satis_2_fiyat", 2)}
                {renderPaketCiktiSatiri("3 KG Kaymak", "cikti_3kg", "cikti_3kg_kg", "satis_3_fiyat", 3)}
              </>
            ) : (
              <>
                {renderPaketCiktiSatiri("3 KG Yoğurt", "cikti_3kg", "cikti_3kg_kg", "satis_3_fiyat", 3)}
                {renderPaketCiktiSatiri("5 KG Yoğurt", "cikti_5kg", "cikti_5kg_kg", "satis_5_fiyat", 5)}
              </>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 42px 42px 52px 58px", gap: "4px", alignItems: "end", borderTop: "1px dashed #cbd5e1", paddingTop: "6px" }}>
              <span style={{ fontSize: "9px", color: "#7c3aed", fontWeight: "bold" }}>TOPLAM</span>
              <span />
              <span style={{ textAlign: "right", fontSize: "10px", fontWeight: "bold", color: "#2563eb", lineHeight: 1.1 }}>{fSayi(aktifUretimCikanKg)}</span>
              <span />
              <span style={{ textAlign: "right", fontSize: "10px", fontWeight: "bold", color: "#2563eb", lineHeight: 1.1 }}>{fSayi(aktifUretimSatisToplami)}</span>
            </div>
          </div>

          <div><input placeholder="Açıklama / Not..." value={uretimForm.aciklama} onChange={e => setUretimForm({ ...uretimForm, aciklama: e.target.value })} className="m-inp small-inp" style={{ width: "100%" }} /></div>
        </div>
        <div style={{ padding: "6px 8px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
            <div style={{ flex: "1 1 120px", minWidth: "108px", borderRadius: "999px", background: aktifUretimKar >= 0 ? "#ecfdf5" : "#fef2f2", border: `1px solid ${aktifUretimKar >= 0 ? "#86efac" : "#fecaca"}`, padding: "5px 8px", textAlign: "center" }}>
              <div style={{ fontSize: "8px", fontWeight: "bold", color: "#64748b", lineHeight: 1.1 }}>TAHMİNİ KAR</div>
              <div style={{ fontSize: "11px", fontWeight: "bold", marginTop: "2px", color: aktifUretimKar >= 0 ? "#059669" : "#dc2626", lineHeight: 1.1 }}>{fSayi(aktifUretimKar)} ₺</div>
            </div>
          </div>
          <button onClick={handleUretimKaydet} className="p-btn btn-anim" style={{ background: aktifUretimTipi === "sut_kaymagi" ? "#0f766e" : "#8b5cf6", width: "100%", height: "40px", fontSize: "14px" }}>{editingUretimId ? "GÜNCELLE" : "KAYDET"}</button>
        </div>
      </div>
    </div>
  );

  const renderUretimDetayYeni = () => {
    const detay = uretimDetayData as Uretim;
    const tip = detay.uretim_tipi || "yogurt";

    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: "10px" }}>
        <div style={{ backgroundColor: "#f8fafc", borderRadius: "10px", width: "95vw", maxWidth: "380px", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: "15px", textAlign: "center", borderBottom: "1px dashed #cbd5e1", background: "#fff", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 5px", color: tip === "sut_kaymagi" ? "#0f766e" : "#8b5cf6", fontSize: "16px" }}>{tip === "sut_kaymagi" ? "🥛 Süt Kaymağı Detayı" : "🏭 Yoğurt Üretim Detayı"}</h3>
            <div style={{ fontSize: "12px", color: "#64748b" }}>Tarih: {detay.tarih.split("-").reverse().join(".")}</div>
            <div style={{ textAlign: "left", marginTop: "15px" }}>
              <h4 style={{fontSize: "12px", margin: "0 0 5px", color: "#475569", borderBottom: "1px solid #e2e8f0"}}>Giren Hammaddeler</h4>
              {tip === "sut_kaymagi" ? (
                <>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Krema ({fSayi(detay.krema)} kg x {fSayi(detay.krema_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.krema, detay.krema_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Süt ({fSayi(detay.cig_sut)} kg x {fSayi(detay.sut_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.cig_sut, detay.sut_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Teremyağ ({fSayi(detay.tereyag)} kg x {fSayi(detay.tereyag_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.tereyag, detay.tereyag_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Katkı ({fSayi(detay.katki_kg)} kg x {fSayi(detay.katki_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.katki_kg, detay.katki_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Şeker ({fSayi(detay.diger_kg)} kg x {fSayi(detay.diger_fiyat)})</span><b>{fSayi(miktarSatirTutari(detay.diger_kg, detay.diger_adet, detay.diger_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Su ({fSayi(detay.su)} kg x {fSayi(detay.su_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.su, detay.su_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>2 KG Boş Paket ({fSayi(detay.paket_2_adet)} adet x {fSayi(detay.paket_2_fiyat)})</span><b>{fSayi(sayiDegeri(detay.paket_2_adet) * sayiDegeri(detay.paket_2_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>3 KG Boş Paket ({fSayi(detay.paket_3_adet)} adet x {fSayi(detay.paket_3_fiyat)})</span><b>{fSayi(sayiDegeri(detay.paket_3_adet) * sayiDegeri(detay.paket_3_fiyat))} ₺</b></div>
                </>
              ) : (
                <>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Süt ({fSayi(detay.cig_sut)} kg x {fSayi(detay.sut_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.cig_sut, detay.sut_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Süt Tozu ({fSayi(detay.sut_tozu)} kg x {fSayi(detay.sut_tozu_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.sut_tozu, detay.sut_tozu_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Teremyağ ({fSayi(detay.tereyag)} kg x {fSayi(detay.tereyag_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.tereyag, detay.tereyag_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Katkı ({fSayi(detay.katki_kg)} kg x {fSayi(detay.katki_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.katki_kg, detay.katki_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>Su ({fSayi(detay.su)} kg x {fSayi(detay.su_fiyat)})</span><b>{fSayi(kgSatirTutari(detay.su, detay.su_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>3'lük Kova ({fSayi(detay.kova_3_adet)} adet x {fSayi(detay.kova_3_fiyat)})</span><b>{fSayi(sayiDegeri(detay.kova_3_adet) * sayiDegeri(detay.kova_3_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>5'lik Kova ({fSayi(detay.kova_5_adet)} adet x {fSayi(detay.kova_5_fiyat)})</span><b>{fSayi(sayiDegeri(detay.kova_5_adet) * sayiDegeri(detay.kova_5_fiyat))} ₺</b></div>
                </>
              )}
            </div>
            <div style={{ textAlign: "left", marginTop: "15px" }}>
              <h4 style={{fontSize: "12px", margin: "0 0 5px", color: "#475569", borderBottom: "1px solid #e2e8f0"}}>Çıkan Ürünler</h4>
              {tip === "sut_kaymagi" ? (
                <>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>2 KG Kaymak ({fSayi(detay.cikti_2kg)} adet / {fSayi(sayiDegeri(detay.cikti_2kg_kg) || adettenKg(detay.cikti_2kg, 2))} kg)</span><b>{fSayi(sayiDegeri(detay.cikti_2kg) * sayiDegeri(detay.satis_2_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>3 KG Kaymak ({fSayi(detay.cikti_3kg)} adet / {fSayi(sayiDegeri(detay.cikti_3kg_kg) || adettenKg(detay.cikti_3kg, 3))} kg)</span><b>{fSayi(sayiDegeri(detay.cikti_3kg) * sayiDegeri(detay.satis_3_fiyat))} ₺</b></div>
                </>
              ) : (
                <>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>3 KG Yoğurt ({fSayi(detay.cikti_3kg)} adet / {fSayi(sayiDegeri(detay.cikti_3kg_kg) || adettenKg(detay.cikti_3kg, 3))} kg)</span><b>{fSayi(sayiDegeri(detay.cikti_3kg) * sayiDegeri(detay.satis_3_fiyat))} ₺</b></div>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0"}}><span>5 KG Yoğurt ({fSayi(detay.cikti_5kg)} adet / {fSayi(sayiDegeri(detay.cikti_5kg_kg) || adettenKg(detay.cikti_5kg, 5))} kg)</span><b>{fSayi(sayiDegeri(detay.cikti_5kg) * sayiDegeri(detay.satis_5_fiyat))} ₺</b></div>
                </>
              )}
            </div>
            <div style={{ textAlign: "left", marginTop: "15px", borderTop: "2px solid #e2e8f0", paddingTop: "10px" }}>
              <div style={{display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0"}}><span>Giren Toplam KG:</span><b>{fSayi(uretimGirenToplamKg(detay))} KG</b></div>
              <div style={{display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0"}}><span>Çıkan Toplam KG:</span><b>{fSayi(uretimCikanToplamKg(detay))} KG</b></div>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0', color: '#dc2626'}}><span>Toplam Maliyet:</span><b>{fSayi(detay.toplam_maliyet)} ₺</b></div>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '3px 0', color: '#059669', fontWeight: 'bold'}}><span>Tahmini Kar:</span><b>{fSayi(detay.kar)} ₺</b></div>
            </div>
          </div>
          <div style={{ padding: "10px" }}><button onClick={() => setUretimDetayData(null)} style={{ width: "100%", padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", color: "#475569", cursor: "pointer" }}>KAPAT</button></div>
        </div>
      </div>
    );
  };

  const renderUretimMiniDetay = () => {
    if (!uretimMiniDetay) return null;

    return (
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1320, padding: "14px" }} onClick={() => setUretimMiniDetay(null)}>
        <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "320px", padding: "14px", boxShadow: "0 20px 45px rgba(15, 23, 42, 0.2)" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, color: uretimMiniDetay.renk, fontSize: "14px" }}>{uretimMiniDetay.baslik}</h4>
            <button onClick={() => setUretimMiniDetay(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "18px", padding: 0 }}>✕</button>
          </div>
          <div style={{ display: "grid", gap: "6px" }}>
            {uretimMiniDetay.satirlar.map((satir) => (
              <div key={`${uretimMiniDetay.baslik}-${satir.etiket}`} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: satir.vurgu ? "12px" : "11px", fontWeight: satir.vurgu ? "bold" : "normal", color: satir.vurgu ? uretimMiniDetay.renk : "#334155", paddingTop: satir.vurgu ? "6px" : 0, borderTop: satir.vurgu ? "1px dashed #cbd5e1" : "none" }}>
                <span>{satir.etiket}</span>
                <span>{satir.deger}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderOzetMiniDetay = () => {
    if (!ozetMiniDetay) return null;

    return (
      <div
        style={{ position: "fixed", inset: 0, backgroundColor: "transparent", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1320, padding: "92px 14px 14px" }}
        onClick={() => setOzetMiniDetay(null)}
      >
        <div
          style={{ position: "relative", background: "#fff", borderRadius: "10px", width: "100%", maxWidth: "250px", padding: "10px 10px 9px", border: "1px solid #dbeafe", boxShadow: "0 12px 24px rgba(15, 23, 42, 0.12)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setOzetMiniDetay(null)}
            style={{ position: "absolute", top: "6px", right: "7px", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "15px", lineHeight: 1, padding: 0 }}
          >
            ✕
          </button>
          <div style={{ display: "grid", gap: "5px", paddingTop: "2px" }}>
            {ozetMiniDetay.satirlar.map((satir) => (
              <div key={`${satir.etiket}-${satir.deger}`} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: satir.vurgu ? "11px" : "10px", fontWeight: satir.vurgu ? "bold" : "normal", color: satir.vurgu ? ozetMiniDetay.renk : "#334155", paddingTop: satir.vurgu ? "5px" : 0, borderTop: satir.vurgu ? "1px dashed #cbd5e1" : "none" }}>
                <span>{satir.etiket}</span>
                <span>{satir.deger}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderAyarlar = () => (
    <SettingsPanel
      activeAyarTab={activeAyarTab}
      setActiveAyarTab={(tab) => {
        setActiveAyarTab(tab);
        if (tab === "depolama" && !depolamaDurumu && !isDepolamaLoading && !depolamaHata) {
          void depolamaDurumunuGetir();
        }
      }}
      aktifKullaniciEposta={aktifKullaniciEposta}
      bayiler={bayiler}
      urunler={urunler}
      tedarikciler={tedarikciler}
      giderTuruListesi={giderTuruListesi}
      copKutusuList={copKutusuList}
      yeniAyarDeger={yeniAyarDeger}
      setYeniAyarDeger={setYeniAyarDeger}
      handleAyarEkle={handleAyarEkle}
      onSettingEdit={(tablo, id, isim) => {
        const yeniIsim = prompt("Yeni isim", isim);
        if (yeniIsim && yeniIsim.trim() && yeniIsim.trim() !== isim) {
          ayarIslem(tablo, yeniIsim.trim(), "guncelle", id);
        }
      }}
      onSettingToggleActive={(tablo, id, aktif) => {
        ayarIslem(tablo, !aktif, "durum", id);
      }}
      onSettingDelete={(tablo, id, isim) => {
        if (confirm(`Silinecek: ${isim}`)) ayarIslem(tablo, null, "sil", id);
      }}
      onOpenTrash={() => verileriGetir("cop")}
      onEmptyTrash={handleEmptyTrash}
      onHtmlBackup={handleHtmlBackup}
      onExcelBackup={handleExcelBackup}
      onJsonBackup={handleJsonBackup}
      isBackupLoading={isBackupLoading}
      depolamaDurumu={depolamaDurumu}
      isDepolamaLoading={isDepolamaLoading}
      depolamaHata={depolamaHata}
      onLoadDepolama={depolamaDurumunuGetir}
      isAdmin={isAdmin}
      mevcutKullanici={mevcutKullanici}
      adminKullanicilar={adminKullanicilar}
      isAdminKullaniciLoading={isAdminKullaniciLoading}
      adminKullaniciHata={adminKullaniciHata}
      kullaniciListesi={kullaniciListesi}
      tabYetkileri={tabYetkileri}
      sekmeSecenekleri={sekmeSecenekleri}
      yetkiKaynak={yetkiKaynak}
      yetkiUyari={yetkiUyari}
      onChangeOwnPassword={handleOwnPasswordChange}
      onLoadAdminUsers={handleAdminUsersLoad}
      onCreateAdminUser={handleAdminCreateUser}
      onResetAdminUserPassword={handleAdminResetUserPassword}
      onSavePermissions={handlePermissionSave}
    />
  );

  if (!session) {
    return (
      <LoginScreen
        username={username}
        password={password}
        temaRengi={temaRengi}
        hatirlaSecili={localStorage.getItem("rememberMe") !== "false"}
        hataMesaji={authHata}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onSubmit={async (remember) => {
          setAuthHata("");
          /*
            setAuthHata("Lütfen bir kullanıcı seçin.");
          */
          localStorage.setItem("rememberMe", remember ? "true" : "false");
          if (remember) localStorage.setItem("user", normalizeUsername(username));
          else localStorage.removeItem("user");
          const { error } = await supabase.auth.signInWithPassword({
            email: username.includes("@") ? username : `${username}@sistem.local`,
            password,
          });
          if (error) {
            setAuthHata(error.message);
          }
        }}
      />
    );
  }
  
  const sekmeRengiGetir = (tabId: AppTabId | "menu") => {
    if (tabId === "satis") return "#059669";
    if (tabId === "gider") return "#dc2626";
    if (tabId === "analiz" || tabId === "uretim") return "#8b5cf6";
    if (tabId === "sut") return "#0f766e";
    if (tabId === "ayarlar") return "#64748b";
    if (tabId === "menu") return "#334155";
    return temaRengi;
  };

  const sekmeSec = (tabId: AppTabId) => {
    setActiveTab(tabId);
    setEditingSutId(null);
    setIsSutModalOpen(false);
    setIsFisModalOpen(false);
    setIsTahsilatModalOpen(false);
    setIsGiderModalOpen(false);
    setIsUretimModalOpen(false);
    setOpenDropdown(null);
    setIsBottomMenuOpen(false);
  };

  const sekmeButonStili = (renk: string, aktif: boolean) =>
    aktif
      ? {
          color: renk,
          background: `${renk}26`,
          borderColor: `${renk}55`,
          boxShadow: `0 12px 20px -16px ${renk}`,
        }
      : undefined;

  return (
    <div className="app-container">
      <header className="header-style">
        <b style={{ color: temaRengi, fontSize: "18px", marginLeft: "10px" }}>SULTANKÖY V3</b>
        <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginRight: '10px'}}>
           <select 
              value={aktifDonem} 
              onChange={e => { if(e.target.value === "KAPAT") setIsDonemModalOpen(true); else setAktifDonem(e.target.value); }} 
              className="m-inp" style={{padding: "2px 6px", height: "28px", fontSize: "12px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer", flex: "0 0 auto"}}>
             {aylar.map(ay => <option key={ay} value={ay}>{ay.replace('-', ' / ')}</option>)}
             <option value="KAPAT">⚠️ Dönemi Kapat</option>
           </select>
           <span style={{fontSize: "13px", fontWeight: "bold", color: "#0f172a"}}>{mevcutKullanici || normalizeUsername(username) || 'Kullanıcı'}</span>
           <button onClick={() => cikisYap()} style={{ background: "none", border: "1px solid #fecaca", borderRadius: "50%", width: "32px", height: "32px", color: "#dc2626", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
             <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M7.5 1v7h1V1h-1z"/><path d="M3 8.812a4.999 4.999 0 0 1 2.578-4.375l-.485-.874A6 6 0 1 0 11 3.616l-.501.865A5 5 0 1 1 3 8.812z"/></svg>
           </button>
        </div>
      </header>

      {veriYuklemeHata && (
        <div
          style={{
            margin: "8px 10px 0",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            fontSize: "12px",
          }}
        >
          <span>Veriler yenilenemedi: {veriYuklemeHata}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={() => void verileriGetir("hepsi")}
              style={{
                background: "#fff",
                border: "1px solid #fca5a5",
                borderRadius: "999px",
                color: "#b91c1c",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: "bold",
                padding: "4px 10px",
              }}
            >
              Tekrar Dene
            </button>
            <button
              onClick={() => setVeriYuklemeHata("")}
              style={{
                background: "none",
                border: "none",
                color: "#b91c1c",
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <main className="main-content">
        {activeTab === "ozet" && renderOzet()}
        {activeTab === "sut" && renderSut()}
        {activeTab === "satis" && renderSatis()}
        {activeTab === "gider" && renderGider()}
        {activeTab === "uretim" && renderUretimYeni()}
        {activeTab === "analiz" && renderAnaliz()}
        {activeTab === "ayarlar" && renderAyarlar()}

        {isDonemModalOpen && (
          <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.6)', zIndex: 1500, display:'flex', alignItems:'center', justifyContent:'center', padding: '10px'}}>
             <div style={{background:'#fff', padding:'20px', borderRadius:'10px', maxWidth:'300px', width:'100%', boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)"}}>
                 <h3 style={{margin:'0 0 10px', color:'#dc2626', fontSize: '16px'}}>⚠️ Dönemi Kapat</h3>
                 <p style={{fontSize:'13px', color:'#475569', lineHeight:'1.4'}}>Mevcut dönemi kapatıp yeni aya geçmek istediğinize emin misiniz?<br/><br/><span style={{fontSize: '11px', color: '#94a3b8'}}>(Yeni dönemde bakiyeler sıfırdan başlar, içerideki açık hesaplar yeni döneme otomatik olarak "Devir" fişi şeklinde aktarılır.)</span></p>
                 <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', fontWeight:'bold', marginTop:'15px', cursor:'pointer', color: '#0f172a'}}><input type="checkbox" checked={donemOnay} onChange={e=>setDonemOnay(e.target.checked)} style={{width:'18px', height:'18px'}} /> Onaylıyorum</label>
                 <div style={{display:'flex', gap:'8px', marginTop:'20px'}}><button onClick={()=>{setIsDonemModalOpen(false); setDonemOnay(false);}} style={{flex:1, padding:'10px', background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:'6px', fontWeight:'bold', color:'#475569', cursor: 'pointer'}}>VAZGEÇ</button><button onClick={handleDonemKapat} disabled={!donemOnay} style={{flex:1, padding:'10px', background: donemOnay ? '#dc2626' : '#fca5a5', border:'none', borderRadius:'6px', fontWeight:'bold', color:'#fff', cursor: donemOnay ? 'pointer' : 'not-allowed'}}>EVET, KAPAT</button></div>
             </div>
          </div>
        )}

        {digerModalConfig.isOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1400, padding: "10px" }}>
            <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "350px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={e => e.stopPropagation()}>
               <div style={{ padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "12px 12px 0 0" }}>
                 <h3 style={{ margin: "0", color: "#64748b", fontSize: "15px" }}>{digerModalConfig.mode === "view" ? "🏦 Kasaya Devir Görüntüle" : digerModalConfig.mode === "edit" ? "🏦 Kasaya Devir Düzenle" : "🏦 Kasaya Devir"}</h3>
                 <button onClick={resetDigerForm} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
               </div>
               <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
                 <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{flex: 1}}><label style={{fontSize: "11px", color: "#64748b"}}>Tarih</label><input type="date" value={digerForm.tarih} onChange={e => setDigerForm({...digerForm, tarih: e.target.value})} readOnly={digerModalConfig.mode === "view"} disabled={digerModalConfig.mode === "view"} className="m-inp date-click" style={{ width: "100%", opacity: digerModalConfig.mode === "view" ? 0.85 : 1 }} /></div>
                    <div style={{flex: 1}}><label style={{fontSize: "11px", color: "#64748b"}}>Tutar (₺)</label><input type="text" inputMode="decimal" value={paraGirdisiniFormatla(digerForm.tutar)} onChange={e => setDigerForm({...digerForm, tutar: paraGirdisiniTemizle(e.target.value)})} readOnly={digerModalConfig.mode === "view"} disabled={digerModalConfig.mode === "view"} className="m-inp" style={{width: "100%", textAlign: "right", color: "#0f172a", fontWeight: "bold", opacity: digerModalConfig.mode === "view" ? 0.85 : 1}} /></div>
                 </div>
                 <div><label style={{fontSize: "11px", color: "#64748b"}}>Açıklama / Not</label><input placeholder="Opsiyonel..." value={digerForm.aciklama} onChange={e => setDigerForm({...digerForm, aciklama: e.target.value})} readOnly={digerModalConfig.mode === "view"} disabled={digerModalConfig.mode === "view"} className="m-inp" style={{width: "100%", opacity: digerModalConfig.mode === "view" ? 0.85 : 1}} /></div>
               </div>
               <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
                 {digerModalConfig.mode === "view"
                   ? <button onClick={resetDigerForm} className="p-btn btn-anim" style={{ background: "#64748b", width: "100%", height: "45px", fontSize: "15px" }}>KAPAT</button>
                   : <button onClick={handleDigerIslemKaydet} className="p-btn btn-anim" style={{ background: "#64748b", width: "100%", height: "45px", fontSize: "15px" }}>{digerModalConfig.mode === "edit" ? "GÜNCELLE" : "KAYDET"}</button>}
               </div>
            </div>
          </div>
        )}

        {uretimDetayData && renderUretimDetayYeni()}
        {uretimMiniDetay && renderUretimMiniDetay()}
        {ozetMiniDetay && renderOzetMiniDetay()}

        {fisGorselOnizleme && (
          <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15,23,42,0.86)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1450, padding: "12px" }} onClick={() => setFisGorselOnizleme(null)}>
            <div style={{ width: "100%", maxWidth: "760px", maxHeight: "92vh", background: "#0f172a", borderRadius: "14px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.45)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#111827", color: "#fff" }}>
                <div style={{ fontWeight: "bold", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fisGorselOnizleme.baslik}</div>
                <button onClick={() => setFisGorselOnizleme(null)} style={{ background: "none", border: "none", color: "#cbd5e1", fontSize: "20px", cursor: "pointer", lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ padding: "12px", overflow: "auto", background: "#020617" }}>
                <img src={fisGorselOnizleme.url} alt={fisGorselOnizleme.baslik} style={{ width: "100%", height: "auto", maxHeight: "78vh", objectFit: "contain", borderRadius: "10px", display: "block", margin: "0 auto", background: "#000" }} />
              </div>
            </div>
          </div>
        )}

        {bayiSecimModal.hedef && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.55)",
              zIndex: 1420,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: "max(12px, env(safe-area-inset-top))",
              paddingLeft: "12px",
              paddingRight: "12px",
              paddingBottom: "12px",
            }}
            onClick={bayiSecimModalKapat}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "330px",
                maxHeight: "min(74vh, calc(100dvh - 24px))",
                background: "#fff",
                borderRadius: "14px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
                marginTop: "6px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>{bayiSecimModal.hedef === "fis" ? "Bayi Seç" : "Müşteri Seç"}</h3>
                  <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>Mobilde de açılır listeden seçim yapabilirsiniz.</div>
                </div>
                <button onClick={bayiSecimModalKapat} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
              </div>
              <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px", minHeight: 0, flex: 1 }}>
                <div style={{ position: "sticky", top: 0, zIndex: 1, background: "#fff", paddingBottom: "2px" }}>
                  <input
                    autoFocus
                    placeholder="Ara..."
                    value={bayiSecimModal.arama}
                    onChange={(e) => setBayiSecimModal((prev) => ({ ...prev, arama: e.target.value }))}
                    className="m-inp"
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "5px", paddingRight: "2px", minHeight: 0, flex: 1 }}>
                  {filtrelenmisBayiler.map((bayi) => {
                    const seciliDeger = bayiSecimModal.hedef === "fis" ? fisUst.bayi : tahsilatForm.bayi;
                    const secili = seciliDeger === bayi.isim;
                    return (
                      <button
                        key={bayi.id}
                        type="button"
                        onClick={() => handleBayiModalSecimi(bayi.isim)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          borderRadius: "9px",
                          border: `1px solid ${secili ? "#86efac" : "#cbd5e1"}`,
                          background: secili ? "#f0fdf4" : "#fff",
                          color: secili ? "#166534" : "#0f172a",
                          fontWeight: "bold",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        {bayi.isim}
                      </button>
                    );
                  })}
                  {filtrelenmisBayiler.length === 0 && (
                    <div style={{ textAlign: "center", padding: "16px 8px", color: "#94a3b8", fontWeight: "bold" }}>
                      Sonuç bulunamadı.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeFilterModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setActiveFilterModal(null)}>
            <div style={{ backgroundColor: "#fff", padding: "15px", borderRadius: "10px", width: "100%", maxWidth: "260px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
              <h4 style={{marginTop: 0, marginBottom: "10px", borderBottom: "1px solid #eee", paddingBottom: "5px", color: "#1e293b"}}>{activeFilterModal.endsWith('_tarih') ? 'Tarih Aralığı Seç' : 'Filtrele'}</h4>
              {activeFilterModal.endsWith('_tarih') && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div><label style={{fontSize: "12px", color: "#64748b"}}>Başlangıç</label><input type="date" value={activeFilterModal.includes('sut') ? sutFiltre.baslangic : activeFilterModal.includes('fis') ? fisFiltre.baslangic : analizFiltre.baslangic} onChange={(e) => { if(activeFilterModal.includes('sut')) setSutFiltre({...sutFiltre, baslangic: e.target.value}); if(activeFilterModal.includes('fis')) setFisFiltre({...fisFiltre, baslangic: e.target.value}); if(activeFilterModal.includes('analiz')) setAnalizFiltre({...analizFiltre, baslangic: e.target.value}); }} className="m-inp date-click" style={{width: "100%", marginTop: "4px"}} /></div>
                  <div><label style={{fontSize: "12px", color: "#64748b"}}>Bitiş</label><input type="date" value={activeFilterModal.includes('sut') ? sutFiltre.bitis : activeFilterModal.includes('fis') ? fisFiltre.bitis : analizFiltre.bitis} onChange={(e) => { if(activeFilterModal.includes('sut')) setSutFiltre({...sutFiltre, bitis: e.target.value}); if(activeFilterModal.includes('fis')) setFisFiltre({...fisFiltre, bitis: e.target.value}); if(activeFilterModal.includes('analiz')) setAnalizFiltre({...analizFiltre, bitis: e.target.value}); }} className="m-inp date-click" style={{width: "100%", marginTop: "4px"}} /></div>
                </div>
              )}
              <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" }}>
                {activeFilterModal === 'sut_ciftlik' && tedarikciler.map(t => (<label key={t.id} style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "14px"}}><input type="checkbox" checked={sutFiltre.ciftlikler.includes(t.isim)} onChange={() => handleCheckboxToggle('ciftlikler', setSutFiltre, t.isim)} style={{width:"18px", height:"18px"}}/> {t.isim}</label>))}
                {activeFilterModal === 'fis_bayi' && bayiler.map(b => (<label key={b.id} style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "14px"}}><input type="checkbox" checked={fisFiltre.bayiler.includes(b.isim)} onChange={() => handleCheckboxToggle('bayiler', setFisFiltre, b.isim)} style={{width:"18px", height:"18px"}}/> {b.isim}</label>))}
                {activeFilterModal === 'ozet_bayi' && ozetBorcFiltreSecenekleri.map(isim => (<label key={isim} style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "14px"}}><input type="checkbox" checked={ozetBorcFiltre.bayiler.includes(isim)} onChange={() => handleCheckboxToggle('bayiler', setOzetBorcFiltre, isim)} style={{width:"18px", height:"18px"}}/> {isim}</label>))}
                {activeFilterModal === 'analiz_bayi' && bayiler.map(b => (<label key={b.id} style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "14px"}}><input type="checkbox" checked={analizFiltre.bayiler.includes(b.isim)} onChange={() => handleCheckboxToggle('bayiler', setAnalizFiltre, b.isim)} style={{width:"18px", height:"18px"}}/> {b.isim}</label>))}
                {activeFilterModal === 'analiz_urun' && urunler.map(u => (<label key={u.id} style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "14px"}}><input type="checkbox" checked={analizFiltre.urunler.includes(u.isim)} onChange={() => handleCheckboxToggle('urunler', setAnalizFiltre, u.isim)} style={{width:"18px", height:"18px"}}/> {u.isim}</label>))}
              </div>
              <div style={{display: "flex", gap: "8px", marginTop: "15px"}}><button onClick={() => { if(activeFilterModal === 'sut_ciftlik') setSutFiltre({...sutFiltre, ciftlikler: []}); if(activeFilterModal === 'fis_bayi') setFisFiltre({...fisFiltre, bayiler: []}); if(activeFilterModal === 'ozet_bayi') setOzetBorcFiltre({ bayiler: [] }); if(activeFilterModal === 'analiz_bayi') setAnalizFiltre({...analizFiltre, bayiler: []}); if(activeFilterModal === 'analiz_urun') setAnalizFiltre({...analizFiltre, urunler: []}); if(activeFilterModal?.includes('_tarih')){ setSutFiltre({...sutFiltre, baslangic: '', bitis: ''}); setFisFiltre({...fisFiltre, baslangic: '', bitis: ''}); setAnalizFiltre({...analizFiltre, baslangic: '', bitis: ''}); } }} style={{flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: "6px", fontWeight: "bold"}}>TEMİZLE</button><button onClick={() => setActiveFilterModal(null)} style={{flex: 1, padding: "10px", background: activeFilterModal.includes('analiz') ? '#8b5cf6' : temaRengi, color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold"}}>UYGULA</button></div>
            </div>
          </div>
        )}

        {isFisModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "8px" }}>
            <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "420px", maxHeight: "95vh", borderRadius: "8px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: editingFisId ? "#fef3c7" : "#f8fafc", borderRadius: "8px 8px 0 0" }}>
                <h3 style={{ margin: "0", color: editingFisId ? "#b45309" : "#059669", fontSize: "15px" }}>{editingFisId ? "✏️ Fişi Düzenle" : "🧾 Yeni Satış Fişi"}</h3>
                <button onClick={() => { setIsDigerUrunMenuOpen(false); setIsFisModalOpen(false); }} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ padding: "10px 12px", overflowY: "auto", flex: 1 }}>
                <div style={{display: "flex", gap: "6px", marginBottom: "12px"}}>
                  <input type="date" value={fisUst.tarih} onChange={e => setFisUst({ ...fisUst, tarih: e.target.value })} className="m-inp date-click" style={{flex: "0 0 100px", padding: "6px 8px", fontSize: "13px"}} />
                  <button type="button" onClick={() => bayiSecimModalAc("fis")} className="m-inp grow-inp" style={{fontWeight: "bold", padding: "6px 8px", fontSize: "13px", textAlign: "left", color: fisUst.bayi ? "#0f172a" : "#94a3b8", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: "#fff"}}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fisUst.bayi || "Bayi Seç / Ara..."}</span>
                    <span style={{ marginLeft: "8px", color: "#64748b", fontSize: "11px" }}>SEÇ</span>
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                  {urunler.map(u => {
                    const isimLower = u.isim.toLowerCase();
                    const isFixed = (isimLower.includes("3 kg") || isimLower.includes("5 kg") || (isimLower.includes("kayma") && !isimLower.includes("yoğurt")));
                    const isVarsayilanUrun = isFixed && (isimLower.includes("3 kg") || isimLower.includes("5 kg"));
                    const isTereyagi = isimLower.includes("tereya");
                    const isYogurtKaymagi = isimLower.includes("yoğurt kayma");
                    const isFilled = (Number(fisDetay[u.id]?.adet) > 0 || Number(fisDetay[u.id]?.kg) > 0);
                    const isEkstraUrun = !isVarsayilanUrun && !isTereyagi && !isYogurtKaymagi;
                    const ekstraUrunSecili = gosterilenEkler.urunler.includes(u.id);
                    const isAktif = u.aktif !== false;

                    if (!isAktif && !isFilled) return null;
                    if (!isVarsayilanUrun && !isFilled && !(gosterilenEkler.tereyagi && isTereyagi) && !(gosterilenEkler.yogurt_kaymagi && isYogurtKaymagi) && !(isEkstraUrun && ekstraUrunSecili)) return null;

                    const handleAdetChange = (e: any) => {
                        const val = e.target.value;
                        let newKg = fisDetay[u.id]?.kg || "";
                        const match = u.isim.match(/(\d+(?:\.\d+)?)/);
                        if (match && match[1]) {
                            const multiplier = Number(match[1]);
                            if (val !== "") newKg = String(Number(val) * multiplier);
                            else newKg = "";
                        }
                        setFisDetay({...fisDetay, [u.id]: {...fisDetay[u.id], adet: val, kg: newKg}});
                    };
                    
                    const canliIsKova = u.isim.match(/([345])\s*kg/i);
                    const canliMiktar = canliIsKova ? Number(fisDetay[u.id]?.adet || 0) : (Number(fisDetay[u.id]?.kg) > 0 ? Number(fisDetay[u.id]?.kg) : Number(fisDetay[u.id]?.adet || 0));
                    const canliSatirTutar = canliMiktar * Number(fisDetay[u.id]?.fiyat || 0);

                    return (
                      <div key={u.id} style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 6px', background: isFilled ? (editingFisId ? '#fef3c7' : '#ecfdf5') : '#f8fafc', borderRadius: '4px', border: isFilled ? (editingFisId ? '1px solid #fde68a' : '1px solid #a7f3d0') : '1px solid #e2e8f0' }}>
                        <div style={{ flex: 1, minWidth: "85px", fontWeight: 'bold', fontSize: "12px", color: isFilled ? (editingFisId ? "#b45309" : "#065f46") : "#475569", whiteSpace: "normal", lineHeight: "1.2" }}>{u.isim}</div>
                        <input placeholder="Adet" type="number" value={fisDetay[u.id]?.adet || ""} onChange={handleAdetChange} className="m-inp" style={{flex: "0 0 45px", width: "45px", padding: "4px 2px", textAlign: "center", background: isFilled ? "#fff" : "", fontSize: "12px", height:"24px"}} />
                        <input placeholder="KG" type="number" step="0.01" value={fisDetay[u.id]?.kg || ""} onChange={e => setFisDetay({...fisDetay, [u.id]: {...fisDetay[u.id], kg: e.target.value}})} className="m-inp" style={{flex: "0 0 50px", width: "50px", padding: "4px 2px", textAlign: "center", background: isFilled ? "#fff" : "", fontSize: "12px", height:"24px"}} />
                        <div style={{fontSize:"12px", color:"#94a3b8", width:"8px", textAlign:"center"}}>{"x"}</div>
                        <input placeholder="Fiyat" type="number" step="0.01" value={fisDetay[u.id]?.fiyat || ""} onChange={e => setFisDetay({...fisDetay, [u.id]: {...fisDetay[u.id], fiyat: e.target.value}})} className="m-inp" style={{flex: "0 0 60px", width: "60px", padding: "4px 2px", textAlign: "right", background: isFilled ? "#fff" : "", fontSize: "12px", height:"24px"}} />
                        <div style={{width: "55px", textAlign: "right", fontWeight: "bold", fontSize: "12px", color: canliSatirTutar > 0 ? "#059669" : "#94a3b8"}}>{canliSatirTutar > 0 ? fSayi(canliSatirTutar) : "-"}</div>
                      </div>
                    );
                  })}
                  
                  <div style={{ display: "flex", gap: "6px", marginBottom: "4px", marginTop: "4px", flexWrap: "wrap", position: "relative" }}>
                      {(() => {
                        const digerSecenekler = aktifUrunler.filter(u => {
                          const isimLower = u.isim.toLowerCase();
                          const isFixed = (isimLower.includes("3 kg") || isimLower.includes("5 kg") || (isimLower.includes("kayma") && !isimLower.includes("yoğurt")));
                          const isVarsayilanUrun = isFixed && (isimLower.includes("3 kg") || isimLower.includes("5 kg"));
                          const isTereyagi = isimLower.includes("tereya");
                          const isYogurtKaymagi = isimLower.includes("yoğurt kayma");
                          const isFilled = (Number(fisDetay[u.id]?.adet) > 0 || Number(fisDetay[u.id]?.kg) > 0);
                          if (isVarsayilanUrun || isFilled) return false;
                          if (isTereyagi) return !gosterilenEkler.tereyagi;
                          if (isYogurtKaymagi) return !gosterilenEkler.yogurt_kaymagi;
                          return !gosterilenEkler.urunler.includes(u.id);
                        });

                        return digerSecenekler.length > 0 ? (
                          <div ref={digerUrunMenuRef} style={{ position: "relative" }}>
                            <button
                              onClick={() => setIsDigerUrunMenuOpen(p => !p)}
                              className="btn-anim"
                              style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 8px", fontSize: "11px", fontWeight: "bold", color: "#475569", height: "30px", display: "inline-flex", alignItems: "center" }}
                            >
                              + Diğer Ürünler
                            </button>
                            {isDigerUrunMenuOpen && (
                              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: "150px", maxWidth: "220px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "8px", boxShadow: "0 12px 24px rgba(15, 23, 42, 0.16)", padding: "6px", zIndex: 5, display: "flex", flexDirection: "column", gap: "4px" }}>
                                {digerSecenekler.map(u => {
                                  const isimLower = u.isim.toLowerCase();
                                  const isTereyagi = isimLower.includes("tereya");
                                  const isYogurtKaymagi = isimLower.includes("yoğurt kayma");
                                  return (
                                    <button
                                      key={u.id}
                                      onClick={() => {
                                        setGosterilenEkler(p => {
                                          if (isTereyagi) return { ...p, tereyagi: true };
                                          if (isYogurtKaymagi) return { ...p, yogurt_kaymagi: true };
                                          return { ...p, urunler: [...p.urunler, u.id] };
                                        });
                                        setIsDigerUrunMenuOpen(false);
                                      }}
                                      className="btn-anim"
                                      style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "6px 8px", fontSize: "11px", fontWeight: "bold", color: "#334155", textAlign: "left" }}
                                    >
                                      {u.isim}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : null;
                      })()}
                      <button onClick={() => setGosterilenEkler(p => ({...p, iade: true}))} className="btn-anim" style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", padding: "6px 8px", fontSize: "11px", fontWeight: "bold", color: "#dc2626", height: "30px", display: "inline-flex", alignItems: "center" }}>+ İade</button>
                      <button onClick={() => setGosterilenEkler(p => ({...p, bos_kova: true}))} className="btn-anim" style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", padding: "6px 8px", fontSize: "11px", fontWeight: "bold", color: "#dc2626", height: "30px", display: "inline-flex", alignItems: "center" }}>+ Boş Kova</button>
                  </div>

                  {(gosterilenEkler.iade || Number(fisDetay["v_iade"]?.adet) > 0 || Number(fisDetay["v_iade"]?.kg) > 0) && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 6px', background: '#fef2f2', borderRadius: '4px', border: '1px solid #fecaca', marginTop: "4px" }}>
                      <div style={{ flex: 1, minWidth: "85px", fontWeight: 'bold', fontSize: "12px", color: "#dc2626", whiteSpace: "normal", lineHeight: "1.2" }}>İade</div>
                      <input placeholder="Adet" type="number" value={fisDetay["v_iade"]?.adet || ""} onChange={e => setFisDetay({...fisDetay, v_iade: {...fisDetay["v_iade"], adet: e.target.value}})} className="m-inp" style={{flex: "0 0 45px", width: "45px", padding: "4px 2px", textAlign: "center", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <input placeholder="KG" type="number" step="0.01" value={fisDetay["v_iade"]?.kg || ""} onChange={e => setFisDetay({...fisDetay, v_iade: {...fisDetay["v_iade"], kg: e.target.value}})} className="m-inp" style={{flex: "0 0 50px", width: "50px", padding: "4px 2px", textAlign: "center", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <div style={{fontSize:"12px", color:"#94a3b8", width:"8px", textAlign:"center"}}>{"x"}</div>
                      <input placeholder="Fiyat" type="number" step="0.01" value={fisDetay["v_iade"]?.fiyat || ""} onChange={e => setFisDetay({...fisDetay, v_iade: {...fisDetay["v_iade"], fiyat: e.target.value}})} className="m-inp" style={{flex: "0 0 60px", width: "60px", padding: "4px 2px", textAlign: "right", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <div style={{width: "55px", textAlign: "right", fontWeight: "bold", fontSize: "12px", color: "#dc2626"}}>{fSayi((Number(fisDetay["v_iade"]?.kg) > 0 ? Number(fisDetay["v_iade"]?.kg) : Number(fisDetay["v_iade"]?.adet||0)) * Number(fisDetay["v_iade"]?.fiyat||0))}</div>
                    </div>
                  )}

                  {(gosterilenEkler.bos_kova || Number(fisDetay["v_bos_kova"]?.adet) > 0 || Number(fisDetay["v_bos_kova"]?.kg) > 0) && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 6px', background: '#fef2f2', borderRadius: '4px', border: '1px solid #fecaca', marginTop: "4px" }}>
                      <div style={{ flex: 1, minWidth: "85px", fontWeight: 'bold', fontSize: "12px", color: "#dc2626", whiteSpace: "normal", lineHeight: "1.2" }}>Boş Kova</div>
                      <input placeholder="Adet" type="number" value={fisDetay["v_bos_kova"]?.adet || ""} onChange={e => setFisDetay({...fisDetay, v_bos_kova: {...fisDetay["v_bos_kova"], adet: e.target.value}})} className="m-inp" style={{flex: "0 0 45px", width: "45px", padding: "4px 2px", textAlign: "center", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <input placeholder="KG" type="number" step="0.01" value={fisDetay["v_bos_kova"]?.kg || ""} onChange={e => setFisDetay({...fisDetay, v_bos_kova: {...fisDetay["v_bos_kova"], kg: e.target.value}})} className="m-inp" style={{flex: "0 0 50px", width: "50px", padding: "4px 2px", textAlign: "center", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <div style={{fontSize:"12px", color:"#94a3b8", width:"8px", textAlign:"center"}}>{"x"}</div>
                      <input placeholder="Fiyat" type="number" step="0.01" value={fisDetay["v_bos_kova"]?.fiyat || ""} onChange={e => setFisDetay({...fisDetay, v_bos_kova: {...fisDetay["v_bos_kova"], fiyat: e.target.value}})} className="m-inp" style={{flex: "0 0 60px", width: "60px", padding: "4px 2px", textAlign: "right", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <div style={{width: "55px", textAlign: "right", fontWeight: "bold", fontSize: "12px", color: "#dc2626"}}>{fSayi((Number(fisDetay["v_bos_kova"]?.kg) > 0 ? Number(fisDetay["v_bos_kova"]?.kg) : Number(fisDetay["v_bos_kova"]?.adet||0)) * Number(fisDetay["v_bos_kova"]?.fiyat||0))}</div>
                    </div>
                  )}

                </div>
                <div style={{display: "flex", gap: "6px"}}>
                  <select value={fisUst.odeme_turu} onChange={e => setFisUst({ ...fisUst, odeme_turu: e.target.value })} className="m-inp" style={{flex: "0 0 95px", padding: "6px 4px", fontSize: "12px", height: "30px"}}><option value="PEŞİN">💵 PEŞİN</option><option value="VADE">⏳ VADE</option><option value="KREDİ KARTI">💳 K.KARTI</option><option value="HAVALE/EFT">🏦 HAVALE</option></select>
                  <input placeholder="Açıklama/Not..." value={fisUst.aciklama} onChange={e => setFisUst({ ...fisUst, aciklama: e.target.value })} className="m-inp grow-inp" style={{padding: "6px 8px", fontSize: "12px", height: "30px"}} />
                </div>
                <div style={{display: "flex", gap: "6px", marginTop: "6px", alignItems: "center", flexWrap: "wrap"}}>
                  <label className="btn-anim" style={{ background: "#e2e8f0", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 10px", fontSize: "12px", fontWeight: "bold", color: "#334155", cursor: "pointer" }}>
                    <input type="file" accept="image/*" onChange={handleFisGorselSec} style={{ display: "none" }} />
                    {fisGorselDosyaAdi ? "Fotoğrafı Değiştir" : "Fotoğraf Ekle"}
                  </label>
                  <input placeholder="Teslim Alan (İsim Soyisim)" value={fisUst.teslim_alan || ""} onChange={e => setFisUst({ ...fisUst, teslim_alan: e.target.value })} className="m-inp grow-inp" style={{padding: "6px 8px", fontSize: "12px", height: "30px", minWidth: "180px"}} />
                  {fisGorselDosyaAdi && (
                    <>
                      <span style={{ fontSize: "11px", color: "#64748b", maxWidth: "150px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {fisGorselDosyaAdi}
                      </span>
                      <button onClick={handleFisGorselTemizle} className="btn-anim" style={{ background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "6px", padding: "6px 8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                        Temizle
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 8px 8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}><span style={{color: "#0f172a", fontWeight: "bold", fontSize: "14px"}}>Genel Toplam:</span><b style={{color: "#0f172a", fontSize: "16px"}}>{fSayi(fisCanliToplam)} ₺</b></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}><span style={{color: "#2563eb", fontWeight: "bold", fontSize: "13px"}}>Tahsil Edilen:</span><input type="text" inputMode="decimal" placeholder="Alınan..." value={paraGirdisiniFormatla(fisUst.tahsilat)} onChange={e => setFisUst({ ...fisUst, tahsilat: paraGirdisiniTemizle(e.target.value) })} className="m-inp" style={{ flex: "0 0 110px", padding: "4px 6px", textAlign: "right", borderColor: "#bfdbfe", fontSize: "13px", height: "28px" }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", borderTop: "1px dashed #cbd5e1", paddingTop: "6px" }}><span style={{color: (fisCanliToplam - paraGirdisiniSayiyaCevir(fisUst.tahsilat || "")) > 0 ? "#dc2626" : "#059669", fontWeight: "bold", fontSize: "13px"}}>BU FİŞTEN KALAN:</span><b style={{color: (fisCanliToplam - paraGirdisiniSayiyaCevir(fisUst.tahsilat || "")) > 0 ? "#dc2626" : "#059669", fontSize: "14px"}}>{fSayi(fisCanliToplam - paraGirdisiniSayiyaCevir(fisUst.tahsilat || ""))} ₺</b></div>
                
                {aktifBayi && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}><span style={{color: "#64748b", fontSize: "11px"}}>Önceki Bakiye:</span><b style={{color: "#64748b", fontSize: "12px"}}>{fSayi(eskiBorc)} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", background: "#fef2f2", padding: "6px", borderRadius: "6px", border: "1px solid #fecaca" }}><span style={{color: "#dc2626", fontWeight: "bold", fontSize: "12px"}}>GENEL TOPLAM BORÇ:</span><b style={{color: "#dc2626", fontSize: "16px"}}>{fSayi(toplamGenelBorc)} ₺</b></div>
                  </>
                )}
                <button onClick={handleTopluFisKaydet} className="p-btn btn-anim" style={{ background: editingFisId ? "#f59e0b" : "#059669", width: "100%", height: "40px", fontSize: "14px" }}>{editingFisId ? "DEĞİŞİKLİKLERİ KAYDET" : "FİŞİ KAYDET"}</button>
              </div>
            </div>
          </div>
        )}

        {sonFisData && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: "10px" }}>
            <div style={{ backgroundColor: "#f8fafc", borderRadius: "10px", width: "95vw", maxWidth: "340px", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "95vh" }}>
              <div style={{ overflowY: "auto", flex: 1 }}>
                <div id="print-receipt" style={{ background: "#fff", padding: "15px", textAlign: "center", borderBottom: "1px dashed #cbd5e1" }}>
                  <h2 style={{ margin: "0 0 2px", color: "#000", fontSize: "18px" }}>SULTANKÖY</h2><div style={{ color: "#000", fontSize: "11px", marginBottom: "12px" }}>Süt Ürünleri</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#000", marginBottom: "2px", gap: "8px" }}>
                    <span>Tarih | Fiş No:</span>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", textAlign: "right", flexWrap: "wrap" }}>
                      <span>{sonFisData.tarih.split("-").reverse().join(".")}</span>
                      <span style={{ color: "#334155", fontWeight: 400 }}>{gorunenFisNoOlustur(sonFisData)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#000", marginBottom: "2px" }}><span>Sayın:</span><b style={{textAlign: "right"}}>{sonFisData.bayi}</b></div>
                  
                  {(sonFisData.urunler.length > 0 || (sonFisData.ekstraIndirimler && sonFisData.ekstraIndirimler.length > 0)) && (
                    <table style={{ width: '100%', fontSize: '11px', textAlign: 'left', borderCollapse: 'collapse', marginBottom: '12px', color: '#000' }}>
                      <thead><tr style={{ borderBottom: '1px solid #000' }}><th style={{ paddingBottom: '4px' }}>Ürün</th><th style={{ paddingBottom: '4px', textAlign: 'center' }}>Adet</th><th style={{ paddingBottom: '4px', textAlign: 'center' }}>KG</th><th style={{ paddingBottom: '4px', textAlign: 'right' }}>B.Fiyat</th><th style={{ paddingBottom: '4px', textAlign: 'right' }}>Tutar</th></tr></thead>
                      <tbody>
                        {sonFisData.urunler.map((u:any, i:number) => (
                          <tr key={`u-${i}`}>
                            <td style={{ padding: '4px 0', borderBottom: '1px dashed #ccc' }}>{u.isim}</td>
                            <td style={{ padding: '4px 0', textAlign: 'center', borderBottom: '1px dashed #ccc' }}>{u.adet || '-'}</td>
                            <td style={{ padding: '4px 0', textAlign: 'center', borderBottom: '1px dashed #ccc' }}>{u.kg > 0 ? u.kg : '-'}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', borderBottom: '1px dashed #ccc' }}>{fSayi(u.fiyat)}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', borderBottom: '1px dashed #ccc' }}>{fSayi(u.tutar)}</td>
                          </tr>
                        ))}
                        {sonFisData.ekstraIndirimler && sonFisData.ekstraIndirimler.map((ek:any, i:number) => (
                          <tr key={`ek-${i}`}>
                            <td style={{ padding: '4px 0', borderBottom: '1px dashed #ccc' }}>{ek.isim}</td>
                            <td style={{ padding: '4px 0', textAlign: 'center', borderBottom: '1px dashed #ccc' }}>{ek.adet || '-'}</td>
                            <td style={{ padding: '4px 0', textAlign: 'center', borderBottom: '1px dashed #ccc' }}>{ek.kg > 0 ? ek.kg : '-'}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', borderBottom: '1px dashed #ccc' }}>{fSayi(ek.fiyat)}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', borderBottom: '1px dashed #ccc' }}>{fSayi(ek.tutar)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", paddingTop: "6px", color: "#000", borderTop: "1px dashed #ccc", marginTop: "4px" }}><span>Genel Toplam:</span><b>{fSayi(sonFisData.genelToplam)} ₺</b></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", paddingTop: "4px", color: "#000" }}><span>Tahsil Edilen:</span><b>{fSayi(sonFisData.tahsilat)}</b></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", paddingTop: "4px", color: "#000" }}><span>Bu Fiş Kalan:</span><b>{fSayi(sonFisData.kalanBakiye)}</b></div>
                  
                  {sonFisData.gosterBakiye && (sonFisData.eskiBorc !== 0 || sonFisData.genelBorc !== 0) && (
                    <div style={{ marginTop: "6px", borderTop: "1px solid #000", paddingTop: "6px" }}>
                      {sonFisData.eskiBorc !== 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#000", marginBottom: "2px" }}><span>Önceki Bakiye:</span><b>{fSayi(sonFisData.eskiBorc)} ₺</b></div>}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "#000", fontWeight: "bold" }}><span>GENEL TOPLAM BORÇ:</span><b>{fSayi(sonFisData.genelBorc)} ₺</b></div>
                    </div>
                  )}
                  {sonFisData.teslim_alan && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#000", marginTop: "10px" }}>
                      <span>Teslim Alan:</span><b style={{textAlign: "right"}}>{sonFisData.teslim_alan}</b>
                    </div>
                  )}
                  <div style={{ textAlign: "right", fontSize: "10px", color: "#000", marginTop: "10px", borderTop: "1px dashed #ccc", paddingTop: "4px" }}>Ödeme: {sonFisData.odeme}</div>
                  <div style={{ textAlign: "center", fontSize: "9px", color: "#000", marginTop: "12px" }}>Bizi tercih ettiğiniz için teşekkür ederiz. Hayırlı satışlar dileriz.</div>
                </div>
              </div>

              <div className="no-print" style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "6px", background: "#f8fafc", borderTop: "1px solid #cbd5e1" }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', background: '#e2e8f0', padding: '8px', borderRadius: '6px', cursor: 'pointer', color: '#1e293b', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={sonFisData.gosterBakiye} onChange={e => setSonFisData({...sonFisData, gosterBakiye: e.target.checked})} style={{ width: '16px', height: '16px' }} />
                  Fiş Çıktısında Müşteriye Genel Toplam Borcu Göster
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => window.print()} className="btn-anim" style={{ flex: 1, padding: "10px", background: "#475569", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span style={{fontSize:'16px'}}>🖨️</span> YAZDIR
                  </button>
                  <button onClick={handleWhatsappResimGonder} className="btn-anim" style={{ flex: 1, padding: "10px", background: "#25D366", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "13px", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
                    WHATSAPP
                  </button>
                </div>
                <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                  {fisDuzenlenebilirMi(sonFisData as Partial<SatisFis>) && <button onClick={() => { const fakeFis = { id: sonFisData.id, fis_no: sonFisData.fis_no, tarih: sonFisData.tarih, bayi: sonFisData.bayi, odeme_turu: sonFisData.odeme, aciklama: sonFisData.aciklama || "", tahsilat: sonFisData.tahsilat, kalan_bakiye: sonFisData.kalanBakiye, toplam_tutar: sonFisData.genelToplam, fis_gorseli: sonFisData.fis_gorseli, ekleyen: sonFisData.ekleyen }; setSonFisData(null); handleFisDuzenle(fakeFis as any); }} className="btn-anim" style={{ flex: 1, padding: "8px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px" }}>✏️ DÜZENLE</button>}
                  {fisSilinebilirMi(sonFisData as Partial<SatisFis>) && <button onClick={() => { if(confirm("Silinecek?")) { handleFisSil({ id: sonFisData.id, fis_no: sonFisData.fis_no, fis_gorseli: sonFisData.fis_gorseli, ekleyen: sonFisData.ekleyen } as any); setSonFisData(null); } }} className="btn-anim" style={{ flex: 1, padding: "8px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px" }}>🗑️ SİL</button>}
                </div>
                <button onClick={() => setSonFisData(null)} className="btn-anim" style={{ width: "100%", padding: "8px", background: "transparent", color: "#64748b", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", fontSize: "11px", marginTop: "2px" }}>KAPAT</button>
              </div>
            </div>
          </div>
        )}

        {musteriEkstreData && (
          <div className="print-modal-wrapper" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: "10px" }} onClick={() => setMusteriEkstreData(null)}>
            <div className="print-modal-content" style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "430px", borderRadius: "12px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
              <div id="print-customer-statement" style={{ background: "#fff", padding: "14px" }}>
                <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px", marginBottom: "10px" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: "#0f172a" }}>Müşteri Ekstresi</div>
                  <div style={{ fontSize: "13px", color: "#475569", marginTop: "4px" }}>{musteriEkstreData.musteri}</div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>{donemMetni(musteriEkstreData.donem)}</div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "25%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "16%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "5px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "9px", whiteSpace: "nowrap" }}>Tarih</th>
                      <th style={{ textAlign: "left", padding: "5px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "9px", whiteSpace: "nowrap" }}>Fiş No</th>
                      <th style={{ textAlign: "left", padding: "5px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "9px" }}>
                        <div>Ürün</div>
                        <div style={{ fontSize: "9px", fontWeight: "normal", color: "#94a3b8", marginTop: "1px" }}>(adet/tutar)</div>
                      </th>
                      <th style={{ textAlign: "right", padding: "5px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "9px", whiteSpace: "nowrap" }}>Tutar</th>
                      <th style={{ textAlign: "right", padding: "5px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "9px", whiteSpace: "nowrap" }}>Tahsilat</th>
                      <th style={{ textAlign: "right", padding: "5px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "9px" }}>Fişten Kalan Borç</th>
                    </tr>
                  </thead>
                  <tbody>
                    {musteriEkstreData.hareketler.length > 0 ? (
                      <>
                        {musteriEkstreData.hareketler.map((hareket, index) => (
                          <tr key={`${hareket.fisNo}-${index}`}>
                            <td style={{ padding: "6px 3px", borderBottom: "1px solid #f1f5f9", fontSize: "9px", whiteSpace: "nowrap" }}>
                              {(() => {
                                const parcalar = String(hareket.tarih || "").split("-");
                                return parcalar.length === 3 ? `${parcalar[2]}.${parcalar[1]}` : hareket.tarih;
                              })()}
                            </td>
                            <td style={{ padding: "6px 3px", borderBottom: "1px solid #f1f5f9", fontSize: "8px", color: "#64748b", whiteSpace: "nowrap" }}>{hareket.fisNo}</td>
                            <td style={{ padding: "6px 3px", borderBottom: "1px solid #f1f5f9", lineHeight: 1.25 }}>
                              {hareket.urunSatirlari.length > 0 ? (
                                hareket.urunSatirlari.map((urun, urunIndex) => (
                                  <div key={`${hareket.fisNo}-${urun.isim}-${urunIndex}`} style={{ marginBottom: urunIndex === hareket.urunSatirlari.length - 1 ? 0 : "3px" }}>
                                    <div style={{ fontSize: "10px", color: "#334155", fontWeight: "bold", whiteSpace: "nowrap" }}>
                                      {urun.isim}
                                    </div>
                                    <div style={{ fontSize: "9px", color: "#64748b", whiteSpace: "nowrap" }}>
                                      ({fSayi(urun.adet)}/{fSayi(urun.tutar)})
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <span style={{ color: "#94a3b8" }}>-</span>
                              )}
                            </td>
                            <td style={{ padding: "6px 3px", borderBottom: "1px solid #f1f5f9", textAlign: "right", color: hareket.tutar > 0 ? "#059669" : "#94a3b8", fontSize: "9px", whiteSpace: "nowrap" }}>{hareket.tutar > 0 ? `${fSayi(hareket.tutar)} ₺` : "-"}</td>
                            <td style={{ padding: "6px 3px", borderBottom: "1px solid #f1f5f9", textAlign: "right", color: hareket.tahsilat > 0 ? "#2563eb" : "#94a3b8", fontSize: "9px", whiteSpace: "nowrap" }}>{hareket.tahsilat > 0 ? `${fSayi(hareket.tahsilat)} ₺` : "-"}</td>
                            <td style={{ padding: "6px 3px", borderBottom: "1px solid #f1f5f9", textAlign: "right", color: hareket.fistenKalanBorc > 0 ? "#dc2626" : "#059669", fontWeight: "bold", fontSize: "9px", whiteSpace: "nowrap" }}>{fSayi(hareket.fistenKalanBorc)} ₺</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3} style={{ padding: "7px 3px 0", fontSize: "9px", color: "#64748b", fontWeight: "bold" }}>Toplam</td>
                          <td style={{ padding: "7px 3px 0", textAlign: "right", fontSize: "9px", color: "#059669", fontWeight: "bold", whiteSpace: "nowrap" }}>{fSayi(musteriEkstreToplamlari.tutar)} ₺</td>
                          <td style={{ padding: "7px 3px 0", textAlign: "right", fontSize: "9px", color: "#2563eb", fontWeight: "bold", whiteSpace: "nowrap" }}>{fSayi(musteriEkstreToplamlari.tahsilat)} ₺</td>
                          <td style={{ padding: "7px 3px 0", textAlign: "right", fontSize: "9px", color: musteriEkstreToplamlari.fistenKalanBorc > 0 ? "#dc2626" : "#059669", fontWeight: "bold", whiteSpace: "nowrap" }}>{fSayi(musteriEkstreToplamlari.fistenKalanBorc)} ₺</td>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "18px 6px", color: "#94a3b8", fontWeight: "bold" }}>
                          Bu dönem için hareket bulunmuyor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="no-print" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px", background: "#f8fafc", borderTop: "1px solid #cbd5e1" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => window.print()} className="btn-anim" style={{ flex: 1, padding: "10px", background: "#475569", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px" }}>
                    Yazdır
                  </button>
                  <button onClick={handleMusteriEkstrePaylas} className="btn-anim" style={{ flex: 1, padding: "10px", background: "#25D366", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px" }}>
                    JPEG Paylaş
                  </button>
                </div>
                <button onClick={() => setMusteriEkstreData(null)} className="btn-anim" style={{ width: "100%", padding: "8px", background: "transparent", color: "#64748b", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", fontSize: "11px" }}>
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}

        {isTahsilatModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "10px" }}>
            <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "350px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
               <div style={{ padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "12px 12px 0 0" }}>
                 <h3 style={{ margin: "0", color: "#2563eb", fontSize: "15px" }}>💸 Yeni Tahsilat Ekle</h3>
                 <button onClick={() => setIsTahsilatModalOpen(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
               </div>
               <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
                 <div style={{ display: "flex", gap: "8px" }}>
                    <input type="date" value={tahsilatForm.tarih} onChange={e => setTahsilatForm({ ...tahsilatForm, tarih: e.target.value })} className="m-inp date-click" style={{ flex: 1 }} />
                    <button type="button" onClick={() => bayiSecimModalAc("tahsilat")} className="m-inp" style={{ flex: 2, fontWeight: "bold", textAlign: "left", color: tahsilatForm.bayi ? "#0f172a" : "#94a3b8", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: "#fff" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tahsilatForm.bayi || "Müşteri Seç..."}</span>
                      <span style={{ marginLeft: "8px", color: "#64748b", fontSize: "11px" }}>SEÇ</span>
                    </button>
                 </div>
                 <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{flex: 1}}><label style={{fontSize: "11px", color: "#64748b"}}>Tutar (₺)</label><input type="text" inputMode="decimal" value={paraGirdisiniFormatla(tahsilatForm.miktar)} onChange={e => setTahsilatForm({ ...tahsilatForm, miktar: paraGirdisiniTemizle(e.target.value) })} className="m-inp" style={{width: "100%", textAlign: "right", color: "#059669", fontWeight: "bold"}} /></div>
                    <div style={{flex: 1}}>
                      <label style={{fontSize: "11px", color: "#64748b"}}>Ödeme Türü</label>
                      <select value={tahsilatForm.odeme_turu} onChange={e => setTahsilatForm({ ...tahsilatForm, odeme_turu: e.target.value })} className="m-inp" style={{width: "100%"}}><option value="PEŞİN">💵 PEŞİN</option><option value="KREDİ KARTI">💳 K.KARTI</option><option value="HAVALE/EFT">🏦 HAVALE</option></select>
                    </div>
                 </div>
                 <div><label style={{fontSize: "11px", color: "#64748b"}}>Açıklama / Not</label><input placeholder="Opsiyonel..." value={tahsilatForm.aciklama} onChange={e => setTahsilatForm({ ...tahsilatForm, aciklama: e.target.value })} className="m-inp" style={{width: "100%"}} /></div>
               </div>
               <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
                 <button onClick={handleTahsilatKaydet} className="p-btn btn-anim" style={{ background: "#2563eb", width: "100%", height: "45px", fontSize: "15px" }}>KAYDET</button>
               </div>
            </div>
          </div>
        )}

        {isGiderModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "10px" }}>
            <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "350px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: editingGiderId ? "#fef2f2" : "#f8fafc", borderRadius: "12px 12px 0 0" }}>
                <h3 style={{ margin: "0", color: "#dc2626", fontSize: "15px" }}>{editingGiderId ? "✏️ Gider Düzenle" : "💸 Yeni Gider"}</h3>
                <button onClick={() => setIsGiderModalOpen(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
              </div>
              <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                   <input type="date" value={giderForm.tarih} onChange={e => setGiderForm({ ...giderForm, tarih: e.target.value })} className="m-inp date-click" style={{ flex: 1 }} />
                   <select value={giderForm.tur} onChange={e => setGiderForm({ ...giderForm, tur: e.target.value })} className="m-inp" style={{ flex: 2, fontWeight: "bold" }}>
                     {giderTurleri.map(t => <option key={t} value={t}>{t}</option>)}
                   </select>
                </div>
                <div>
                  <label style={{fontSize: "11px", color: "#64748b"}}>Tutar (₺)</label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="number" step="0.01" value={giderForm.tutar} onChange={e => setGiderForm({ ...giderForm, tutar: e.target.value })} className="m-inp" style={{flex: 1, width: "100%", textAlign: "right", color: "#dc2626", fontWeight: "bold"}} />
                    <label className="btn-anim" style={{ background: "#e2e8f0", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "8px 10px", fontSize: "11px", fontWeight: "bold", color: "#334155", cursor: "pointer", flex: "0 0 auto", whiteSpace: "nowrap" }}>
                      <input type="file" accept="image/*" onChange={handleGiderGorselSec} style={{ display: "none" }} />
                      {giderGorselDosyaAdi ? "Fotoğrafı Değiştir" : "Fotoğraf Yükle"}
                    </label>
                  </div>
                  {giderGorselDosyaAdi && (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11px", color: "#64748b", maxWidth: "180px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {giderGorselDosyaAdi}
                      </span>
                      <button type="button" onClick={handleGiderGorselTemizle} className="btn-anim" style={{ background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "6px", padding: "6px 8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                        Temizle
                      </button>
                    </div>
                  )}
                </div>
                <div><label style={{fontSize: "11px", color: "#64748b"}}>Açıklama / Not</label><input placeholder="Opsiyonel..." value={giderForm.aciklama} onChange={e => setGiderForm({ ...giderForm, aciklama: e.target.value })} className="m-inp" style={{width: "100%"}} /></div>
              </div>
              <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
                <button onClick={handleGiderKaydet} className="p-btn btn-anim" style={{ background: "#dc2626", width: "100%", height: "45px", fontSize: "15px" }}>{editingGiderId ? "GÜNCELLE" : "KAYDET"}</button>
              </div>
            </div>
          </div>
        )}

        {isSutModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "10px" }}>
            <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "350px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: editingSutId ? "#fef3c7" : "#f8fafc", borderRadius: "12px 12px 0 0" }}>
                <h3 style={{ margin: "0", color: editingSutId ? "#b45309" : temaRengi, fontSize: "15px" }}>{editingSutId ? "✏️ Süt Düzenle" : "🥛 Yeni Süt Girişi"}</h3>
                <button onClick={() => setIsSutModalOpen(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
              </div>
              <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                   <input type="date" value={sutForm.tarih} onChange={e => setSutForm({ ...sutForm, tarih: e.target.value })} className="m-inp date-click" style={{ flex: 1 }} />
                   <select value={sutForm.ciftlik} onChange={e => handleSutCiftlikSecimi(e.target.value)} className="m-inp" style={{ flex: 2, fontWeight: "bold" }}>
                     <option value="">Çiftlik Seç...</option>
                     {aktifTedarikciler.map(t => <option key={t.id} value={t.isim}>{t.isim}</option>)}
                    </select>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{flex: 1}}><label style={{fontSize: "11px", color: "#64748b"}}>Miktar (KG)</label><input type="number" value={sutForm.kg} onChange={e => setSutForm({ ...sutForm, kg: e.target.value })} className="m-inp" style={{width: "100%", textAlign: "right"}} /></div>
                  <div style={{flex: 1}}><label style={{fontSize: "11px", color: "#64748b"}}>Birim Fiyat</label><input type="number" step="0.01" value={sutForm.fiyat} onChange={e => setSutForm({ ...sutForm, fiyat: e.target.value })} className="m-inp" style={{width: "100%", textAlign: "right"}} /></div>
                </div>
                <div><label style={{fontSize: "11px", color: "#64748b"}}>Açıklama / Not</label><input placeholder="Opsiyonel..." value={sutForm.aciklama} onChange={e => setSutForm({ ...sutForm, aciklama: e.target.value })} className="m-inp" style={{width: "100%"}} /></div>
              </div>
              <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}><span style={{color: "#64748b", fontSize: "13px"}}>Toplam Tutar:</span><b style={{color: temaRengi, fontSize: "18px"}}>{fSayi((Number(sutForm.kg) || 0) * (Number(sutForm.fiyat) || 0))} ₺</b></div>
                <button onClick={handleSutKaydet} className="p-btn btn-anim" style={{ background: editingSutId ? "#f59e0b" : temaRengi, width: "100%", height: "45px", fontSize: "15px" }}>{editingSutId ? "GÜNCELLE" : "KAYDET"}</button>
              </div>
            </div>
          </div>
        )}

        {isUretimModalOpen && renderUretimModalYeni()}

        {detayNot && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, padding: "20px" }} onClick={() => setDetayNot(null)}>
            <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "16px", width: "100%", maxWidth: "350px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 15px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>Açıklama / Not</h3><p style={{ margin: "0 0 25px", color: "#475569", lineHeight: "1.6", wordWrap: "break-word" }}>{detayNot}</p>
              <button onClick={() => setDetayNot(null)} style={{ width: "100%", padding: "12px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>KAPAT</button>
            </div>
          </div>
        )}
      </main>

      <footer ref={bottomMenuRef} className="fixed-nav main-content-area">
        {altMenuAnaSekmeleri.map((item) => {
          const aktif = activeTab === item.id;
          const renk = sekmeRengiGetir(item.id);
          return (
              <button
                key={item.id}
                onClick={() => sekmeSec(item.id)}
                className={`n-item btn-anim ${aktif ? "active" : ""}`}
                style={sekmeButonStili(renk, aktif)}
              >
                <span style={{ fontSize: item.id === "satis" ? "25px" : "18px", marginBottom: "1px", lineHeight: 1 }}>{item.ikon}</span>
                <span style={{ fontSize: item.id === "satis" ? "11px" : "10px", fontWeight: "bold", lineHeight: 1 }}>{item.etiket}</span>
              </button>
            );
          })}

        {altMenuDigerSekmeleri.length > 0 && (
          <div style={{ position: "relative", display: "flex", flex: 1, order: -1 }}>
            <button
              onClick={() => setIsBottomMenuOpen((prev) => !prev)}
              className={`n-item btn-anim ${isBottomMenuOpen || altMenuGizliSekmeAktif ? "active" : ""}`}
              style={sekmeButonStili(sekmeRengiGetir("menu"), isBottomMenuOpen || altMenuGizliSekmeAktif)}
            >
              <span style={{ fontSize: "19px", marginBottom: "1px", lineHeight: 1 }}>☰</span>
              <span style={{ fontSize: "10px", fontWeight: "bold", lineHeight: 1 }}>MENÜ</span>
            </button>

            {isBottomMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: "calc(100% + 8px)",
                  width: "min(168px, calc(100vw - 20px))",
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "16px",
                  boxShadow: "0 20px 30px -18px rgba(15, 23, 42, 0.35)",
                  padding: "7px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "5px",
                  zIndex: 130,
                }}
              >
                {altMenuDigerSekmeleri.map((item) => {
                  const aktif = activeTab === item.id;
                  const renk = sekmeRengiGetir(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => sekmeSec(item.id)}
                      className="btn-anim"
                      style={{
                        border: `1px solid ${aktif ? `${renk}33` : "#e2e8f0"}`,
                        borderRadius: "12px",
                        background: aktif ? `${renk}14` : "#f8fafc",
                        color: aktif ? renk : "#475569",
                        minHeight: "44px",
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: "7px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        padding: "7px 9px",
                      }}
                    >
                      <span style={{ fontSize: "15px", lineHeight: 1, width: "18px", textAlign: "center", flexShrink: 0 }}>{item.ikon}</span>
                      <span style={{ fontSize: "10px", textAlign: "left" }}>{item.etiket}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </footer>

      <style>{`
        * { box-sizing: border-box; }
        :root { color-scheme: light !important; }
        
        html, body { width: 100%; max-width: 100%; overflow-x: hidden !important; margin: 0 !important; padding: 0 !important; background: #e2e8f0 !important; font-family: -apple-system, system-ui, sans-serif; color: #1e293b !important; }
        #root { display: block !important; padding: 0 !important; margin: 0 auto !important; width: 100% !important; text-align: left !important; }
        input::placeholder { color: #94a3b8 !important; opacity: 1; }
        
        input[type="date"] { position: relative; cursor: pointer; }
        input[type="date"]::-webkit-calendar-picker-indicator { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }

        .app-container { max-width: 800px; margin: 0 auto; width: 100%; min-height: 100vh; background: #e2e8f0; position: relative; overflow-x: hidden; }
        .header-style { display: flex; justify-content: space-between; padding: 12px 0; background: #fff; border-bottom: 1px solid #cbd5e1; position: sticky; top: 0; z-index: 50; width: 100%; align-items: center; }
        .main-content { padding: 10px; padding-bottom: 80px; width: 100%; box-sizing: border-box; }
        .tab-fade-in { animation: fadeIn 0.3s ease-in-out; width: 100%; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        
        .m-inp { flex: 1 1 120px; padding: 8px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; background: #fff; color: #1e293b !important; }
        .small-inp { padding: 2px 4px !important; font-size: 11px !important; height: 24px !important; }
        .micro-inp { text-align: center; } .micro-inp-right { text-align: right; }
        .grow-inp { flex: 1 1 120px !important; }
        .p-btn { flex: 0 0 auto !important; padding: 0 20px; height: 36px; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; }
        
        .card { background: #fff; padding: 15px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 15px; width: 100%; box-sizing: border-box; }
        .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
        .m-btn { width: 100%; padding: 12px; color: #fff; border: none; border-radius: 10px; font-weight: bold; font-size: 15px; cursor: pointer; margin-bottom: 10px; }
        .inline-mobile-btn { width: auto !important; margin-left: 0 !important; margin-right: 0 !important; flex: 0 0 auto !important; }
        .green-btn { background: #059669; } .blue-btn { background: #2563eb; }
        
        .compact-totals { display: flex; gap: 6px; margin-bottom: 12px; width: 100%; justify-content: space-between; }
        .c-kutu { flex: 1; background: #fff; padding: 8px 6px; border-radius: 14px; border: 1px solid #cbd5e1; border-left-width: 4px; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); text-align: center; min-width: 0; }
        .c-kutu span { font-size: 8.5px; color: #64748b; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .c-kutu b { font-size: 12px; line-height: 1.15; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
        .summary-c .c-kutu span { font-size: 12px; }
        .summary-c .c-kutu b { font-size: 16px; }
        
        .table-wrapper { width: 100%; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow-x: auto; box-sizing: border-box; }
        .tbl { width: 100%; border-collapse: collapse; table-layout: auto; min-width: 100%; }
        .tbl th { background: #f1f5f9; border-bottom: 1px solid #cbd5e1; color: #475569; font-weight: bold; font-size: 10px; padding: 3px 4px !important; white-space: nowrap; }
        .tbl-satis { table-layout: fixed !important; width: 100% !important; min-width: 0 !important; }
        .tbl-satis th { background: #5b9bd5 !important; color: white !important; }
        .tbl-satis th:nth-child(1), .tbl-satis td:nth-child(1) { width: 12%; text-align: center; }
        .tbl-satis th:nth-child(2), .tbl-satis td:nth-child(2) { width: 30%; }
        .tbl-satis th:nth-child(3), .tbl-satis td:nth-child(3) { width: 14%; }
        .tbl-satis th:nth-child(4), .tbl-satis td:nth-child(4) { width: 14%; }
        .tbl-satis th:nth-child(5), .tbl-satis td:nth-child(5) { width: 14%; }
        .tbl-satis th:nth-child(6), .tbl-satis td:nth-child(6) { width: 10%; }
        .tbl-satis th:nth-child(7), .tbl-satis td:nth-child(7) { width: 6%; }
        .tbl-uretim { table-layout: fixed !important; width: 100% !important; min-width: 0 !important; }
        .tbl-analiz th { background: #8b5cf6 !important; color: white !important; }
        .tbl td { font-size: 11px; border-bottom: 1px solid #f1f5f9; padding: 3px 4px !important; white-space: nowrap; vertical-align: middle; }
        
        .actions-cell { white-space: nowrap !important; width: 1% !important; text-align: right; }
        .dropdown-menu { position: absolute; right: 30px; top: 50%; transform: translateY(-50%); background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.15); z-index: 100; display: flex; flex-direction: row; padding: 4px; gap: 8px; }
        .dropdown-item-icon { background: none; border: none; cursor: pointer; font-size: 16px; padding: 6px; border-radius: 4px; transition: background 0.1s; display: flex; align-items: center; justify-content: center;}
        .dropdown-item-icon:hover { background: #f1f5f9; }

        .truncate-text-td { max-width: 75px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }

        .fixed-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 1000px; min-height: 64px; background: rgba(255,255,255,0.98); border-top: 1px solid #cbd5e1; display: flex; z-index: 100; padding: 6px 6px calc(6px + env(safe-area-inset-bottom, 0px)); gap: 6px; align-items: stretch; backdrop-filter: blur(8px); }
        .n-item { flex: 1; border: 1px solid transparent; background: #f1f5f9; color: #64748b; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border-radius: 14px; padding: 4px 4px; min-height: 48px; gap: 2px; }
        .n-item.active { background: #dbeafe; }
        .btn-anim { transition: transform 0.1s; } .btn-anim:active { transform: scale(0.95); }

        @media (max-width: 600px) {
          .main-content { padding: 0 !important; padding-bottom: 80px !important; width: 100% !important; overflow-x: hidden !important; }
          .table-wrapper { width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; margin: 0 !important; }
          .tbl th, .tbl td { padding: 3px 2px !important; font-size: 11px !important; }
          .tbl th:first-child, .tbl td:first-child { padding-left: 4px !important; }
          .tbl th:last-child, .tbl td:last-child { padding-right: 4px !important; }
          .card, .m-btn { width: calc(100% - 8px) !important; margin-left: 4px !important; margin-right: 4px !important; box-sizing: border-box !important; }
          .gider-ust-satir { width: calc(100% - 8px) !important; margin-left: 4px !important; margin-right: 4px !important; gap: 6px !important; }
          .gider-filtre-grup { min-width: 94px !important; flex: 0 0 94px !important; }
          .gider-filtre-grup button { padding: 8px 6px !important; font-size: 11px !important; }
          .m-btn.inline-mobile-btn { width: auto !important; margin-left: 0 !important; margin-right: 0 !important; min-width: 118px !important; padding: 10px 8px !important; font-size: 12px !important; flex: 0 0 auto !important; }
          .gider-ust-ozet { min-width: 0 !important; flex: 1 1 0 !important; font-size: 10px !important; padding: 4px 6px !important; }
          .cards-grid { width: calc(100% - 8px) !important; margin-left: 4px !important; margin-right: 4px !important; }
          .compact-totals { width: calc(100% - 4px) !important; margin-left: 2px !important; margin-right: 2px !important; gap: 4px !important; }
          .card { border-radius: 8px !important; padding: 12px !important; margin-bottom: 8px !important; }
          .summary-c { margin-left: 0 !important; margin-right: 0 !important; border-radius: 6px !important; width: 100% !important; }
          .c-kutu { border-radius: 14px !important; padding: 7px 4px !important; min-width: 0 !important; }
          .c-kutu span { font-size: 7px !important; margin-bottom: 1px !important; }
          .c-kutu b { font-size: 10px !important; }
          .summary-c .c-kutu span { font-size: 10px !important; }
          .summary-c .c-kutu b { font-size: 13px !important; }
          .compact-totals.three .c-kutu { flex: 0 0 calc((100% - 8px) / 3) !important; width: calc((100% - 8px) / 3) !important; }
          .compact-totals.two .c-kutu { flex: 0 0 calc((100% - 4px) / 2) !important; width: calc((100% - 4px) / 2) !important; }
          .tbl-satis th:nth-child(1), .tbl-satis td:nth-child(1) { width: 8% !important; }
          .tbl-satis th:nth-child(2), .tbl-satis td:nth-child(2) { width: 33% !important; }
          .tbl-satis th:nth-child(3), .tbl-satis td:nth-child(3) { width: 15% !important; font-size: 10px !important; }
          .tbl-satis th:nth-child(4), .tbl-satis td:nth-child(4) { width: 14% !important; font-size: 10px !important; }
          .tbl-satis th:nth-child(5), .tbl-satis td:nth-child(5) { width: 17% !important; font-size: 10px !important; }
          .tbl-satis th:nth-child(6), .tbl-satis td:nth-child(6) { width: 8% !important; font-size: 10px !important; }
          .tbl-satis th:nth-child(7), .tbl-satis td:nth-child(7) { width: 5% !important; }
          .tbl-satis td:nth-child(3),
          .tbl-satis td:nth-child(4),
          .tbl-satis td:nth-child(5) { font-weight: 700; }
          .tbl-uretim th:nth-child(1), .tbl-uretim td:nth-child(1) { width: 8% !important; }
          .tbl-uretim th:nth-child(2), .tbl-uretim td:nth-child(2) { width: 12% !important; font-size: 9px !important; }
          .tbl-uretim th:nth-child(3), .tbl-uretim td:nth-child(3) { width: 12% !important; font-size: 9px !important; }
          .tbl-uretim th:nth-child(4), .tbl-uretim td:nth-child(4) { width: 9% !important; font-size: 9px !important; }
          .tbl-uretim th:nth-child(5), .tbl-uretim td:nth-child(5) { width: 9% !important; font-size: 9px !important; }
          .tbl-uretim th:nth-child(6), .tbl-uretim td:nth-child(6) { width: 16% !important; font-size: 9px !important; }
          .tbl-uretim th:nth-child(7), .tbl-uretim td:nth-child(7) { width: 14% !important; font-size: 9px !important; }
          .tbl-uretim th:nth-child(8), .tbl-uretim td:nth-child(8) { width: 15% !important; }
          .tbl-uretim th:nth-child(9), .tbl-uretim td:nth-child(9) { width: 5% !important; }
          .tbl-personel th:nth-child(1), .tbl-personel td:nth-child(1) { width: 12% !important; }
          .tbl-personel th:nth-child(2), .tbl-personel td:nth-child(2),
          .tbl-personel th:nth-child(3), .tbl-personel td:nth-child(3),
          .tbl-personel th:nth-child(4), .tbl-personel td:nth-child(4),
          .tbl-personel th:nth-child(5), .tbl-personel td:nth-child(5),
          .tbl-personel th:nth-child(6), .tbl-personel td:nth-child(6),
          .tbl-personel th:nth-child(7), .tbl-personel td:nth-child(7) { width: calc((100% - 12%) / 6) !important; font-size: 10px !important; }
          .tbl-personel td { line-height: 1.05 !important; font-variant-numeric: tabular-nums; }
          .truncate-text-td { max-width: 72px !important; }
          .fixed-nav { min-height: 62px !important; padding: 5px 4px calc(5px + env(safe-area-inset-bottom, 0px)) !important; gap: 4px !important; }
          .n-item { padding: 3px 2px !important; min-height: 46px !important; border-radius: 12px !important; gap: 1px !important; }
          .n-item span:first-child { font-size: 18px !important; }
          .n-item span:last-child { font-size: 10px !important; letter-spacing: -0.2px; }
        }

        @media print {
          @page { margin: 0; size: 58mm auto; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff !important; overflow: visible !important; width: auto !important; max-width: none !important; }
          .main-content-area, header, footer { display: none !important; }
          .print-modal-wrapper { position: static !important; display: block !important; background: transparent !important; padding: 0 !important; }
          .print-modal-content { max-width: 100% !important; border-radius: 0 !important; box-shadow: none !important; }
          #print-receipt { border: none !important; padding: 0 !important; width: 55mm; margin: 0 auto; display: block !important; }
          #print-customer-statement { border: none !important; padding: 0 !important; width: 100%; max-width: 180mm; margin: 0 auto; display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
