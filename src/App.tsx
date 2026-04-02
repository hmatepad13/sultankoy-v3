/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { LoginScreen } from "./components/LoginScreen";
import { DonemDisiTarihUyarisi } from "./components/DonemDisiTarihUyarisi";
import { SatisPanel } from "./components/SatisPanel";
import {
  GIDER_TURLERI,
  TAB_TANIMLARI,
  TEMA_RENGI,
} from "./constants/app";
import {
  hammaddeBorclariniHesapla,
  hammaddeBorcuGideriMi,
  katkiOdemesiMi,
  kovaOdemesiMi,
  kremaOdemesiMi,
  normalGiderMi,
  sutcuBorcunuHesapla,
  sutOdemesiMi,
  sutTozuOdemesiMi,
} from "./lib/gider";
import { installClientTelemetry, logClientError, logClientEvent, setClientTelemetryContext } from "./lib/clientTelemetry";
import { adminMi, kullaniciYetkileriniKaydet, kullaniciYetkileriniYukle, kullaniciYetkisiniBul } from "./lib/permissions";
import { supabase } from "./lib/supabase";
import { uretimKaydiniNormalizeEt } from "./lib/uretim";
import type {
  ActiveAyarTab,
  AdminKullanici,
  AppConfirmOptions,
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
  StartupLogDiagnostics,
  SutGiris,
  Uretim,
  Urun,
  YedekVerisi,
} from "./types/app";
import { aktifDonemDisiKayitOnayMetni, getLocalDateString } from "./utils/date";
import { normalizeUsername } from "./utils/format";

const SUPABASE_FREE_DATABASE_LIMIT_BYTES = 500_000_000;
const SUPABASE_FREE_STORAGE_LIMIT_BYTES = 1_000_000_000;
const BAYILER_CACHE_KEY = "app-cache-bayiler-v1";
const URUNLER_CACHE_KEY = "app-cache-urunler-v1";
const ODEME_TURU_SECENEKLERI = [
  { value: "PEŞİN", label: "💵 PEŞİN" },
  { value: "VADE", label: "⏳ VADE" },
  { value: "KREDİ KARTI", label: "💳 K.KARTI" },
  { value: "HAVALE/EFT", label: "🏦 HAVALE" },
  { value: "ÇEK", label: "🧾 ÇEK" },
  { value: "SENET", label: "📝 SENET" },
] as const;
const gunOfsetliTarih = (gunFarki: number) => {
  const tarih = new Date();
  tarih.setDate(tarih.getDate() + gunFarki);
  tarih.setMinutes(tarih.getMinutes() - tarih.getTimezoneOffset());
  return tarih.toISOString().split("T")[0];
};

const sayiDegeri = (deger: unknown) => {
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (typeof deger === "string" && deger.trim() && !Number.isNaN(Number(deger))) return Number(deger);
  return 0;
};

const GORSEL_OPTIMIZE_UZUN_KENAR = 1200;
const GORSEL_OPTIMIZE_KALITE = 0.5;

const gorseliOptimizasyonIcinYukle = (dosya: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(dosya);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel yüklenemedi."));
    };
    img.src = url;
  });

const canvasBlobOlustur = (canvas: HTMLCanvasElement, kalite: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Görsel sıkıştırılamadı."));
      },
      "image/jpeg",
      kalite,
    );
  });

const gorseliYuklemeIcinKucult = async (dosya: File) => {
  if (!dosya.type.startsWith("image/")) return dosya;

  const img = await gorseliOptimizasyonIcinYukle(dosya);
  const uzunKenar = Math.max(img.width, img.height);
  const oran = uzunKenar > GORSEL_OPTIMIZE_UZUN_KENAR ? GORSEL_OPTIMIZE_UZUN_KENAR / uzunKenar : 1;
  const yeniGenislik = Math.max(1, Math.round(img.width * oran));
  const yeniYukseklik = Math.max(1, Math.round(img.height * oran));

  const canvas = document.createElement("canvas");
  canvas.width = yeniGenislik;
  canvas.height = yeniYukseklik;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Görsel işleme başlatılamadı.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, yeniGenislik, yeniYukseklik);

  const blob = await canvasBlobOlustur(canvas, GORSEL_OPTIMIZE_KALITE);
  const dosyaAdi = dosya.name.replace(/\.[^.]+$/, "") || "gorsel";
  return new File([blob], `${dosyaAdi}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
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

const donemSatisEtiketiGetir = (donem?: string | null) => {
  const [yilStr, ayStr] = String(donem || "").split("-");
  const yil = Number(yilStr);
  const ay = Number(ayStr);
  if (!Number.isInteger(yil) || !Number.isInteger(ay) || ay < 1 || ay > 12) return "SATIŞ";

  return `${new Date(yil, ay - 1, 1)
    .toLocaleDateString("tr-TR", { month: "long" })
    .toLocaleUpperCase("tr-TR")} SATIŞ`;
};

const donemAraliginiGetir = (donem?: string | null) => {
  const [yilStr, ayStr] = String(donem || "").split("-");
  const yil = Number(yilStr);
  const ay = Number(ayStr);
  if (!Number.isInteger(yil) || !Number.isInteger(ay) || ay < 1 || ay > 12) {
    const varsayilanDonem = getLocalDateString().substring(0, 7);
    return {
      baslangic: `${varsayilanDonem}-01`,
      bitis: `${varsayilanDonem}-32`,
    };
  }

  const sonrakiAy = ay === 12 ? 1 : ay + 1;
  const sonrakiYil = ay === 12 ? yil + 1 : yil;
  return {
    baslangic: `${String(yil).padStart(4, "0")}-${String(ay).padStart(2, "0")}-01`,
    bitis: `${String(sonrakiYil).padStart(4, "0")}-${String(sonrakiAy).padStart(2, "0")}-01`,
  };
};

const donemiTarihtenAyikla = (tarih?: string | null) => {
  const eslesen = String(tarih || "").match(/^\d{4}-\d{2}/);
  return eslesen ? eslesen[0] : "";
};

const yerelJsonOku = <T,>(anahtar: string, varsayilanDeger: T): T => {
  if (typeof window === "undefined") return varsayilanDeger;
  try {
    const hamDeger = window.localStorage.getItem(anahtar);
    if (!hamDeger) return varsayilanDeger;
    return JSON.parse(hamDeger) as T;
  } catch {
    return varsayilanDeger;
  }
};

const yerelJsonYaz = (anahtar: string, deger: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch {
    // Yerel depolama doluysa ya da erişilemezse sessizce devam et.
  }
};

const fisPersonelDevirMi = (fis: Partial<SatisFis>) => {
  const odemeTuru = odemeTurunuNormalizeEt(fis.odeme_turu);
  return odemeTuru === "PERSONEL DEVİR" || odemeTuru === "PERSONEL DEVIR";
};

const fisKasayaDevirMi = (fis: Partial<SatisFis>) => {
  const odemeTuru = odemeTurunuNormalizeEt(fis.odeme_turu);
  return odemeTuru === "KASAYA DEVİR" || odemeTuru === "KASAYA DEVIR";
};

const fisTahsilatMi = (fis: Partial<SatisFis>) =>
  !fisKasayaDevirMi(fis) &&
  !fisDevirMi(fis) &&
  Number(fis.toplam_tutar || 0) === 0 &&
  Number(fis.tahsilat || 0) > 0;

const urunAdiniNormalizeEt = (urunAdi?: string | null) =>
  String(urunAdi || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .trim();

const urunAdiAyniMi = (urunAdi?: string | null, hedef?: string | null) =>
  urunAdiniNormalizeEt(urunAdi) === urunAdiniNormalizeEt(hedef);

const devredenBorcSatiriMi = (urunAdi?: string | null) => urunAdiAyniMi(urunAdi, "Devreden borç");

const urunSistemSabitMi = (urunAdi?: string | null) =>
  urunAdiAyniMi(urunAdi, "3 kg yoğurt") ||
  urunAdiAyniMi(urunAdi, "5 kg yoğurt") ||
  urunAdiAyniMi(urunAdi, "Süt kaymağı");

const urunSutKaymagiMi = (urunAdi?: string | null) => urunAdiAyniMi(urunAdi, "Süt kaymağı");

const HAMMADDE_BORC_TURLERI = ["Krema Borcu", "Kova Borcu", "Katkı Borcu", "Süt Tozu Borcu"] as const;

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

const satisFisSaatiniFormatla = (deger?: string | null) => {
  if (!deger) return "";
  const tarih = new Date(deger);
  if (Number.isNaN(tarih.getTime())) return "";
  return tarih.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

const satisFisSiralamaZamaniBul = (fis?: {
  id?: string | number | null;
  fis_no?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}) => {
  const zamanAdaylari = [fis?.updated_at, fis?.created_at];
  for (const zamanAdayi of zamanAdaylari) {
    const zamanDamgasi = Date.parse(String(zamanAdayi || ""));
    if (!Number.isNaN(zamanDamgasi)) return zamanDamgasi;
  }

  const idDegeri = Number(fis?.id);
  if (Number.isFinite(idDegeri) && idDegeri > 0) {
    return idDegeri;
  }

  const fisNoDegeri = Number(String(fis?.fis_no || "").replace(/\D/g, ""));
  if (Number.isFinite(fisNoDegeri) && fisNoDegeri > 0) {
    return fisNoDegeri;
  }

  return 0;
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

const byteBoyutunuFormatla = (bytes?: number | null) => {
  const deger = Number(bytes || 0);
  if (!Number.isFinite(deger) || deger <= 0) return "";
  if (deger < 1024) return `${deger} B`;
  if (deger < 1024 * 1024) return `${Math.round(deger / 1024)} KB`;
  return `${(deger / (1024 * 1024)).toFixed(2)} MB`;
};

const hataMetniniGetir = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Bilinmeyen hata";
};

const dinamikModulHatasiMi = (error: unknown) => {
  const mesaj = hataMetniniGetir(error);
  return /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    mesaj,
  );
};

const yenilemeOnerisiMesaji = (islemAdi: string) =>
  `${islemAdi} için gereken dosyalar yüklenemedi. Uygulama yeni sürüme geçmiş olabilir. Sayfa şimdi yenilensin mi?`;

type LazySekmeHataSiniriProps = {
  children: ReactNode;
  resetKey: string;
};

type LazySekmeHataSiniriState = {
  error: unknown | null;
};

class LazySekmeHataSiniri extends Component<LazySekmeHataSiniriProps, LazySekmeHataSiniriState> {
  state: LazySekmeHataSiniriState = { error: null };

  static getDerivedStateFromError(error: unknown): LazySekmeHataSiniriState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Lazy sekme yüklenemedi:", error, info);
    logClientError("lazy.tab.boundary", error, {
      componentStack: info.componentStack || "",
    });
  }

  componentDidUpdate(prevProps: LazySekmeHataSiniriProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const deployHatasi = dinamikModulHatasiMi(this.state.error);
    return (
      <div
        className="card"
        style={{
          marginTop: "6px",
          display: "grid",
          gap: "10px",
          textAlign: "center",
          borderColor: deployHatasi ? "#fdba74" : "#fecaca",
          background: deployHatasi ? "#fff7ed" : "#fef2f2",
          color: deployHatasi ? "#9a3412" : "#991b1b",
        }}
      >
        <div style={{ fontWeight: "bold", fontSize: "14px" }}>Sekme açılamadı</div>
        <div style={{ fontSize: "12px", lineHeight: 1.5 }}>
          {deployHatasi
            ? "Bu sekme yeni sürüm sonrası eski dosyayı istiyor olabilir."
            : hataMetniniGetir(this.state.error)}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: deployHatasi ? "#ea580c" : "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "10px 12px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Sayfayı Yenile
        </button>
      </div>
    );
  }
}

const onYuklenebilirSekmeOlustur = (
  yukleyici: () => Promise<{ default: any }>,
) => {
  let yuklenenModul: { default: any } | null = null;
  let yuklemeSozu: Promise<{ default: any }> | null = null;

  const yukle = () => {
    if (yuklenenModul) return Promise.resolve(yuklenenModul);
    if (!yuklemeSozu) {
      yuklemeSozu = yukleyici()
        .then((modul) => {
          yuklenenModul = modul;
          return modul;
        })
        .catch((error) => {
          yuklemeSozu = null;
          throw error;
        });
    }
    return yuklemeSozu;
  };

  return {
    LazyBilesen: lazy(yukle),
    yukle,
    hazirBilesen: () => yuklenenModul?.default ?? null,
  };
};

const ozetPanelSekmesi = onYuklenebilirSekmeOlustur(() =>
  import("./components/OzetPanel").then((module) => ({ default: module.OzetPanel })),
);
const satisPanelSekmesi = {
  yukle: () => Promise.resolve({ default: SatisPanel }),
  hazirBilesen: () => SatisPanel,
};
const sutPanelSekmesi = onYuklenebilirSekmeOlustur(() =>
  import("./components/SutPanel").then((module) => ({ default: module.SutPanel })),
);
const sevkiyatPanelSekmesi = onYuklenebilirSekmeOlustur(() =>
  import("./components/SevkiyatPanel").then((module) => ({ default: module.SevkiyatPanel })),
);
const cekSenetPanelSekmesi = onYuklenebilirSekmeOlustur(() =>
  import("./components/CekSenetPanel").then((module) => ({ default: module.CekSenetPanel })),
);
const giderPanelSekmesi = onYuklenebilirSekmeOlustur(() =>
  import("./components/GiderPanel").then((module) => ({ default: module.GiderPanel })),
);
const uretimPanelSekmesi = onYuklenebilirSekmeOlustur(() =>
  import("./components/UretimPanel").then((module) => ({ default: module.UretimPanel })),
);
const analizPanelSekmesi = onYuklenebilirSekmeOlustur(() =>
  import("./components/AnalizPanel").then((module) => ({ default: module.AnalizPanel })),
);
const settingsPanelSekmesi = onYuklenebilirSekmeOlustur(() =>
  import("./components/SettingsPanel").then((module) => ({ default: module.SettingsPanel })),
);
const sekmeModulYukleyicileri: Record<AppTabId, () => Promise<unknown>> = {
  ozet: ozetPanelSekmesi.yukle,
  satis: satisPanelSekmesi.yukle,
  sut: sutPanelSekmesi.yukle,
  sevkiyat: sevkiyatPanelSekmesi.yukle,
  cek_senet: cekSenetPanelSekmesi.yukle,
  gider: giderPanelSekmesi.yukle,
  uretim: uretimPanelSekmesi.yukle,
  analiz: analizPanelSekmesi.yukle,
  ayarlar: settingsPanelSekmesi.yukle,
};
const sekmeModulunuGetir = (tabId: AppTabId) => sekmeModulYukleyicileri[tabId]();
const sekmeModulunuOnYukle = (tabId: AppTabId) => {
  void sekmeModulunuGetir(tabId).catch((error) => {
    console.warn(`${tabId} sekmesi arka planda hazırlanamadı:`, error);
  });
};
const sekmeBileseniniRenderEt = (hazirBilesen: any, lazyBilesen: any, props: any) => {
  const Bilesen = hazirBilesen || lazyBilesen;
  return <Bilesen {...props} />;
};
const OzetPanel = ozetPanelSekmesi.LazyBilesen;
const SutPanel = sutPanelSekmesi.LazyBilesen;
const SevkiyatPanel = sevkiyatPanelSekmesi.LazyBilesen;
const CekSenetPanel = cekSenetPanelSekmesi.LazyBilesen;
const GiderPanel = giderPanelSekmesi.LazyBilesen;
const UretimPanel = uretimPanelSekmesi.LazyBilesen;
const AnalizPanel = analizPanelSekmesi.LazyBilesen;
const SettingsPanel = settingsPanelSekmesi.LazyBilesen;
const yedeklemeModulunuGetir = () => import("./lib/backup");
const sekmeYukleniyorFallback = (
  <div className="card" style={{ marginTop: "6px", textAlign: "center", color: "#64748b", fontWeight: "bold" }}>
    Sekme yükleniyor...
  </div>
);
type AppDialogTone = "primary" | "warning" | "danger";
type AppAlertOptions = {
  title?: string;
  message: string;
  buttonText?: string;
  tone?: AppDialogTone;
};

let uygulamaIciConfirmKoprusu: ((options: AppConfirmOptions) => Promise<boolean>) | null = null;
let uygulamaIciAlertKoprusu: ((options: AppAlertOptions) => void) | null = null;

const uygulamaIciConfirmGoster = (options: AppConfirmOptions) => (
  uygulamaIciConfirmKoprusu
    ? uygulamaIciConfirmKoprusu(options)
    : Promise.resolve(window.confirm(options.message))
);

const uygulamaIciAlertGoster = (message: string, options?: Omit<AppAlertOptions, "message">) => {
  if (uygulamaIciAlertKoprusu) {
    uygulamaIciAlertKoprusu({
      title: options?.title,
      message,
      buttonText: options?.buttonText,
      tone: options?.tone,
    });
    return;
  }
  window.alert(message);
};

const yedeklemeHatasiniGoster = (islemAdi: string, error: unknown) => {
  console.error(`${islemAdi} hazırlanamadı:`, error);
  if (dinamikModulHatasiMi(error)) {
    void uygulamaIciConfirmGoster({
      title: "Sayfa Yenilensin mi?",
      message: yenilemeOnerisiMesaji(islemAdi),
      confirmText: "Evet, Yenile",
      cancelText: "İptal",
      tone: "warning",
    }).then((yenile) => {
      if (yenile) window.location.reload();
    });
    return;
  }
  uygulamaIciAlertGoster(`${islemAdi} hazırlanamadı.\n${hataMetniniGetir(error)}`, {
    title: "İşlem Hatası",
    tone: "danger",
  });
};
const sekmeYuklemeHatasiniGoster = (tabId: AppTabId, error: unknown) => {
  const sekmeEtiketi = TAB_TANIMLARI.find((tab) => tab.id === tabId)?.etiket || "Sekme";
  console.error(`${sekmeEtiketi} sekmesi hazırlanamadı:`, error);
  if (dinamikModulHatasiMi(error)) {
    void uygulamaIciConfirmGoster({
      title: "Sayfa Yenilensin mi?",
      message: yenilemeOnerisiMesaji(`${sekmeEtiketi} sekmesi`),
      confirmText: "Evet, Yenile",
      cancelText: "İptal",
      tone: "warning",
    }).then((yenile) => {
      if (yenile) window.location.reload();
    });
    return;
  }
  uygulamaIciAlertGoster(`${sekmeEtiketi} sekmesi açılamadı.\n${hataMetniniGetir(error)}`, {
    title: "Sekme Hatası",
    tone: "danger",
  });
};

type StartupTabloOlcumu = {
  table: string;
  target: string;
  durationMs: number;
  rowCount: number;
  status: "success" | "error";
  errorMessage?: string;
};

const performansSimdi = () =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

const sureyiYuvarla = (baslangicMs?: number | null, bitisMs = performansSimdi()) =>
  baslangicMs == null ? 0 : Math.max(0, Math.round(bitisMs - baslangicMs));

const startupDenemeIdOlustur = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const LOG_RETENTION_CLIENT_DAYS = 14;
const LOG_RETENTION_PERFORMANCE_DAYS = 14;
const LOG_RETENTION_ERROR_DAYS = 60;
const LOG_RETENTION_LAST_RUN_KEY = "app-log-retention-last-run";
const LOG_RETENTION_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;

const startupLogDiziyeCevir = (deger: unknown) => (Array.isArray(deger) ? deger : []);

const startupLogKaydiniNormalizeEt = (deger: unknown) =>
  deger && typeof deger === "object" && !Array.isArray(deger) ? deger as Record<string, unknown> : {};

const startupLogOzetiniNormalizeEt = (deger: unknown): StartupLogDiagnostics => {
  const kayit = startupLogKaydiniNormalizeEt(deger);

  return {
    generatedAt: String(kayit.generatedAt || new Date().toISOString()),
    since: String(kayit.since || new Date().toISOString()),
    sessionCount: sayiDegeri(kayit.sessionCount),
    userCount: sayiDegeri(kayit.userCount),
    avgMs: sayiDegeri(kayit.avgMs),
    p50Ms: sayiDegeri(kayit.p50Ms),
    p95Ms: sayiDegeri(kayit.p95Ms),
    maxMs: sayiDegeri(kayit.maxMs),
    avgFetchMs: sayiDegeri(kayit.avgFetchMs),
    p50FetchMs: sayiDegeri(kayit.p50FetchMs),
    p95FetchMs: sayiDegeri(kayit.p95FetchMs),
    maxFetchMs: sayiDegeri(kayit.maxFetchMs),
    avgRenderMs: sayiDegeri(kayit.avgRenderMs),
    p50RenderMs: sayiDegeri(kayit.p50RenderMs),
    maxRenderMs: sayiDegeri(kayit.maxRenderMs),
    slow5sCount: sayiDegeri(kayit.slow5sCount),
    slow10sCount: sayiDegeri(kayit.slow10sCount),
    daily: startupLogDiziyeCevir(kayit.daily).map((item) => {
      const satir = startupLogKaydiniNormalizeEt(item);
      return {
        gun: String(satir.gun || ""),
        sessionCount: sayiDegeri(satir.sessionCount),
        userCount: sayiDegeri(satir.userCount),
        avgMs: sayiDegeri(satir.avgMs),
        p50Ms: sayiDegeri(satir.p50Ms),
        p95Ms: sayiDegeri(satir.p95Ms),
        maxMs: sayiDegeri(satir.maxMs),
        slow5sCount: sayiDegeri(satir.slow5sCount),
      };
    }),
    fetchPatterns: startupLogDiziyeCevir(kayit.fetchPatterns).map((item) => {
      const satir = startupLogKaydiniNormalizeEt(item);
      return {
        fetchTableCount: sayiDegeri(satir.fetchTableCount),
        fetchAllCount: sayiDegeri(satir.fetchAllCount),
        firstInteractiveCount: sayiDegeri(satir.firstInteractiveCount),
        sessionCount: sayiDegeri(satir.sessionCount),
      };
    }),
    tableMetrics: startupLogDiziyeCevir(kayit.tableMetrics).map((item) => {
      const satir = startupLogKaydiniNormalizeEt(item);
      return {
        table: String(satir.table || ""),
        sampleCount: sayiDegeri(satir.sampleCount),
        avgMs: sayiDegeri(satir.avgMs),
        p50Ms: sayiDegeri(satir.p50Ms),
        p95Ms: sayiDegeri(satir.p95Ms),
        maxMs: sayiDegeri(satir.maxMs),
        avgRowCount: sayiDegeri(satir.avgRowCount),
        maxRowCount: sayiDegeri(satir.maxRowCount),
      };
    }),
    recentSessions: startupLogDiziyeCevir(kayit.recentSessions).map((item) => {
      const satir = startupLogKaydiniNormalizeEt(item);
      const authMs = satir.authMs;
      return {
        createdAt: String(satir.createdAt || ""),
        userEmail: String(satir.userEmail || ""),
        sessionId: String(satir.sessionId || ""),
        activeTab: String(satir.activeTab || ""),
        aktifDonem: String(satir.aktifDonem || ""),
        durationMs: sayiDegeri(satir.durationMs),
        fetchMs: sayiDegeri(satir.fetchMs),
        renderMs: sayiDegeri(satir.renderMs),
        authMs: authMs == null || authMs === "" ? null : sayiDegeri(authMs),
      };
    }),
    appPerformanceMetrics: startupLogDiziyeCevir(kayit.appPerformanceMetrics).map((item) => {
      const satir = startupLogKaydiniNormalizeEt(item);
      return {
        olay: String(satir.olay || ""),
        kategori: String(satir.kategori || ""),
        sonuc: String(satir.sonuc || ""),
        sampleCount: sayiDegeri(satir.sampleCount),
        avgMs: sayiDegeri(satir.avgMs),
        p50Ms: sayiDegeri(satir.p50Ms),
        p95Ms: sayiDegeri(satir.p95Ms),
        maxMs: sayiDegeri(satir.maxMs),
        avgKayitMs: sayiDegeri(satir.avgKayitMs),
        avgYenilemeMs: sayiDegeri(satir.avgYenilemeMs),
        avgImageMs: sayiDegeri(satir.avgImageMs),
        avgDetaySayisi: sayiDegeri(satir.avgDetaySayisi),
      };
    }),
    appPerformanceRecent: startupLogDiziyeCevir(kayit.appPerformanceRecent).map((item) => {
      const satir = startupLogKaydiniNormalizeEt(item);
      return {
        createdAt: String(satir.createdAt || ""),
        userEmail: String(satir.userEmail || ""),
        olay: String(satir.olay || ""),
        kategori: String(satir.kategori || ""),
        sonuc: String(satir.sonuc || ""),
        toplamMs: sayiDegeri(satir.toplamMs),
        kayitMs: sayiDegeri(satir.kayitMs),
        yenilemeMs: sayiDegeri(satir.yenilemeMs),
        gorselYuklemeMs: sayiDegeri(satir.gorselYuklemeMs),
        detaySayisi: sayiDegeri(satir.detaySayisi),
        hataMesaji: String(satir.hataMesaji || ""),
      };
    }),
    appPerformanceCount: sayiDegeri(kayit.appPerformanceCount),
    appErrorMetrics: startupLogDiziyeCevir(kayit.appErrorMetrics).map((item) => {
      const satir = startupLogKaydiniNormalizeEt(item);
      return {
        islem: String(satir.islem || ""),
        kategori: String(satir.kategori || ""),
        seviye: String(satir.seviye || ""),
        count: sayiDegeri(satir.count),
        latestAt: String(satir.latestAt || ""),
      };
    }),
    appErrorRecent: startupLogDiziyeCevir(kayit.appErrorRecent).map((item) => {
      const satir = startupLogKaydiniNormalizeEt(item);
      return {
        createdAt: String(satir.createdAt || ""),
        userEmail: String(satir.userEmail || ""),
        islem: String(satir.islem || ""),
        kategori: String(satir.kategori || ""),
        seviye: String(satir.seviye || ""),
        mesaj: String(satir.mesaj || ""),
        kayitRef: String(satir.kayitRef || ""),
      };
    }),
    appErrorCount: sayiDegeri(kayit.appErrorCount),
  };
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [activeTab, setActiveTab] = useState<AppTabId>("satis");
  const [isBottomMenuOpen, setIsBottomMenuOpen] = useState(false);
  const sekmeGecisIstegiRef = useRef(0);
  const oturumAcilisSekmesiRef = useRef<string | null>(null);
  const bottomMenuRef = useRef<HTMLElement | null>(null);
  const startupTelemetriRef = useRef({
    denemeId: startupDenemeIdOlustur(),
    uygulamaBaslangicMs: performansSimdi(),
    oturumBazMs: null as number | null,
    authBaslangicMs: null as number | null,
    authCozumMs: null as number | null,
    authAcilistaBulundu: false,
    authLoglandi: false,
    authDurationMs: null as number | null,
    ilkFetchBaslangicMs: null as number | null,
    ilkFetchBitisMs: null as number | null,
    fetchDurationMs: null as number | null,
    fetchLoglandi: false,
    ilkEtkilesimLoglandi: false,
    tabloOlcumleri: [] as StartupTabloOlcumu[],
  });
  const acilisVerisiYuklenenKullaniciRef = useRef<string | null>(null);
  const acilisVerisiYukleniyorKullaniciRef = useRef<string | null>(null);
  const ertelenenVeriYuklemeRef = useRef({
    ciftliklerYuklenenKullanici: null as string | null,
    ciftliklerYukleniyorKullanici: null as string | null,
    giderYuklenenKullanici: null as string | null,
    giderYukleniyorKullanici: null as string | null,
    sutYuklenenKullanici: null as string | null,
    sutYukleniyorKullanici: null as string | null,
    uretimYuklenenKullanici: null as string | null,
    uretimYukleniyorKullanici: null as string | null,
    giderTurleriYuklenenKullanici: null as string | null,
    giderTurleriYukleniyorKullanici: null as string | null,
    profillerYuklenenKullanici: null as string | null,
    profillerYukleniyorKullanici: null as string | null,
    copYuklenenKullanici: null as string | null,
    copYukleniyorKullanici: null as string | null,
  });
  const logRetentionCalisiyorRef = useRef(false);
  const [startupVeriHazir, setStartupVeriHazir] = useState(false);

  // DÖNEM YÖNETİMİ (Kalıcı)
  const [aktifDonem, setAktifDonem] = useState<string>(() => getLocalDateString().substring(0, 7));
  const [donemSecenekleri, setDonemSecenekleri] = useState<string[]>(() => [getLocalDateString().substring(0, 7)]);
  const [donemSecenekleriHazir, setDonemSecenekleriHazir] = useState(false);
  const [isDonemModalOpen, setIsDonemModalOpen] = useState(false);
  const [donemOnay, setDonemOnay] = useState(false);

  // VERİ LİSTELERİ
  const [tedarikciler, setTedarikciler] = useState<Ciftlik[]>([]);
  const [bayiler, setBayiler] = useState<Bayi[]>(() => yerelJsonOku<Bayi[]>(BAYILER_CACHE_KEY, []));
  const [urunler, setUrunler] = useState<Urun[]>(() => yerelJsonOku<Urun[]>(URUNLER_CACHE_KEY, []));
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
  const [tabYetkileri, setTabYetkileri] = useState<KullaniciSekmeYetkisi[]>([]);
  const [yetkiKaynak, setYetkiKaynak] = useState<"supabase" | "local">("local");
  const [yetkiUyari, setYetkiUyari] = useState("");
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [restoringTrashId, setRestoringTrashId] = useState<string | null>(null);
  const [deletingTrashId, setDeletingTrashId] = useState<string | null>(null);
  const [depolamaDurumu, setDepolamaDurumu] = useState<DepolamaDurumu | null>(null);
  const [isDepolamaLoading, setIsDepolamaLoading] = useState(false);
  const [depolamaHata, setDepolamaHata] = useState("");
  const [startupDiagnostics, setStartupDiagnostics] = useState<StartupLogDiagnostics | null>(null);
  const [isStartupDiagnosticsLoading, setIsStartupDiagnosticsLoading] = useState(false);
  const [startupDiagnosticsError, setStartupDiagnosticsError] = useState("");
  const [veriYuklemeHata, setVeriYuklemeHata] = useState("");
  const [authHata, setAuthHata] = useState("");
  const [adminKullanicilar, setAdminKullanicilar] = useState<AdminKullanici[]>([]);
  const [isAdminKullaniciLoading, setIsAdminKullaniciLoading] = useState(false);
  const [adminKullaniciHata, setAdminKullaniciHata] = useState("");
  
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
  const [yeniUrunSabitle, setYeniUrunSabitle] = useState(false);

  const bugun = getLocalDateString();
  const dun = gunOfsetliTarih(-1);
  const aktifDonemTarihi = (donem = aktifDonem) => (bugun.startsWith(donem) ? bugun : `${donem}-01`);

  // --- SATIŞ STATE'LERİ ---
  const [satisFiltreKisi, setSatisFiltreKisi] = useState<"benim" | "herkes">("benim");
  const [satisFiltreTip, setSatisFiltreTip] = useState<"tumu" | "satis" | "tahsilat" | "kasa_devir">("tumu");
  
  const [isFisModalOpen, setIsFisModalOpen] = useState<boolean>(false);
  const [isTahsilatModalOpen, setIsTahsilatModalOpen] = useState<boolean>(false);
  const [editingTahsilatId, setEditingTahsilatId] = useState<number | null>(null);
  const [tahsilatForm, setTahsilatForm] = useState({ tarih: aktifDonemTarihi(), bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" });
  
  const [editingFisId, setEditingFisId] = useState<string | null>(null);
  const [editingFisNo, setEditingFisNo] = useState<string | null>(null);
  const [fisUst, setFisUst] = useState({ tarih: aktifDonemTarihi(), bayi: "", aciklama: "", odeme_turu: "PEŞİN", tahsilat: "", bos_kova: "", teslim_alan: "" });
  const [fisDetay, setFisDetay] = useState<FisDetayMap>({});
  const [fisGorselDosya, setFisGorselDosya] = useState<File | null>(null);
  const [fisGorselMevcutYol, setFisGorselMevcutYol] = useState("");
  const [fisGorselOnizleme, setFisGorselOnizleme] = useState<{ url: string; baslik: string; boyut?: string; indirmeAdi?: string } | null>(null);
  const [gosterilenEkler, setGosterilenEkler] = useState({ tereyagi: false, yogurt_kaymagi: false, iade: false, bos_kova: false, urunler: [] as string[] });
  const [isDigerUrunMenuOpen, setIsDigerUrunMenuOpen] = useState(false);
  const digerUrunMenuRef = useRef<HTMLDivElement | null>(null);
  const fisGorselKameraInputRef = useRef<HTMLInputElement | null>(null);
  const fisGorselGaleriInputRef = useRef<HTMLInputElement | null>(null);
  const html2canvasYuklemeRef = useRef<Promise<any> | null>(null);
  const confirmCozumRef = useRef<((value: boolean) => void) | null>(null);
  const [sonFisData, setSonFisData] = useState<any>(null);
  const [confirmDialog, setConfirmDialog] = useState<(AppConfirmOptions & { confirmText: string; cancelText: string; tone: AppDialogTone }) | null>(null);
  const [alertDialog, setAlertDialog] = useState<(AppAlertOptions & { buttonText: string; tone: AppDialogTone }) | null>(null);
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
  const [ozetBorcSort, setOzetBorcSort] = useState<SortConfig>({ key: "borc", direction: "desc" });

  // --- GİDER STATE'LERİ ---
  const giderTurleri = useMemo(() => {
    const veritabaniTurleri = giderTuruListesi
      .map((item) => item.isim)
      .filter(Boolean);
    const temelTurler = veritabaniTurleri.length > 0 ? veritabaniTurleri : [...GIDER_TURLERI];
    return Array.from(new Set([...temelTurler, ...HAMMADDE_BORC_TURLERI]));
  }, [giderTuruListesi]);
  const [ozetMiniDetay, setOzetMiniDetay] = useState<null | {
    baslik: string;
    renk: string;
    satirlar: Array<{ etiket: string; deger: string; vurgu?: boolean }>;
  }>(null);

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
  const kayitAktifMi = <T extends { aktif?: boolean | null }>(item: T) => item.aktif !== false;
  const aktifBayiler = useMemo(() => bayiler.filter(kayitAktifMi), [bayiler]);
  const aktifUrunler = useMemo(() => urunler.filter(kayitAktifMi), [urunler]);
  const tumBayiler = useMemo(() => [...bayiler], [bayiler]);
  const bayiMap = useMemo(() => new Map(bayiler.map((item) => [item.id, item.isim])), [bayiler]);
  const bayiKayitMap = useMemo(() => new Map(bayiler.map((item) => [item.id, item])), [bayiler]);
  const hesapGrubuEtiketMap = useMemo(() => {
    const map = new Map<string, string>();
    bayiler.forEach((item) => {
      const grup = String(item.hesap_grubu || "").trim();
      if (!grup) return;
      map.set(masterKayitIsminiNormalizeEt(grup), grup);
    });
    return map;
  }, [bayiler, masterKayitIsminiNormalizeEt]);
  const urunMap = useMemo(() => new Map(urunler.map((item) => [item.id, item.isim])), [urunler]);

  const satisFisBayiAdiGetir = useCallback(
    (fis?: Partial<SatisFis> | null) => (fis?.bayi_id ? bayiMap.get(fis.bayi_id) : undefined) || fis?.bayi || "",
    [bayiMap],
  );
  const satisSatiriUrunAdiGetir = useCallback(
    (satir?: Partial<SatisGiris> | null) => (satir?.urun_id ? urunMap.get(satir.urun_id) : undefined) || satir?.urun || "",
    [urunMap],
  );
  const bayiKaydiniBul = useCallback(
    (bayiId?: string | null, bayiAdi?: string | null) => {
      if (bayiId && bayiKayitMap.has(bayiId)) {
        return bayiKayitMap.get(bayiId) || null;
      }
      const normalizeEdilenBayiAdi = masterKayitIsminiNormalizeEt(bayiAdi);
      if (!normalizeEdilenBayiAdi) return null;
      return bayiler.find((item) => masterKayitIsminiNormalizeEt(item.isim) === normalizeEdilenBayiAdi) || null;
    },
    [bayiKayitMap, bayiler, masterKayitIsminiNormalizeEt],
  );
  const bayiHesapEtiketiGetir = useCallback(
    (bayiId?: string | null, bayiAdi?: string | null) => {
      const bayiKaydi = bayiKaydiniBul(bayiId, bayiAdi);
      const grupEtiketi = String(bayiKaydi?.hesap_grubu || "").trim();
      if (grupEtiketi) return grupEtiketi;

      const gosterimAdi = bayiKaydi?.isim || String(bayiAdi || "").trim();
      const normalizeEdilenGosterimAdi = masterKayitIsminiNormalizeEt(gosterimAdi);
      if (normalizeEdilenGosterimAdi && hesapGrubuEtiketMap.has(normalizeEdilenGosterimAdi)) {
        return hesapGrubuEtiketMap.get(normalizeEdilenGosterimAdi) || gosterimAdi;
      }
      return gosterimAdi;
    },
    [bayiKaydiniBul, hesapGrubuEtiketMap, masterKayitIsminiNormalizeEt],
  );
  const hesapAnahtariOlustur = useCallback(
    (hesapEtiketi?: string | null) => `hesap:${masterKayitIsminiNormalizeEt(hesapEtiketi)}`,
    [masterKayitIsminiNormalizeEt],
  );
  const satisFisHesapEtiketiGetir = useCallback(
    (fis?: Partial<SatisFis> | null) => bayiHesapEtiketiGetir(fis?.bayi_id, satisFisBayiAdiGetir(fis)),
    [bayiHesapEtiketiGetir, satisFisBayiAdiGetir],
  );
  const satisFisHesapAnahtariGetir = useCallback(
    (fis?: Partial<SatisFis> | null) => hesapAnahtariOlustur(satisFisHesapEtiketiGetir(fis)),
    [hesapAnahtariOlustur, satisFisHesapEtiketiGetir],
  );
  const satisSatiriHesapAnahtariGetir = useCallback(
    (satir?: Partial<SatisGiris> | null) => hesapAnahtariOlustur(bayiHesapEtiketiGetir(satir?.bayi_id, satir?.bayi)),
    [bayiHesapEtiketiGetir, hesapAnahtariOlustur],
  );
  const satisSatiriBayiAnahtariGetir = useCallback(
    (satir?: Partial<SatisGiris> | null) => (satir?.bayi_id ? `id:${satir.bayi_id}` : `isim:${masterKayitIsminiNormalizeEt(satir?.bayi)}`),
    [masterKayitIsminiNormalizeEt],
  );
  const satisSatiriUrunAnahtariGetir = useCallback(
    (satir?: Partial<SatisGiris> | null) => (satir?.urun_id ? `id:${satir.urun_id}` : `isim:${masterKayitIsminiNormalizeEt(satir?.urun)}`),
    [masterKayitIsminiNormalizeEt],
  );

  const hesaplaMusteriBakiyeleri = useCallback((kayitlar: Array<Partial<SatisFis>>, sonDonem?: string) => {
    const bakiyeler: Record<string, number> = {};
    const labels: Record<string, string> = {};
    const map: Record<string, number> = {};

    satisFisleriniSirala(kayitlar).forEach((fis) => {
      const donem = String(fis.tarih || "").substring(0, 7);
      if (sonDonem && donem > sonDonem) return;

      const bayiAdi = satisFisBayiAdiGetir(fis);
      const hesapEtiketi = satisFisHesapEtiketiGetir(fis);
      const hesapAnahtari = satisFisHesapAnahtariGetir(fis);
      if (!bayiAdi || bayiAdi === "SİSTEM İŞLEMİ" || !hesapEtiketi) return;

      labels[hesapAnahtari] = hesapEtiketi;
      if (fisDonemDevirMi(fis)) {
        bakiyeler[hesapAnahtari] = Number(fis.kalan_bakiye || 0);
      } else {
        bakiyeler[hesapAnahtari] = (bakiyeler[hesapAnahtari] || 0) + Number(fis.kalan_bakiye || 0);
      }

      if (fis.id) {
        map[String(fis.id)] = bakiyeler[hesapAnahtari];
      }
    });

    return { bakiyeler, labels, map };
  }, [satisFisBayiAdiGetir, satisFisHesapAnahtariGetir, satisFisHesapEtiketiGetir]);

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

  const handleIdleLogout = useEffectEvent(() => {
    void cikisYap("10 dakika işlem yapılmadığı için güvenlik amacıyla oturum kapatıldı.");
  });

  const confirmDialogKapat = useCallback((sonuc: boolean) => {
    const coz = confirmCozumRef.current;
    confirmCozumRef.current = null;
    setConfirmDialog(null);
    coz?.(sonuc);
  }, []);

  const alertDialogKapat = useCallback(() => {
    setAlertDialog(null);
  }, []);

  const confirmDialogAc = useCallback((options: AppConfirmOptions) => new Promise<boolean>((resolve) => {
    confirmCozumRef.current = resolve;
    setConfirmDialog({
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || "Tamam",
      cancelText: options.cancelText || "İptal",
      tone: options.tone || "warning",
    });
  }), []);

  const alertDialogAc = useCallback((options: AppAlertOptions) => {
    setAlertDialog({
      title: options.title,
      message: options.message,
      buttonText: options.buttonText || "Tamam",
      tone: options.tone || "warning",
    });
  }, []);

  useEffect(() => () => {
    if (confirmCozumRef.current) {
      confirmCozumRef.current(false);
      confirmCozumRef.current = null;
    }
  }, []);

  useEffect(() => {
    uygulamaIciConfirmKoprusu = confirmDialogAc;
    uygulamaIciAlertKoprusu = alertDialogAc;

    const oncekiAlert = window.alert.bind(window);
    window.alert = (message?: unknown) => {
      alertDialogAc({
        message: String(message ?? ""),
        tone: "warning",
      });
    };

    return () => {
      if (uygulamaIciConfirmKoprusu === confirmDialogAc) {
        uygulamaIciConfirmKoprusu = null;
      }
      if (uygulamaIciAlertKoprusu === alertDialogAc) {
        uygulamaIciAlertKoprusu = null;
      }
      window.alert = oncekiAlert;
    };
  }, [alertDialogAc, confirmDialogAc]);

  const html2canvasYukle = useCallback(async () => {
    if (typeof window === "undefined") {
      throw new Error("Tarayıcı ortamı bulunamadı.");
    }

    if (typeof (window as any).html2canvas !== "undefined") {
      return (window as any).html2canvas;
    }

    if (!html2canvasYuklemeRef.current) {
      html2canvasYuklemeRef.current = new Promise((resolve, reject) => {
        const mevcutScript = document.getElementById("html2canvas-script") as HTMLScriptElement | null;
        const script = mevcutScript || document.createElement("script");

        const handleLoad = () => {
          script.dataset.loaded = "true";
          temizle();
          if (typeof (window as any).html2canvas !== "undefined") {
            resolve((window as any).html2canvas);
            return;
          }
          html2canvasYuklemeRef.current = null;
          reject(new Error("html2canvas hazır değil."));
        };

        const handleError = () => {
          temizle();
          html2canvasYuklemeRef.current = null;
          reject(new Error("html2canvas yüklenemedi."));
        };

        const temizle = () => {
          script.removeEventListener("load", handleLoad);
          script.removeEventListener("error", handleError);
        };

        script.addEventListener("load", handleLoad);
        script.addEventListener("error", handleError);

        if (!mevcutScript) {
          script.id = "html2canvas-script";
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          document.head.appendChild(script);
          return;
        }

        if (script.dataset.loaded === "true") {
          handleLoad();
        }
      }).catch((error) => {
        html2canvasYuklemeRef.current = null;
        throw error;
      });
    }

    return html2canvasYuklemeRef.current;
  }, []);

  useEffect(() => {
    if (!sonFisData && !musteriEkstreData) return;
    void html2canvasYukle().catch(() => {});
  }, [html2canvasYukle, musteriEkstreData, sonFisData]);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) setUsername(normalizeUsername(savedUser));
    installClientTelemetry();
    startupTelemetriRef.current.authBaslangicMs = performansSimdi();

    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.setAttribute('name', 'viewport');
      document.head.appendChild(viewportMeta);
    }
    viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0');

    supabase.auth
      .getSession()
      .then(async ({ data: { session: s }, error }: any) => {
        const authCozumMs = performansSimdi();
        startupTelemetriRef.current.authAcilistaBulundu = Boolean(s?.user?.id);
        startupTelemetriRef.current.authCozumMs = s?.user?.id ? authCozumMs : null;
        if (error?.message?.toLowerCase().includes("refresh token")) {
          await yerelOturumuTemizle();
          logClientError("auth.getSession", error, { stage: "refresh-token" });
          setAuthHata("Oturum süresi dolmuş veya bozulmuş. Lütfen tekrar giriş yapın.");
          return;
        }
        setSession(s);
      })
      .catch(async (error: Error) => {
        startupTelemetriRef.current.authAcilistaBulundu = false;
        startupTelemetriRef.current.authCozumMs = null;
        if (error.message?.toLowerCase().includes("refresh token")) {
          await yerelOturumuTemizle();
          logClientError("auth.getSession", error, { stage: "catch" });
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
        logClientError("auth.onAuthStateChange", new Error("TOKEN_REFRESHED session missing"));
        setAuthHata("Oturum yenilenemedi. Lütfen tekrar giriş yapın.");
        return;
      }

      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user?.email) {
      setUsername(normalizeUsername(session.user.email));
      setAuthHata("");
    }
  }, [session?.user?.email]);

  useEffect(() => {
    setDonemSecenekleriHazir(false);
  }, [session?.user?.id]);

  useEffect(() => {
    const kullaniciId = session?.user?.id || null;
    if (!kullaniciId) {
      acilisVerisiYuklenenKullaniciRef.current = null;
      acilisVerisiYukleniyorKullaniciRef.current = null;
      return;
    }
    if (!donemSecenekleriHazir) {
      return;
    }
    if (
      acilisVerisiYuklenenKullaniciRef.current === kullaniciId ||
      acilisVerisiYukleniyorKullaniciRef.current === kullaniciId
    ) {
      return;
    }

    acilisVerisiYukleniyorKullaniciRef.current = kullaniciId;
    void (async () => {
      const basarili = await verileriGetir("acilis");
      if (basarili) {
        acilisVerisiYuklenenKullaniciRef.current = kullaniciId;
      }
    })().finally(() => {
      if (acilisVerisiYukleniyorKullaniciRef.current === kullaniciId) {
        acilisVerisiYukleniyorKullaniciRef.current = null;
      }
    });
  }, [donemSecenekleriHazir, session?.user?.id]);

  useEffect(() => {
    ertelenenVeriYuklemeRef.current = {
      ciftliklerYuklenenKullanici: null,
      ciftliklerYukleniyorKullanici: null,
      giderYuklenenKullanici: null,
      giderYukleniyorKullanici: null,
      sutYuklenenKullanici: null,
      sutYukleniyorKullanici: null,
      uretimYuklenenKullanici: null,
      uretimYukleniyorKullanici: null,
      giderTurleriYuklenenKullanici: null,
      giderTurleriYukleniyorKullanici: null,
      profillerYuklenenKullanici: null,
      profillerYukleniyorKullanici: null,
      copYuklenenKullanici: null,
      copYukleniyorKullanici: null,
    };
  }, [session?.user?.id]);

  useEffect(() => {
    ertelenenVeriYuklemeRef.current.giderYuklenenKullanici = null;
    ertelenenVeriYuklemeRef.current.giderYukleniyorKullanici = null;
    ertelenenVeriYuklemeRef.current.sutYuklenenKullanici = null;
    ertelenenVeriYuklemeRef.current.sutYukleniyorKullanici = null;
    ertelenenVeriYuklemeRef.current.uretimYuklenenKullanici = null;
    ertelenenVeriYuklemeRef.current.uretimYukleniyorKullanici = null;

    if (!session?.user?.id || !acilisVerisiYuklenenKullaniciRef.current) return;

    void verileriGetir("satis");
    void verileriGetir("gider");
    if (activeTab === "ozet" || activeTab === "sut") {
      void verileriGetir("ozet");
    }
    if (activeTab === "uretim") {
      void verileriGetir("uretim");
    }
  }, [aktifDonem, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    kullaniciYetkileriniYukle().then(({ kayitlar, kaynak, uyari }) => {
      setTabYetkileri(kayitlar);
      setYetkiKaynak(kaynak);
      setYetkiUyari(uyari || "");
    });
  }, [session?.user?.id]);

  const mevcutKullanici = normalizeUsername(session?.user?.email || username);
  const aktifKullaniciEposta =
    session?.user?.email || (username.includes("@") ? username : `${username}@sistem.local`);
  const aktifKullaniciKisa = normalizeUsername(aktifKullaniciEposta);
  const isAdmin = adminMi(mevcutKullanici);
  const startupLog = useCallback(
    (source: string, message: string, details: Record<string, unknown> = {}, fingerprintSuffix = "") => {
      const fingerprintParcalari = ["startup", startupTelemetriRef.current.denemeId, source];
      if (fingerprintSuffix) fingerprintParcalari.push(fingerprintSuffix);
      logClientEvent({
        level: "info",
        source,
        message,
        details,
        fingerprint: fingerprintParcalari.join(":"),
        allowWhenDisabled: true,
      });
    },
    [],
  );
  const startupTabloOlcumuKaydet = useCallback(
    (olcum: StartupTabloOlcumu) => {
      startupTelemetriRef.current.tabloOlcumleri.push(olcum);
      startupLog(
        "startup.fetch_table",
        "Startup table loaded",
        {
          table: olcum.table,
          target: olcum.target,
          duration_ms: olcum.durationMs,
          row_count: olcum.rowCount,
          status: olcum.status,
          ...(olcum.errorMessage ? { error_message: olcum.errorMessage } : {}),
        },
        `${olcum.target}:${olcum.table}`,
      );
    },
    [startupLog],
  );
  const donemSecenekleriniYukle = useCallback(async () => {
    const bugunDonemi = getLocalDateString().substring(0, 7);
    if (!session?.user?.id) {
      setDonemSecenekleri([bugunDonemi]);
      setAktifDonem(bugunDonemi);
      setDonemSecenekleriHazir(true);
      return;
    }

    const sorgular = await Promise.allSettled([
      supabase.from("satis_fisleri").select("tarih"),
      supabase.from("giderler").select("tarih"),
      supabase.from("sut_giris").select("tarih"),
      supabase.from("uretim").select("tarih"),
    ]);

    const secenekler = new Set<string>();

    sorgular.forEach((sonuc) => {
      if (sonuc.status !== "fulfilled") {
        console.error("Dönem seçenekleri yüklenemedi:", sonuc.reason);
        return;
      }

      if (sonuc.value.error) {
        console.error("Dönem seçenekleri yüklenemedi:", sonuc.value.error);
        return;
      }

      (sonuc.value.data || []).forEach((kayit) => {
        const donem = donemiTarihtenAyikla(kayit.tarih);
        if (donem) secenekler.add(donem);
      });
    });

    const siraliSecenekler = Array.from(secenekler).sort().reverse();
    const varsayilanDonem = siraliSecenekler[0] || bugunDonemi;
    setDonemSecenekleri(siraliSecenekler.length > 0 ? siraliSecenekler : [bugunDonemi]);
    setAktifDonem(varsayilanDonem);
    setDonemSecenekleriHazir(true);
  }, [session?.user?.id]);

  useEffect(() => {
    void donemSecenekleriniYukle();
  }, [donemSecenekleriniYukle]);

  useEffect(() => {
    yerelJsonYaz(BAYILER_CACHE_KEY, bayiler);
  }, [bayiler]);

  useEffect(() => {
    yerelJsonYaz(URUNLER_CACHE_KEY, urunler);
  }, [urunler]);

  useEffect(() => {
    setClientTelemetryContext({
      userId: session?.user?.id || null,
      userEmail: aktifKullaniciEposta || null,
      username: aktifKullaniciKisa || null,
      activeTab,
      aktifDonem,
      enabled: Boolean(session?.user?.id) && isAdmin,
    });
  }, [activeTab, aktifDonem, aktifKullaniciEposta, aktifKullaniciKisa, isAdmin, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const simdi = performansSimdi();
    if (startupTelemetriRef.current.oturumBazMs == null) {
      startupTelemetriRef.current.oturumBazMs = startupTelemetriRef.current.authCozumMs ?? simdi;
    }

    if (!startupTelemetriRef.current.authAcilistaBulundu || startupTelemetriRef.current.authLoglandi) return;

    const authCozumMs = startupTelemetriRef.current.authCozumMs ?? simdi;
    const durationMs = sureyiYuvarla(
      startupTelemetriRef.current.authBaslangicMs ?? startupTelemetriRef.current.oturumBazMs ?? simdi,
      authCozumMs,
    );
    startupTelemetriRef.current.authLoglandi = true;
    startupTelemetriRef.current.authDurationMs = durationMs;
    startupLog(
      "startup.auth_session",
      "Startup auth session resolved",
      {
        duration_ms: durationMs,
        has_session: true,
        resolved_via: "getSession",
      },
      "auth",
    );
  }, [session?.user?.id, startupLog]);

  useEffect(() => {
    if (!startupVeriHazir || !session?.user?.id || startupTelemetriRef.current.ilkEtkilesimLoglandi) return;

    let frameBir = 0;
    let frameIki = 0;
    frameBir = window.requestAnimationFrame(() => {
      frameIki = window.requestAnimationFrame(() => {
        if (startupTelemetriRef.current.ilkEtkilesimLoglandi) return;

        const simdi = performansSimdi();
        const renderMs = sureyiYuvarla(startupTelemetriRef.current.ilkFetchBitisMs, simdi);
        const bazMs =
          startupTelemetriRef.current.oturumBazMs ??
          startupTelemetriRef.current.ilkFetchBaslangicMs ??
          startupTelemetriRef.current.uygulamaBaslangicMs;
        const ilkEtkilesimMs = sureyiYuvarla(bazMs, simdi);

        startupTelemetriRef.current.ilkEtkilesimLoglandi = true;
        startupLog(
          "startup.initial_compute",
          "Startup render settled",
          {
            duration_ms: renderMs,
            satis_fis_count: satisFisList.length,
            satis_satir_count: satisList.length,
            gider_count: giderList.length,
            sut_count: sutList.length,
            uretim_count: uretimList.length,
            cop_count: copKutusuList.length,
          },
          "initial_compute",
        );
        startupLog(
          "startup.first_interactive",
          "Startup first interactive ready",
          {
            duration_ms: ilkEtkilesimMs,
            auth_ms: startupTelemetriRef.current.authDurationMs,
            fetch_ms: startupTelemetriRef.current.fetchDurationMs,
            post_fetch_render_ms: renderMs,
            active_tab: activeTab,
          },
          "first_interactive",
        );
      });
    });

    return () => {
      window.cancelAnimationFrame(frameBir);
      window.cancelAnimationFrame(frameIki);
    };
  }, [
    activeTab,
    copKutusuList.length,
    giderList.length,
    satisFisList.length,
    satisList.length,
    session?.user?.id,
    startupLog,
    startupVeriHazir,
    sutList.length,
    uretimList.length,
  ]);

  useEffect(() => {
    if (!session?.user?.id || !isAdmin) return;

    logClientEvent({
      level: "info",
      source: "telemetry.ready",
      message: "Client telemetry active",
      details: {
        activeTab,
        aktifDonem,
      },
      fingerprint: `ready:${session.user.id}`,
    });
  }, [activeTab, aktifDonem, isAdmin, session?.user?.id]);

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
  const sekmeleriOnYukle = useCallback((tablar: AppTabId[]) => {
    tablar.forEach((tabId) => {
      sekmeModulunuOnYukle(tabId);
    });
  }, []);

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
    const kullaniciId = session?.user?.id || null;
    if (!kullaniciId || activeTab !== "satis" || !gorunurSekmeler.length) return;

    const giderGorunur = gorunurSekmeler.some((tab) => tab.id === "gider");
    const ozetGorunur = gorunurSekmeler.some((tab) => tab.id === "ozet");

    const giderZamanlayici = window.setTimeout(() => {
      if (giderGorunur) {
        sekmeModulunuOnYukle("gider");
      }
      if (
        ertelenenVeriYuklemeRef.current.giderTurleriYuklenenKullanici !== kullaniciId &&
        ertelenenVeriYuklemeRef.current.giderTurleriYukleniyorKullanici !== kullaniciId
      ) {
        ertelenenVeriYuklemeRef.current.giderTurleriYukleniyorKullanici = kullaniciId;
        void (async () => {
          const basarili = await verileriGetir("gider_turleri");
          if (basarili) {
            ertelenenVeriYuklemeRef.current.giderTurleriYuklenenKullanici = kullaniciId;
          }
        })().finally(() => {
          if (ertelenenVeriYuklemeRef.current.giderTurleriYukleniyorKullanici === kullaniciId) {
            ertelenenVeriYuklemeRef.current.giderTurleriYukleniyorKullanici = null;
          }
        });
      }
    }, 350);

    const ozetZamanlayici = window.setTimeout(() => {
      if (ozetGorunur) {
        sekmeModulunuOnYukle("ozet");
      }
      if (
        ertelenenVeriYuklemeRef.current.sutYuklenenKullanici !== kullaniciId &&
        ertelenenVeriYuklemeRef.current.sutYukleniyorKullanici !== kullaniciId
      ) {
        ertelenenVeriYuklemeRef.current.sutYukleniyorKullanici = kullaniciId;
        void (async () => {
          const basarili = await verileriGetir("ozet");
          if (basarili) {
            ertelenenVeriYuklemeRef.current.sutYuklenenKullanici = kullaniciId;
          }
        })().finally(() => {
          if (ertelenenVeriYuklemeRef.current.sutYukleniyorKullanici === kullaniciId) {
            ertelenenVeriYuklemeRef.current.sutYukleniyorKullanici = null;
          }
        });
      }
    }, 950);

    return () => {
      window.clearTimeout(giderZamanlayici);
      window.clearTimeout(ozetZamanlayici);
    };
  }, [activeTab, gorunurSekmeler, session?.user?.id]);

  useEffect(() => {
    const kullaniciId = session?.user?.id || null;
    if (!kullaniciId) return;

    const yuklemeBaslat = <
      YuklenenKey extends keyof typeof ertelenenVeriYuklemeRef.current,
      YukleniyorKey extends keyof typeof ertelenenVeriYuklemeRef.current,
    >(
      yuklenenKey: YuklenenKey,
      yukleniyorKey: YukleniyorKey,
      hedef: "ciftlikler" | "gider" | "sut" | "ozet" | "uretim" | "gider_turleri" | "profiller" | "cop",
    ) => {
      if (
        ertelenenVeriYuklemeRef.current[yuklenenKey] === kullaniciId ||
        ertelenenVeriYuklemeRef.current[yukleniyorKey] === kullaniciId
      ) {
        return;
      }

      ertelenenVeriYuklemeRef.current[yukleniyorKey] = kullaniciId;
      void (async () => {
        const basarili = await verileriGetir(hedef);
        if (basarili) {
          ertelenenVeriYuklemeRef.current[yuklenenKey] = kullaniciId;
        }
      })().finally(() => {
        if (ertelenenVeriYuklemeRef.current[yukleniyorKey] === kullaniciId) {
          ertelenenVeriYuklemeRef.current[yukleniyorKey] = null;
        }
      });
    };

    if (activeTab === "gider") {
      yuklemeBaslat("giderYuklenenKullanici", "giderYukleniyorKullanici", "gider");
    }

    if (activeTab === "ozet") {
      yuklemeBaslat("sutYuklenenKullanici", "sutYukleniyorKullanici", "ozet");
    }

    if (activeTab === "sut") {
      yuklemeBaslat("sutYuklenenKullanici", "sutYukleniyorKullanici", "sut");
      yuklemeBaslat("ciftliklerYuklenenKullanici", "ciftliklerYukleniyorKullanici", "ciftlikler");
    }

    if (activeTab === "uretim") {
      yuklemeBaslat("uretimYuklenenKullanici", "uretimYukleniyorKullanici", "uretim");
    }

    const giderTurleriGerekli =
      activeTab === "gider" || (activeTab === "ayarlar" && activeAyarTab === "gider_turleri");
    if (giderTurleriGerekli) {
      yuklemeBaslat("giderTurleriYuklenenKullanici", "giderTurleriYukleniyorKullanici", "gider_turleri");
    }

    const profillerGerekli = activeTab === "ayarlar" && activeAyarTab === "yetkiler";
    if (profillerGerekli) {
      yuklemeBaslat("profillerYuklenenKullanici", "profillerYukleniyorKullanici", "profiller");
    }

    const ciftliklerGerekli = activeTab === "ayarlar" && activeAyarTab === "ciftlikler";
    if (ciftliklerGerekli) {
      yuklemeBaslat("ciftliklerYuklenenKullanici", "ciftliklerYukleniyorKullanici", "ciftlikler");
    }

    const copGerekli = activeTab === "ayarlar" && activeAyarTab === "cop_kutusu";
    if (copGerekli) {
      yuklemeBaslat("copYuklenenKullanici", "copYukleniyorKullanici", "cop");
    }
  }, [activeAyarTab, activeTab, session?.user?.id]);

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

  const edgeFunctionBulunamadiMi = (
    hata: { message?: string; name?: string } | null | undefined,
    fonksiyonAdi: string,
    status?: number,
  ) => {
    const mesaj = String(hata?.message || "").toLowerCase();
    return (
      status === 404 ||
      mesaj.includes("404") ||
      mesaj.includes(`function ${fonksiyonAdi.toLowerCase()} not found`) ||
      (mesaj.includes("edge function") && mesaj.includes("not found"))
    );
  };

  const edgeFunctionCevapMesajiniOku = async (response?: Response | null) => {
    if (!response) return "";

    try {
      const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const body = await response.clone().json() as { message?: string; error?: string };
        return String(body?.message || body?.error || "").trim();
      }

      return String(await response.clone().text()).trim();
    } catch {
      return "";
    }
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

  const startupTaniOzetiniGetir = useCallback(async (force = false) => {
    if (!isAdmin) return;
    if (isStartupDiagnosticsLoading) return;
    if (!force && startupDiagnostics) return;

    setIsStartupDiagnosticsLoading(true);
    setStartupDiagnosticsError("");

    const { data, error } = await supabase.rpc("app_get_startup_log_summary", {
      p_days: 2,
      p_recent_limit: 12,
    });

    if (error) {
      const mesaj = String(error?.message || "").toLowerCase();
      const rpcEksik =
        error?.code === "PGRST202" ||
        error?.code === "42883" ||
        (mesaj.includes("public.app_get_startup_log_summary") &&
          (mesaj.includes("schema cache") || mesaj.includes("not find") || mesaj.includes("does not exist")));

      if (rpcEksik) {
        setStartupDiagnosticsError("Performans özeti için yeni SQL migration henüz uygulanmamış görünüyor.");
      } else {
        setStartupDiagnosticsError(`Performans özeti alınamadı: ${error.message || "Bilinmeyen hata"}`);
      }
      setIsStartupDiagnosticsLoading(false);
      return;
    }

    const kayit = Array.isArray(data) ? data[0] : data;
    setStartupDiagnostics(startupLogOzetiniNormalizeEt(kayit));
    setIsStartupDiagnosticsLoading(false);
  }, [isAdmin, isStartupDiagnosticsLoading, startupDiagnostics]);

  useEffect(() => {
    if (isAdmin) return;
    setStartupDiagnostics(null);
    setStartupDiagnosticsError("");
    setIsStartupDiagnosticsLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!session?.user?.id) {
      logRetentionCalisiyorRef.current = false;
      return;
    }

    const sonCalisma = Number(window.localStorage.getItem(LOG_RETENTION_LAST_RUN_KEY) || 0);
    if (sonCalisma && Date.now() - sonCalisma < LOG_RETENTION_MIN_INTERVAL_MS) {
      return;
    }

    if (logRetentionCalisiyorRef.current) return;

    let iptal = false;
    const zamanlayici = window.setTimeout(() => {
      if (iptal || logRetentionCalisiyorRef.current) return;

      logRetentionCalisiyorRef.current = true;

      void (async () => {
        try {
          const { error } = await supabase.rpc("app_apply_log_retention", {
            p_client_days: LOG_RETENTION_CLIENT_DAYS,
            p_perf_days: LOG_RETENTION_PERFORMANCE_DAYS,
            p_error_days: LOG_RETENTION_ERROR_DAYS,
          });

          if (error) {
            if (!rpcBulunamadiMi(error, "app_apply_log_retention")) {
              console.warn("Log retention temizliği çalıştırılamadı:", error.message || error);
            }
            return;
          }

          window.localStorage.setItem(LOG_RETENTION_LAST_RUN_KEY, String(Date.now()));
        } catch (error) {
          console.warn("Log retention temizliği beklenmeyen hataya düştü:", error);
        } finally {
          logRetentionCalisiyorRef.current = false;
        }
      })();
    }, 8000);

    return () => {
      iptal = true;
      window.clearTimeout(zamanlayici);
    };
  }, [session?.user?.id]);

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

      const { data, error, response } = await supabase.functions.invoke("user-admin", {
        body: payload,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      if (error) {
        const status = response?.status;
        const responseMesaji = await edgeFunctionCevapMesajiniOku(response);
        const hataMesaji = responseMesaji || error.message || "Kullanıcı yönetimi çağrısı başarısız oldu.";
        const hataAdi = String(error.name || "").toLowerCase();
        logClientError("functions.user-admin", error, {
          action: payload.action || "",
          status: status || null,
          responseMessage: responseMesaji,
        });

        if (edgeFunctionBulunamadiMi(error, "user-admin", status)) {
          throw new Error("Kullanıcı yönetimi Edge Function henüz deploy edilmemiş. Supabase Edge Function adımını tamamlaman gerekiyor.");
        }

        if (status === 401 || status === 403 || responseMesaji.toLowerCase().includes("yetki")) {
          throw new Error("Kullanıcı yönetimi yetkilendirmesi başarısız oldu. Çıkış yapıp tekrar giriş yapmanı öneririm.");
        }

        if (hataAdi.includes("functionsfetcherror") || hataAdi.includes("functionsrelayerror")) {
          throw new Error("Kullanıcı yönetimi servisine ulaşılamadı. Ağ bağlantısını ve Supabase servis durumunu kontrol et.");
        }

        throw new Error(hataMesaji);
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
    async ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) => {
      const email = session?.user?.email;
      if (!email) {
        return { ok: false, message: "Oturum bilgisi alınamadı." };
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword,
      });

      if (authError) {
        return { ok: false, message: "Eski şifre hatalı." };
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { ok: false, message: error.message || "Şifre güncellenemedi." };
      }
      return { ok: true, message: "Şifreniz başarıyla güncellendi." };
    },
    [session?.user?.email],
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
        await verileriGetir("profiller");
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

  const handleAdminDeleteUser = useCallback(
    async (payload: { userId: string; email: string }) => {
      try {
        setIsAdminKullaniciLoading(true);
        setAdminKullaniciHata("");
        const data = await adminKullaniciFonksiyonunuCagir<{ message?: string }>({
          action: "delete-user",
          userId: payload.userId,
        });
        await handleAdminUsersLoad(true);
        await verileriGetir("profiller");
        return { ok: true, message: data?.message || `${payload.email} kullanıcısı silindi.` };
      } catch (error: any) {
        setAdminKullaniciHata(error?.message || "Kullanıcı silinemedi.");
        return { ok: false, message: error?.message || "Kullanıcı silinemedi." };
      } finally {
        setIsAdminKullaniciLoading(false);
      }
    },
    [adminKullaniciFonksiyonunuCagir, handleAdminUsersLoad],
  );

  async function coptKutusunaAt(tablo: string, veri: any) {
      const { error } = await supabase
        .from("cop_kutusu")
        .insert({
          tablo_adi: tablo,
          veri,
          silinme_tarihi: new Date().toISOString(),
          silen_user_id: session?.user?.id || null,
          silen_email: aktifKullaniciEposta || null,
        });
      if (error) {
        console.warn("Çöp kutusuna atılamadı:", error.message);
        return false;
      }
      return true;
  }

  async function verileriGetir(
    hedef:
      | "acilis"
      | "hepsi"
      | "satis"
      | "ozet"
      | "sut"
      | "gider"
      | "uretim"
      | "ayar"
      | "ciftlikler"
      | "gider_turleri"
      | "profiller"
      | "cop" = "hepsi",
  ) {
    const startupEtkin = hedef === "acilis" && !startupTelemetriRef.current.fetchLoglandi;
    const kullaniciId = session?.user?.id || null;
    const { baslangic: donemBaslangici, bitis: donemBitisi } = donemAraliginiGetir(aktifDonem);
    const startupSorguyuCalistir = async <T,>(
      tablo: string,
      istek: PromiseLike<{ data: T[] | null; error: any }>,
    ) => {
      if (!startupEtkin) return istek;

      const baslangicMs = performansSimdi();
      try {
        const sonuc = await istek;
        startupTabloOlcumuKaydet({
          table: tablo,
          target: hedef,
          durationMs: sureyiYuvarla(baslangicMs),
          rowCount: Array.isArray(sonuc.data) ? sonuc.data.length : 0,
          status: sonuc.error ? "error" : "success",
          ...(sonuc.error?.message ? { errorMessage: sonuc.error.message } : {}),
        });
        return sonuc;
      } catch (error: any) {
        startupTabloOlcumuKaydet({
          table: tablo,
          target: hedef,
          durationMs: sureyiYuvarla(baslangicMs),
          rowCount: 0,
          status: "error",
          errorMessage: error?.message || "İstek başarısız oldu.",
        });
        throw error;
      }
    };

    try {
      setVeriYuklemeHata("");
      if (startupEtkin) {
        if (startupTelemetriRef.current.oturumBazMs == null) {
          startupTelemetriRef.current.oturumBazMs = performansSimdi();
        }
        startupTelemetriRef.current.ilkFetchBaslangicMs = performansSimdi();
        startupTelemetriRef.current.ilkFetchBitisMs = null;
        startupTelemetriRef.current.fetchDurationMs = null;
        startupTelemetriRef.current.tabloOlcumleri = [];
        setStartupVeriHazir(false);
      }

      if (hedef === "acilis" || hedef === "hepsi" || hedef === "ayar") {
        const [{ data: b, error: bErr }, { data: u, error: uErr }] = await Promise.all([
          startupSorguyuCalistir<Bayi>("bayiler", supabase.from("bayiler").select("*").order("isim")),
          startupSorguyuCalistir<Urun>("urunler", supabase.from("urunler").select("*").order("isim")),
        ]);
        if (bErr || uErr) throw bErr || uErr;
        if (b) setBayiler(b);
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
      }

      if (hedef === "hepsi" || hedef === "ayar" || hedef === "sut" || hedef === "ciftlikler") {
        const { data: c, error: cErr } = await startupSorguyuCalistir<Ciftlik>(
          "ciftlikler",
          supabase.from("ciftlikler").select("*").order("isim"),
        );
        if (cErr) throw cErr;
        if (c) setTedarikciler(c);
        if (kullaniciId) {
          ertelenenVeriYuklemeRef.current.ciftliklerYuklenenKullanici = kullaniciId;
        }
      }

      if (hedef === "ayar" || hedef === "gider_turleri" || (hedef === "hepsi" && !startupEtkin)) {
        const { data: gt, error: gtErr } = await startupSorguyuCalistir<GiderTuru>(
          "gider_turleri",
          supabase.from("gider_turleri").select("*").order("isim"),
        );
        if (gtErr) throw gtErr;
        if (gt) setGiderTuruListesi(gt);
        if (kullaniciId) {
          ertelenenVeriYuklemeRef.current.giderTurleriYuklenenKullanici = kullaniciId;
        }
      }

      if (hedef === "ayar" || hedef === "profiller" || (hedef === "hepsi" && !startupEtkin)) {
        const { data: p, error: pErr } = await startupSorguyuCalistir<{ username?: string | null }>(
          "profiles",
          supabase.from("profiles").select("username").order("username"),
        );
        if (pErr) throw pErr;
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
        if (kullaniciId) {
          ertelenenVeriYuklemeRef.current.profillerYuklenenKullanici = kullaniciId;
        }
      }

      if (hedef === "acilis" || hedef === "hepsi" || hedef === "satis") {
        const [{ data: f, error: fErr }, { data: st, error: stErr }] = await Promise.all([
          startupSorguyuCalistir<SatisFis>(
            "satis_fisleri",
            supabase
              .from("satis_fisleri")
              .select("*")
              .gte("tarih", donemBaslangici)
              .lt("tarih", donemBitisi)
              .order("tarih", { ascending: true })
              .order("id", { ascending: true }),
          ),
          startupSorguyuCalistir<SatisGiris>(
            "satis_giris",
            supabase
              .from("satis_giris")
              .select("*")
              .gte("tarih", donemBaslangici)
              .lt("tarih", donemBitisi)
              .order("tarih", { ascending: true })
              .order("id", { ascending: true }),
          ),
        ]);
        if (fErr || stErr) throw fErr || stErr;
        if (f) setSatisFisList(f);
        if (st) setSatisList(st);
      }

      if (hedef === "hepsi" || hedef === "sut" || hedef === "ozet") {
        const { data: s, error: sErr } = await startupSorguyuCalistir<SutGiris>(
          "sut_giris",
          supabase
            .from("sut_giris")
            .select("*")
            .gte("tarih", donemBaslangici)
            .lt("tarih", donemBitisi)
            .order("tarih", { ascending: true })
            .order("id", { ascending: true }),
        );
        if (sErr) throw sErr;
        if (s) setSutList(s);
        if (kullaniciId) {
          ertelenenVeriYuklemeRef.current.sutYuklenenKullanici = kullaniciId;
        }
      }

      if (hedef === "acilis" || hedef === "hepsi" || hedef === "gider") {
        const { data: g, error: gErr } = await startupSorguyuCalistir<Gider>(
          "giderler",
          supabase
            .from("giderler")
            .select("*")
            .gte("tarih", donemBaslangici)
            .lt("tarih", donemBitisi)
            .order("tarih", { ascending: true })
            .order("id", { ascending: true }),
        );
        if (gErr) throw gErr;
        if (g) setGiderList(g);
        if (kullaniciId) {
          ertelenenVeriYuklemeRef.current.giderYuklenenKullanici = kullaniciId;
        }
      }

      if (hedef === "hepsi" || hedef === "uretim") {
        const { data: ur, error: urErr } = await startupSorguyuCalistir<Uretim>(
          "uretim",
          supabase
            .from("uretim")
            .select("*")
            .gte("tarih", donemBaslangici)
            .lt("tarih", donemBitisi)
            .order("tarih", { ascending: true })
            .order("id", { ascending: true }),
        );
        if (urErr) throw urErr;
        if (ur) setUretimList(ur.map((kayit) => uretimKaydiniNormalizeEt(kayit as Uretim)));
        if (kullaniciId) {
          ertelenenVeriYuklemeRef.current.uretimYuklenenKullanici = kullaniciId;
        }
      }

      if (hedef === "cop" || (hedef === "hepsi" && !startupEtkin)) {
        const { data: cop, error: copErr } = await startupSorguyuCalistir<CopKutusu>(
          "cop_kutusu",
          supabase.from("cop_kutusu").select("*").order("silinme_tarihi", { ascending: false }),
        );
        if (copErr) throw copErr;
        if (cop) setCopKutusuList(cop);
        if (kullaniciId) {
          ertelenenVeriYuklemeRef.current.copYuklenenKullanici = kullaniciId;
        }
      }

      if (startupEtkin) {
        const bitisMs = performansSimdi();
        const durationMs = sureyiYuvarla(startupTelemetriRef.current.ilkFetchBaslangicMs, bitisMs);
        startupTelemetriRef.current.ilkFetchBitisMs = bitisMs;
        startupTelemetriRef.current.fetchDurationMs = durationMs;
        startupTelemetriRef.current.fetchLoglandi = true;
        startupLog(
          "startup.fetch_all",
          "Startup data load completed",
          {
            target: hedef,
            duration_ms: durationMs,
            table_count: startupTelemetriRef.current.tabloOlcumleri.length,
            status: "success",
            tables: startupTelemetriRef.current.tabloOlcumleri.map((olcum) => ({
              table: olcum.table,
              row_count: olcum.rowCount,
              duration_ms: olcum.durationMs,
              status: olcum.status,
            })),
          },
          "fetch_all",
        );
        setStartupVeriHazir(true);
      }

      return true;

    } catch (error: any) {
      if (startupEtkin && !startupTelemetriRef.current.fetchLoglandi) {
        const bitisMs = performansSimdi();
        const durationMs = sureyiYuvarla(startupTelemetriRef.current.ilkFetchBaslangicMs, bitisMs);
        startupTelemetriRef.current.ilkFetchBitisMs = bitisMs;
        startupTelemetriRef.current.fetchDurationMs = durationMs;
        startupTelemetriRef.current.fetchLoglandi = true;
        startupLog(
          "startup.fetch_all",
          "Startup data load failed",
          {
            target: hedef,
            duration_ms: durationMs,
            table_count: startupTelemetriRef.current.tabloOlcumleri.length,
            status: "error",
            error_message: error?.message || "Veri yükleme başarısız oldu.",
            tables: startupTelemetriRef.current.tabloOlcumleri.map((olcum) => ({
              table: olcum.table,
              row_count: olcum.rowCount,
              duration_ms: olcum.durationMs,
              status: olcum.status,
            })),
          },
          "fetch_all_error",
        );
      }
      console.error(error);
      logClientError("app.verileriGetir", error, {
        target: hedef,
        online: typeof navigator !== "undefined" ? navigator.onLine : true,
      });
      setVeriYuklemeHata(error?.message || "Veriler alinirken beklenmeyen bir hata olustu.");
      return false;
    }
  }

  // DÖNEM GEÇİŞ LİSTESİ OLUŞTURUCU
  const aylar = useMemo(() => {
     const set = new Set(donemSecenekleri);
     [...sutList, ...satisFisList, ...giderList, ...uretimList].forEach(item => {
         const donem = donemiTarihtenAyikla(item.tarih);
         if(donem) set.add(donem);
     });
     set.add(getLocalDateString().substring(0, 7)); 
     set.add(aktifDonem);
     return Array.from(set).sort().reverse(); 
  }, [donemSecenekleri, sutList, satisFisList, giderList, uretimList, aktifDonem]);

  // Tüm Fişlerden Müşteri Borç Durumu Hesaplama
  const bayiBorclari = useMemo(() => {
    const { bakiyeler, labels } = hesaplaMusteriBakiyeleri(satisFisList, aktifDonem);
    return Object.keys(bakiyeler)
        .map((k) => ({ anahtar: k, isim: labels[k] || k, borc: bakiyeler[k] }))
        .filter((b) => Math.abs(b.borc) > 0.01)
        .sort((a, b) => b.borc - a.borc);
  }, [aktifDonem, hesaplaMusteriBakiyeleri, satisFisList]);

  const musteriEkstreHesapla = useCallback((hesapAnahtari: string, musteriAdi: string) => {
    const ilgiliFisler = [...satisFisList]
      .filter((fis) => {
        if (satisFisHesapAnahtariGetir(fis) !== hesapAnahtari) return false;
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
        const eslesenFisSatirlari = satisList.filter(
          (satir) => String(satir.fis_no || "").trim() === String(fis.fis_no || "").trim(),
        );
        const yedekFisSatirlari =
          eslesenFisSatirlari.length > 0
            ? []
            : satisList.filter(
                (satir) =>
                  satisSatiriHesapAnahtariGetir(satir) === hesapAnahtari &&
                  String(satir.tarih || "") === String(fis.tarih || ""),
              );
        const urunSatirlari = (eslesenFisSatirlari.length > 0 ? eslesenFisSatirlari : yedekFisSatirlari)
          .reduce<Array<{ isim: string; adet: number; tutar: number }>>((acc, satir) => {
            const urunAdi = satisSatiriUrunAdiGetir(satir);
            if (!urunAdi || urunAdi === "İade Kova" || urunAdi === "Boş Kova") return acc;
            acc.push({
              isim: urunAdi,
              adet: sayiDegeri(satir.adet) || sayiDegeri(satir.birim) || sayiDegeri(satir.toplam_kg),
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
  }, [aktifDonem, satisFisBayiAdiGetir, satisFisHesapAnahtariGetir, satisList, satisSatiriHesapAnahtariGetir, satisSatiriUrunAdiGetir, satisFisList]);

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

  const fisKaydiniListeyeUygula = useCallback(
    (hedefFis: Partial<SatisFis>, kayitlar: Array<Partial<SatisFis>> = satisFisList) => {
      const hedefId = hedefFis.id == null ? null : String(hedefFis.id);
      const digerKayitlar = hedefId
        ? kayitlar.filter((kayit) => String(kayit.id ?? "") !== hedefId)
        : [...kayitlar];
      return [...digerKayitlar, hedefFis];
    },
    [satisFisList],
  );

  const fisBorcBilgisiniGetir = useCallback(
    (hedefFis: Partial<SatisFis>, kayitlar: Array<Partial<SatisFis>> = satisFisList) => {
      const { map } = hesaplaMusteriBakiyeleri(kayitlar);
      const genelBorc =
        hedefFis.id == null
          ? Number(hedefFis.kalan_bakiye || 0)
          : map[String(hedefFis.id)] ?? Number(hedefFis.kalan_bakiye || 0);
      return {
        eskiBorc: genelBorc - Number(hedefFis.kalan_bakiye || 0),
        genelBorc,
      };
    },
    [hesaplaMusteriBakiyeleri, satisFisList],
  );

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
     const { data: mevcutDevirler, error: mevcutDevirErr } = await supabase
       .from("satis_fisleri")
       .select("id, odeme_turu, aciklama, tarih")
       .eq("tarih", hedefDevirTarihi)
       .or("odeme_turu.eq.DEVİR,odeme_turu.eq.DEVIR,odeme_turu.eq.PERSONEL DEVİR,odeme_turu.eq.PERSONEL DEVIR");
     if (mevcutDevirErr) {
       alert("Dönem kapatma ön kontrolü yapılamadı: " + (mevcutDevirErr.message || "Bilinmeyen hata"));
       return;
     }
     const devirZatenOlusmus = (mevcutDevirler || []).some((fis) =>
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
  const periodSatisList = useMemo(() => satisList.filter(s => s.tarih.startsWith(aktifDonem)), [satisList, aktifDonem]);
  const periodGider = useMemo(() => giderList.filter(g => g.tarih.startsWith(aktifDonem)), [giderList, aktifDonem]);
  const satisFisCreatedAtBul = useCallback(
    (fisId?: string | number | null) =>
      periodSatisFis.find((kayit) => String(kayit.id ?? "") === String(fisId ?? ""))?.created_at || null,
    [periodSatisFis],
  );
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
  const hesaplaFisGosterimKg = (isim: string, adetValue: any, kgValue: any) => {
    const adet = Number(adetValue) || 0;
    const kg = Number(kgValue) || 0;
    if (kg > 0) return kg;
    const kgEslesme = isim.match(/(\d+(?:\.\d+)?)\s*(kg|lt|l|gr)\b/i);
    return kgEslesme ? Number(kgEslesme[1]) * adet : 0;
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
      const insertData: any =
        tablo === "gider_turleri"
          ? { isim }
          : tablo === "urunler"
            ? { isim, aktif: true, ...(yeniUrunSabitle ? { sabit: true } : {}) }
            : { isim, aktif: true };
      const { error } = await supabase.from(tablo).insert(insertData);
      if (error && tablo === "urunler" && yeniUrunSabitle && kolonBulunamadiMi(error, "urunler", "sabit")) {
        return alert("Urun sabitleme ozelligi icin once sql/add-sabit-column-to-urunler.sql dosyasini Supabase SQL Editor'da calistir.");
      }
      if (error) return alert(`Hata: ${error.message}`);
      if(resetFn) resetFn("");
      if (tablo === "urunler") setYeniUrunSabitle(false);
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
    } else if (islemTip === "sabit") {
      if (!id) return;
      const { error } = await supabase.from(tablo).update({ sabit: Boolean(isim) }).eq("id", id);
      if (error && tablo === "urunler" && kolonBulunamadiMi(error, "urunler", "sabit")) {
        return alert("Sabitle ozelligi icin once sql/add-sabit-column-to-urunler.sql dosyasini Supabase SQL Editor'da calistir.");
      }
      if (error) return alert(`Hata: ${error.message}`);
    } else if (islemTip === "hesap_grubu") {
      if (!id) return;
      const temizDeger = typeof isim === "string" ? isim.trim() : "";
      const { error } = await supabase.from(tablo).update({ hesap_grubu: temizDeger || null }).eq("id", id);
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

      const siralamaZamaniA = satisFisSiralamaZamaniBul(a);
      const siralamaZamaniB = satisFisSiralamaZamaniBul(b);
      const createdAtA = siralamaZamaniA;
      const createdAtB = siralamaZamaniB;
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

  const resetTahsilatForm = () => {
    setEditingTahsilatId(null);
    setTahsilatForm({ tarih: aktifDonemTarihi(), bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" });
  };

  const handleTahsilatDuzenle = (fis: SatisFis) => {
    if (!fisDuzenlenebilirMi(fis)) {
      alert("Bu tahsilat kaydını sadece ekleyen kullanıcı veya admin düzenleyebilir.");
      return;
    }

    let safAciklama = fis.aciklama || "";
    if (safAciklama.includes("[Sadece Tahsilat]")) {
      safAciklama = safAciklama.replace(/\[Sadece Tahsilat\]\s*-\s*/, "").replace(/\[Sadece Tahsilat\]/, "");
    }

    setEditingTahsilatId(Number(fis.id) || null);
    setTahsilatForm({
      tarih: fis.tarih || aktifDonemTarihi(),
      bayi: satisFisBayiAdiGetir(fis),
      miktar: paraGirdisiniTemizle(String(Number(fis.tahsilat || 0) || "")),
      odeme_turu: fis.odeme_turu || "PEŞİN",
      aciklama: safAciklama,
    });
    setIsTahsilatModalOpen(true);
  };

  async function handleTahsilatKaydet() {
    if (!tahsilatForm.bayi || !tahsilatForm.miktar) return alert("Bayi ve miktar alanları zorunludur!");
    if (!tumBayiler.some(b => b.isim === tahsilatForm.bayi)) return alert("Lütfen listeden geçerli bir Bayi/Müşteri seçin! Kendiniz rastgele isim giremezsiniz.");

    const tMiktar = paraGirdisiniSayiyaCevir(tahsilatForm.miktar);
    if (tMiktar <= 0) return alert("Geçerli bir tahsilat tutarı girin.");

    const donemDisiOnayMesaji = aktifDonemDisiKayitOnayMetni(tahsilatForm.tarih, aktifDonem);
    if (
      donemDisiOnayMesaji &&
      !(await confirmDialogAc({
        title: "Dönem Dışı Kayıt",
        message: donemDisiOnayMesaji,
        confirmText: "Evet, Kaydet",
        cancelText: "Vazgeç",
        tone: "warning",
      }))
    ) return;

    const ortakData = {
      tarih: tahsilatForm.tarih,
      bayi: tahsilatForm.bayi,
      bayi_id: seciliBayiId(tahsilatForm.bayi),
      toplam_tutar: 0,
      tahsilat: tMiktar,
      kalan_bakiye: -tMiktar,
      odeme_turu: tahsilatForm.odeme_turu,
      aciklama: tahsilatForm.aciklama ? `[Sadece Tahsilat] - ${tahsilatForm.aciklama}` : `[Sadece Tahsilat]`,
    };

    const { error } =
      editingTahsilatId
        ? await supabase.from("satis_fisleri").update(ortakData).eq("id", editingTahsilatId)
        : await supabase.from("satis_fisleri").insert({
            ...ortakData,
            fis_no: `T-${Date.now().toString().slice(-6)}${Math.floor(Math.random()*1000)}`,
            ekleyen: aktifKullaniciEposta,
          });
    if (error) return alert("Hata: " + veritabaniHatasiMesaji("satis_fisleri", error));

    resetTahsilatForm();
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
      alert("Bu kasa devir fişini sadece ekleyen kullanıcı veya admin düzenleyebilir.");
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

    const donemDisiOnayMesaji = aktifDonemDisiKayitOnayMetni(digerForm.tarih, aktifDonem);
    if (
      donemDisiOnayMesaji &&
      !(await confirmDialogAc({
        title: "Dönem Dışı Kayıt",
        message: donemDisiOnayMesaji,
        confirmText: "Evet, Kaydet",
        cancelText: "Vazgeç",
        tone: "warning",
      }))
    ) return;

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

  const { eskiBorc, genelBorc: toplamGenelBorc } = useMemo(() => {
      if (!aktifBayi) return { eskiBorc: 0, genelBorc: 0 };
      const tahsilat = paraGirdisiniSayiyaCevir(fisUst.tahsilat || "");
      const onizlemeFis: Partial<SatisFis> = {
        id: editingFisId ?? String(Number.MAX_SAFE_INTEGER),
        fis_no: editingFisNo || "ONIZLEME",
        tarih: fisUst.tarih,
        bayi: fisUst.bayi,
        bayi_id: aktifBayiId,
        toplam_tutar: fisCanliToplam,
        tahsilat,
        kalan_bakiye: fisCanliToplam - tahsilat,
        odeme_turu: fisUst.odeme_turu,
        ekleyen: aktifKullaniciEposta,
      };
      const simuleFisler = fisKaydiniListeyeUygula(onizlemeFis);
      return fisBorcBilgisiniGetir(onizlemeFis, simuleFisler);
  }, [
    aktifBayi,
    aktifBayiId,
    aktifKullaniciEposta,
    editingFisId,
    editingFisNo,
    fisBorcBilgisiniGetir,
    fisCanliToplam,
    fisKaydiniListeyeUygula,
    fisUst.bayi,
    fisUst.odeme_turu,
    fisUst.tahsilat,
    fisUst.tarih,
  ]);

  const fisGorselDosyaAdi = useMemo(() => {
    if (fisGorselDosya?.name) return fisGorselDosya.name;
    if (!fisGorselMevcutYol) return "";
    return fisGorselMevcutYol.split("/").pop() || fisGorselMevcutYol;
  }, [fisGorselDosya, fisGorselMevcutYol]);

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

  const gorselBoyutunuGetir = async (url: string) => {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (!response.ok) return "";
      const boyut = Number(response.headers.get("content-length") || 0);
      return byteBoyutunuFormatla(boyut);
    } catch {
      return "";
    }
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

  const handleFisKameraAc = () => fisGorselKameraInputRef.current?.click();
  const handleFisGaleriAc = () => fisGorselGaleriInputRef.current?.click();

  const gorselIndirmeAdiBul = (kaynak?: string | null, varsayilan = "gorsel.jpg") => {
    if (!kaynak) return varsayilan;
    const temiz = kaynak.split("?")[0];
    const parca = temiz.split("/").pop();
    if (!parca) return varsayilan;
    return decodeURIComponent(parca);
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
      const boyut = await gorselBoyutunuGetir(raw);
      setFisGorselOnizleme({ url: raw, baslik, boyut, indirmeAdi: gorselIndirmeAdiBul(raw, `${dosyaAdiIcinTemizle(baslik) || "fis"}.jpg`) });
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

    const boyut = await gorselBoyutunuGetir(data.signedUrl);
    setFisGorselOnizleme({ url: data.signedUrl, baslik, boyut, indirmeAdi: gorselIndirmeAdiBul(raw, `${dosyaAdiIcinTemizle(baslik) || "fis"}.jpg`) });
  };

  const handleAcikGorseliIndir = async () => {
    if (!fisGorselOnizleme?.url) return;
    try {
      const response = await fetch(fisGorselOnizleme.url);
      if (!response.ok) throw new Error("Görsel indirilemedi.");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fisGorselOnizleme.indirmeAdi || "gorsel.jpg";
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error: any) {
      alert(`İndirme hatası: ${error?.message || "Bilinmeyen hata"}`);
    }
  };

  const fisGorseliYukle = async (fisNo: string) => {
    if (!fisGorselDosya) return fisGorselMevcutYol || null;

    const optimizeDosya = await gorseliYuklemeIcinKucult(fisGorselDosya);
    const uzanti = "jpg";
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
    const fisNoSlug = dosyaAdiIcinTemizle(fisNo || "fis");
    const guvenliEk = Math.random().toString(36).slice(2, 8).toUpperCase();
    const dosyaYolu = `${bayiSlug}/${bayiSlug}-${tarihParcasi}-${fisNoSlug}-${guvenliEk}.${uzanti}`;

    const { error } = await supabase.storage.from("fis_gorselleri").upload(dosyaYolu, optimizeDosya, {
      contentType: optimizeDosya.type,
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

    const donemDisiOnayMesaji = aktifDonemDisiKayitOnayMetni(fisUst.tarih, aktifDonem);
    if (
      donemDisiOnayMesaji &&
      !(await confirmDialogAc({
        title: "Dönem Dışı Kayıt",
        message: donemDisiOnayMesaji,
        confirmText: "Evet, Kaydet",
        cancelText: "Vazgeç",
        tone: "warning",
      }))
    ) return;

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

      const kaydedilenFis: Partial<SatisFis> = {
        id: savedFisId ?? undefined,
        fis_no: ortakFisNo,
        tarih: fisUst.tarih,
        bayi: fisUst.bayi,
        bayi_id: secilenBayiId,
        toplam_tutar: fisCanliToplam,
        tahsilat,
        kalan_bakiye: fisCanliToplam - tahsilat,
        odeme_turu: fisUst.odeme_turu,
        aciklama: genelNot,
        ekleyen: aktifKullaniciEposta,
        fis_gorseli: fisGorselYolu,
      };
      const kaydedilenFisBorc = fisBorcBilgisiniGetir(
        kaydedilenFis,
        fisKaydiniListeyeUygula(kaydedilenFis),
      );

      const fisGosterimData = {
        id: savedFisId,
        fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, aciklama: fisUst.aciklama, teslim_alan: fisUst.teslim_alan,
        fis_gorseli: fisGorselYolu,
        created_at: sonuc?.created_at || satisFisCreatedAtBul(savedFisId) || new Date().toISOString(),
        updated_at: sonuc?.updated_at || new Date().toISOString(),
        ekleyen: aktifKullaniciEposta,
        urunler: eklenecekUrunler.map(u => {
          const adet = Number(fisDetay[u.id].adet);
          const kg = hesaplaFisGosterimKg(u.isim, fisDetay[u.id].adet, fisDetay[u.id].kg);
          const fiyat = Number(fisDetay[u.id].fiyat);
          const isKova = u.isim.match(/([345])\s*kg/i);
          const miktar = isKova ? adet : (kg > 0 ? kg : adet);
          return { isim: u.isim, adet: adet, kg: kg, fiyat: fiyat, tutar: miktar * fiyat };
        }),
        ekstraIndirimler,
        genelToplam: fisCanliToplam, tahsilat: tahsilat, kalanBakiye: (fisCanliToplam - tahsilat), odeme: fisUst.odeme_turu,
        eskiBorc: kaydedilenFisBorc.eskiBorc, genelBorc: kaydedilenFisBorc.genelBorc,
        gosterBakiye: false
      };

      resetFisForm(); setIsFisModalOpen(false); verileriGetir("satis"); setSonFisData(fisGosterimData);
      return;
    }

    if (!rpcBulunamadiMi(rpcFisError, "app_save_satis_fisi")) {
      await yeniGorseliTemizle();
      return alert("Kayıt Hatası: " + (rpcFisError.message || "Bilinmeyen RPC hatası"));
    }

    let yeniFisCreatedAt: string | null = null;

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
      yeniFisCreatedAt = newFisData?.created_at || null;
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

    const kaydedilenFis: Partial<SatisFis> = {
      id: savedFisId ?? undefined,
      fis_no: ortakFisNo,
      tarih: fisUst.tarih,
      bayi: fisUst.bayi,
      bayi_id: secilenBayiId,
      toplam_tutar: fisCanliToplam,
      tahsilat,
      kalan_bakiye: fisCanliToplam - tahsilat,
      odeme_turu: fisUst.odeme_turu,
      aciklama: genelNot,
      ekleyen: aktifKullaniciEposta,
      fis_gorseli: fisGorselYolu,
    };
    const kaydedilenFisBorc = fisBorcBilgisiniGetir(
      kaydedilenFis,
      fisKaydiniListeyeUygula(kaydedilenFis),
    );

    const fisGosterimData = {
      id: savedFisId,
      fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, aciklama: fisUst.aciklama, teslim_alan: fisUst.teslim_alan,
      fis_gorseli: fisGorselYolu,
      created_at: yeniFisCreatedAt || satisFisCreatedAtBul(savedFisId) || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ekleyen: aktifKullaniciEposta,
      urunler: eklenecekUrunler.map(u => {
         const adet = Number(fisDetay[u.id].adet);
         const kg = hesaplaFisGosterimKg(u.isim, fisDetay[u.id].adet, fisDetay[u.id].kg);
         const fiyat = Number(fisDetay[u.id].fiyat);
         const isKova = u.isim.match(/([345])\s*kg/i);
         const miktar = isKova ? adet : (kg > 0 ? kg : adet);
         return { isim: u.isim, adet: adet, kg: kg, fiyat: fiyat, tutar: miktar * fiyat };
       }),
      ekstraIndirimler,
      genelToplam: fisCanliToplam, tahsilat: tahsilat, kalanBakiye: (fisCanliToplam - tahsilat), odeme: fisUst.odeme_turu,
      eskiBorc: kaydedilenFisBorc.eskiBorc, genelBorc: kaydedilenFisBorc.genelBorc,
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
    
    const fisBorcBilgisi = fisBorcBilgisiniGetir(fis);
    
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
      id: fis.id, fis_no: fis.fis_no, tarih: fis.tarih, bayi: satisFisBayiAdiGetir(fis), aciklama: safAciklama, teslim_alan: tAlan, fis_gorseli: fis.fis_gorseli, created_at: fis.created_at || satisFisCreatedAtBul(fis.id), updated_at: fis.updated_at || null, ekleyen: fis.ekleyen,
      urunler: ilgiliUrunler.map(u => {
          let calculatedKg = hesaplaFisGosterimKg(String(u.urun || ""), u.adet, u.toplam_kg);
          const a = Number(u.adet), t = Number(u.tutar), f = Number(u.fiyat);
          if (calculatedKg === 0 && f !== 0 && Math.abs(t - (a * f)) > 0.01) calculatedKg = t / f;
          return { isim: u.urun, adet: a, kg: calculatedKg, fiyat: f, tutar: t };
      }), 
      ekstraIndirimler,
      genelToplam: fis.toplam_tutar, tahsilat: fis.tahsilat, kalanBakiye: fis.kalan_bakiye, odeme: fis.odeme_turu || "Bilinmiyor",
      eskiBorc: fisBorcBilgisi.eskiBorc, genelBorc: fisBorcBilgisi.genelBorc,
      gosterBakiye: false 
    });
  };

  async function handleFisSil(fis: any) {
    if (!fisSilinebilirMi(fis)) {
      alert("Bu fişi sadece ekleyen kullanıcı veya admin silebilir.");
      return;
    }
    if (
      !(await confirmDialogAc({
        title: "Satış Fişini Sil",
        message: `Bu işlemi (${fis.fis_no || fis.id}) silmek istediğinize emin misiniz?`,
        confirmText: "Evet, Sil",
        cancelText: "İptal",
        tone: "danger",
      }))
    ) return;

    const { error: rpcSilError } = await supabase.rpc("app_delete_satis_fisi", {
      p_fis_id: fis.id,
    });
    if (!rpcSilError) {
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

    verileriGetir("satis"); verileriGetir("cop");
  }

  const goruntuyuJpegOlarakPaylas = async (elementId: string, dosyaAdi: string, baslik: string) => {
    const hedefElement = document.getElementById(elementId);
    if (!hedefElement) return;
    let html2canvasFn: any;
    try {
      html2canvasFn = await html2canvasYukle();
    } catch {
      alert("Görsel paylaşım aracı yüklenemedi. Lütfen tekrar deneyin.");
      return;
    }

    const canvas = await html2canvasFn(hedefElement, { scale: 3, backgroundColor: "#ffffff" });
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

  const ozetToplamFisler = useMemo(
    () => periodSatisFis.filter((f: any) => !fisDevirMi(f) && !fisKasayaDevirMi(f)),
    [periodSatisFis],
  );

  const tOzetFisToplam = useMemo(
    () => ozetToplamFisler.reduce((a: number, b: any) => a + Number(b.toplam_tutar), 0),
    [ozetToplamFisler],
  );
  const tOzetFisTahsilatRaw = useMemo(
    () => ozetToplamFisler.reduce((a: number, b: any) => a + Number(b.tahsilat), 0),
    [ozetToplamFisler],
  );
  const ozetToplamFisNoSet = useMemo(
    () => new Set(ozetToplamFisler.map((fis) => String(fis.fis_no || "").trim()).filter(Boolean)),
    [ozetToplamFisler],
  );
  const tOzetDevredenBakiye = useMemo(
    () =>
      periodSatisList.reduce((toplam: number, satir) => {
        const fisNo = String(satir.fis_no || "").trim();
        if (!fisNo || !ozetToplamFisNoSet.has(fisNo)) return toplam;
        if (!devredenBorcSatiriMi(satisSatiriUrunAdiGetir(satir))) return toplam;
        return toplam + Number(satir.tutar || 0);
      }, 0),
    [ozetToplamFisNoSet, periodSatisList, satisSatiriUrunAdiGetir],
  );
  const tOzetReelSatis = useMemo(
    () => tOzetFisToplam - tOzetDevredenBakiye,
    [tOzetDevredenBakiye, tOzetFisToplam],
  );
  const aktifDonemSatisEtiketi = useMemo(() => donemSatisEtiketiGetir(aktifDonem), [aktifDonem]);

  const tFisToplam = useMemo(() => filteredForTotals.filter(f => !fisKasayaDevirMi(f)).reduce((a: number, b: any) => a + Number(b.toplam_tutar), 0), [filteredForTotals]);
  const tFisTahsilatRaw = useMemo(() => filteredForTotals.filter(f => !fisKasayaDevirMi(f)).reduce((a: number, b: any) => a + Number(b.tahsilat), 0), [filteredForTotals]);
  const tFisKalan = useMemo(() => filteredForTotals.filter(f => !fisKasayaDevirMi(f)).reduce((a: number, b: any) => a + Number(b.kalan_bakiye), 0), [filteredForTotals]);

  // GİDERLER TAHSİLATTAN DÜŞÜYOR (Kullanıcının giderleri net tahsilatı belirler)
  const tKullaniciGider = useMemo(
    () =>
      periodGider
        .filter((g) => normalizeUsername(g.ekleyen) === aktifKullaniciKisa && !hammaddeBorcuGideriMi(g.tur))
        .reduce((a: number, b: any) => a + Number(b.tutar), 0),
    [aktifKullaniciKisa, periodGider],
  );
  const tKasayaDevir = useMemo(() => filteredForTotals.filter(f => fisKasayaDevirMi(f)).reduce((a: number, b: any) => a + Number(b.tahsilat), 0), [filteredForTotals]);
  const tNetTahsilat = tFisTahsilatRaw - tKullaniciGider - tKasayaDevir;

  const fFisList = useMemo(() => sortData(filteredForTotals.filter((f: any) => {
    if (satisFiltreTip === 'tumu') return !fisKasayaDevirMi(f); 
    if (satisFiltreTip === 'kasa_devir') return fisKasayaDevirMi(f);
    if (satisFiltreTip === 'tahsilat') return f.toplam_tutar === 0 && !fisKasayaDevirMi(f);
    if (satisFiltreTip === 'satis') return f.toplam_tutar > 0 && !fisKasayaDevirMi(f);
    return true;
  }), fisSort), [filteredForTotals, satisFiltreTip, fisSort]);

  const tGiderNormal = useMemo(
    () => periodGider.filter((g) => normalGiderMi(g.tur)).reduce((a: number, b: any) => a + Number(b.tutar), 0),
    [periodGider],
  );
  const tSutOdemesi = useMemo(
    () => periodGider.filter((g) => sutOdemesiMi(g.tur)).reduce((a: number, b: any) => a + Number(b.tutar), 0),
    [periodGider],
  );
  const tKremaOdemesi = useMemo(
    () => periodGider.filter((g) => kremaOdemesiMi(g.tur)).reduce((a: number, b: any) => a + Number(b.tutar), 0),
    [periodGider],
  );
  const tKovaOdemesi = useMemo(
    () => periodGider.filter((g) => kovaOdemesiMi(g.tur)).reduce((a: number, b: any) => a + Number(b.tutar), 0),
    [periodGider],
  );
  const tKatkiOdemesi = useMemo(
    () => periodGider.filter((g) => katkiOdemesiMi(g.tur)).reduce((a: number, b: any) => a + Number(b.tutar), 0),
    [periodGider],
  );
  const tSutTozuOdemesi = useMemo(
    () => periodGider.filter((g) => sutTozuOdemesiMi(g.tur)).reduce((a: number, b: any) => a + Number(b.tutar), 0),
    [periodGider],
  );
  const tHammaddeOdemeleri = tSutOdemesi + tKremaOdemesi + tKovaOdemesi + tKatkiOdemesi + tSutTozuOdemesi;
  const sutcuyeBorcumuz = useMemo(() => sutcuBorcunuHesapla(sutList, giderList, aktifDonem), [aktifDonem, giderList, sutList]);
  const hammaddeBorclari = useMemo(
    () => hammaddeBorclariniHesapla(giderList, aktifDonem),
    [aktifDonem, giderList],
  );
  const tHammaddeBorcu =
    sutcuyeBorcumuz +
    hammaddeBorclari.krema +
    hammaddeBorclari.kova +
    hammaddeBorclari.katki +
    hammaddeBorclari.sutTozu;
  const hammaddeOdemeDetaySatirlari = [
    { etiket: "Süt Ödemesi", deger: `${fSayiNoDec(tSutOdemesi)} TL`, vurgu: true },
    { etiket: "Krema Ödemesi", deger: `${fSayiNoDec(tKremaOdemesi)} TL`, vurgu: true },
    { etiket: "Kova Ödemesi", deger: `${fSayiNoDec(tKovaOdemesi)} TL`, vurgu: true },
    { etiket: "Katkı Ödemesi", deger: `${fSayiNoDec(tKatkiOdemesi)} TL`, vurgu: true },
    { etiket: "Süt Tozu Ödemesi", deger: `${fSayiNoDec(tSutTozuOdemesi)} TL`, vurgu: true },
  ];
  const hammaddeBorcDetaySatirlari = [
    { etiket: "Süt Borcu", deger: `${fSayiNoDec(sutcuyeBorcumuz)} TL`, vurgu: true },
    { etiket: "Krema Borcu", deger: `${fSayiNoDec(hammaddeBorclari.krema)} TL`, vurgu: true },
    { etiket: "Kova Borcu", deger: `${fSayiNoDec(hammaddeBorclari.kova)} TL`, vurgu: true },
    { etiket: "Katkı Borcu", deger: `${fSayiNoDec(hammaddeBorclari.katki)} TL`, vurgu: true },
    { etiket: "Süt Tozu Borcu", deger: `${fSayiNoDec(hammaddeBorclari.sutTozu)} TL`, vurgu: true },
  ];
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
      { baslik: aktifDonemSatisEtiketi, deger: tOzetReelSatis },
      { baslik: "Devreden Bakiye", deger: tOzetDevredenBakiye },
      { baslik: "Gider", deger: tGiderNormal },
      { baslik: "Tahsilat", deger: tOzetFisTahsilatRaw },
      { baslik: "Açık Hesap", deger: bayiNetDurum },
      { baslik: "Süt Borcu", deger: sutcuyeBorcumuz },
    ],
    [
      aktifDonemSatisEtiketi,
      bayiNetDurum,
      sutcuyeBorcumuz,
      tGiderNormal,
      tOzetDevredenBakiye,
      tOzetFisTahsilatRaw,
      tOzetReelSatis,
    ],
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
      const { yedegiExcelIndir } = await yedeklemeModulunuGetir();
      yedegiExcelIndir(yedekVerisi);
    } catch (error) {
      yedeklemeHatasiniGoster("Excel yedeği", error);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleJsonBackup = async () => {
    setIsBackupLoading(true);
    try {
      const { yedegiJsonIndir } = await yedeklemeModulunuGetir();
      yedegiJsonIndir(yedekVerisi);
    } catch (error) {
      yedeklemeHatasiniGoster("JSON yedeği", error);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleHtmlBackup = async () => {
    setIsBackupLoading(true);
    try {
      const { yedegiHtmlIndir } = await yedeklemeModulunuGetir();
      yedegiHtmlIndir(yedekVerisi);
    } catch (error) {
      yedeklemeHatasiniGoster("HTML rapor yedeği", error);
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
    if (
      !(await confirmDialogAc({
        title: "Çöp Kutusunu Boşalt",
        message: `Çöp kutusundaki ${copKutusuList.length} kayıt kalıcı olarak silinecek. Devam edilsin mi?`,
        confirmText: "Evet, Sil",
        cancelText: "İptal",
        tone: "danger",
      }))
    ) return;

    const { error } = await supabase.from("cop_kutusu").delete().not("id", "is", null);
    if (error) {
      alert(`Çöp kutusu boşaltılamadı: ${error.message}`);
      return;
    }

    setCopKutusuList([]);
    alert("Çöp kutusu boşaltıldı.");
  };

  const handleRestoreTrashItem = async (trashId: string) => {
    if (!trashId) return;
    setRestoringTrashId(trashId);
    try {
      const { data, error } = await supabase.rpc("app_restore_trash_item", {
        p_trash_id: trashId,
      });
      if (error) {
        if (rpcBulunamadiMi(error, "app_restore_trash_item")) {
          alert("Geri yükleme özelliği için yeni SQL migration henüz uygulanmamış görünüyor.");
          return;
        }
        alert("Geri yükleme hatası: " + (error.message || "Bilinmeyen hata"));
        return;
      }

      const sonuc = Array.isArray(data) ? data[0] : data;
      const geriYuklenenTablo = String(sonuc?.tablo_adi || "");

      if (geriYuklenenTablo === "satis_fisleri") {
        await verileriGetir("satis");
      } else if (geriYuklenenTablo === "sut_giris") {
        await verileriGetir("sut");
      } else if (geriYuklenenTablo === "giderler") {
        await verileriGetir("gider");
      } else if (geriYuklenenTablo === "uretim") {
        await verileriGetir("uretim");
      }

      await verileriGetir("cop");
      alert(sonuc?.already_restored ? "Kayıt daha önce geri yüklenmiş." : "Kayıt geri yüklendi.");
    } finally {
      setRestoringTrashId(null);
    }
  };

  const handleDeleteTrashItem = async (trashId: string) => {
    if (!isAdmin || !trashId) return;
    if (
      !(await confirmDialogAc({
        title: "Çöp Kaydını Sil",
        message: "Bu çöp kaydı kalıcı olarak silinsin mi?",
        confirmText: "Evet, Sil",
        cancelText: "İptal",
        tone: "danger",
      }))
    ) return;

    setDeletingTrashId(trashId);
    try {
      const { error } = await supabase.from("cop_kutusu").delete().eq("id", trashId);
      if (error) {
        alert("Çöp kaydı silinemedi: " + (error.message || "Bilinmeyen hata"));
        return;
      }

      await verileriGetir("cop");
    } finally {
      setDeletingTrashId(null);
    }
  };

  const cikisYap = async (mesaj?: string) => {
    await yerelOturumuTemizle();
    setUsername(normalizeUsername(username || session?.user?.email || ""));
    if (mesaj) {
      setAuthHata(mesaj);
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;

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
  }, [session?.user?.id]);

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

  const fisUrunDurumunuGetir = (u: Urun) => {
    const isimLower = urunAdiniNormalizeEt(u.isim);
    const isSistemSabitUrun = urunSistemSabitMi(u.isim);
    const isVarsayilanUrun = isSistemSabitUrun || u.sabit === true;
    const isSutKaymagi = urunSutKaymagiMi(u.isim);
    const isTereyagi = isimLower.includes("tereya");
    const isYogurtKaymagi = isimLower.includes("yogurt kayma");
    const isBosUrun = isimLower.includes("bos");
    const isFilled = Number(fisDetay[u.id]?.adet) > 0 || Number(fisDetay[u.id]?.kg) > 0;
    const isEkstraUrun = !isVarsayilanUrun && !isSutKaymagi && !isTereyagi && !isYogurtKaymagi;
    const ekstraUrunSecili = gosterilenEkler.urunler.includes(u.id);
    const isAktif = u.aktif !== false;
    const goster =
      (isAktif || isFilled) &&
      (isVarsayilanUrun ||
        isSutKaymagi ||
        isFilled ||
        (gosterilenEkler.tereyagi && isTereyagi) ||
        (gosterilenEkler.yogurt_kaymagi && isYogurtKaymagi) ||
        (isEkstraUrun && ekstraUrunSecili));

    return {
      isVarsayilanUrun,
      isSutKaymagi,
      isTereyagi,
      isYogurtKaymagi,
      isBosUrun,
      isEkstraUrun,
      isFilled,
      goster,
    };
  };

  const fisDetaySatiriniRenderEt = (u: Urun) => {
    const { goster, isFilled, isBosUrun } = fisUrunDurumunuGetir(u);

    if (!goster) return null;

    const handleAdetChange = (e: ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      let newKg = fisDetay[u.id]?.kg || "";
      const match = u.isim.match(/(\d+(?:\.\d+)?)/);
      if (isBosUrun) {
        newKg = "";
      } else if (match && match[1]) {
        const multiplier = Number(match[1]);
        if (val !== "") newKg = String(Number(val) * multiplier);
        else newKg = "";
      }
      setFisDetay({ ...fisDetay, [u.id]: { ...fisDetay[u.id], adet: val, kg: newKg } });
    };

    const canliIsKova = u.isim.match(/([345])\s*kg/i);
    const canliMiktar = isBosUrun
      ? Number(fisDetay[u.id]?.adet || 0)
      : canliIsKova
        ? Number(fisDetay[u.id]?.adet || 0)
        : (Number(fisDetay[u.id]?.kg) > 0 ? Number(fisDetay[u.id]?.kg) : Number(fisDetay[u.id]?.adet || 0));
    const canliSatirTutar = canliMiktar * Number(fisDetay[u.id]?.fiyat || 0);

    return (
      <div key={u.id} style={{ display: "flex", gap: "4px", alignItems: "center", padding: "4px 6px", background: isFilled ? (editingFisId ? "#fef3c7" : "#ecfdf5") : "#f8fafc", borderRadius: "4px", border: isFilled ? (editingFisId ? "1px solid #fde68a" : "1px solid #a7f3d0") : "1px solid #e2e8f0" }}>
        <div style={{ flex: 1, minWidth: "85px", fontWeight: "bold", fontSize: "12px", color: isFilled ? (editingFisId ? "#b45309" : "#065f46") : "#475569", whiteSpace: "normal", lineHeight: "1.2" }}>{u.isim}</div>
        <input placeholder="Adet" type="number" value={fisDetay[u.id]?.adet || ""} onChange={handleAdetChange} className="m-inp" style={{ flex: "0 0 45px", width: "45px", padding: "4px 2px", textAlign: "center", background: isFilled ? "#fff" : "", fontSize: "12px", height: "24px" }} />
        {isBosUrun ? null : (
          <>
            <input placeholder="KG" type="number" step="0.01" value={fisDetay[u.id]?.kg || ""} onChange={(e) => setFisDetay({ ...fisDetay, [u.id]: { ...fisDetay[u.id], kg: e.target.value } })} className="m-inp" style={{ flex: "0 0 50px", width: "50px", padding: "4px 2px", textAlign: "center", background: isFilled ? "#fff" : "", fontSize: "12px", height: "24px" }} />
            <div style={{ fontSize: "12px", color: "#94a3b8", width: "8px", textAlign: "center" }}>x</div>
          </>
        )}
        <input placeholder="Fiyat" type="number" step="0.01" value={fisDetay[u.id]?.fiyat || ""} onChange={(e) => setFisDetay({ ...fisDetay, [u.id]: { ...fisDetay[u.id], fiyat: e.target.value } })} className="m-inp" style={{ flex: "0 0 60px", width: "60px", padding: "4px 2px", textAlign: "right", background: isFilled ? "#fff" : "", fontSize: "12px", height: "24px" }} />
        <div style={{ width: "55px", textAlign: "right", fontWeight: "bold", fontSize: "12px", color: canliSatirTutar > 0 ? "#059669" : "#94a3b8" }}>{canliSatirTutar > 0 ? fSayi(canliSatirTutar) : "-"}</div>
      </div>
    );
  };

  const renderAyarlar = () =>
    sekmeBileseniniRenderEt(settingsPanelSekmesi.hazirBilesen(), SettingsPanel, {
      activeAyarTab,
      setActiveAyarTab: (tab: any) => {
        setActiveAyarTab(tab);
        if (tab === "depolama" && !depolamaDurumu && !isDepolamaLoading && !depolamaHata) {
          void depolamaDurumunuGetir();
        }
        if (tab === "performans" && isAdmin && !startupDiagnostics && !isStartupDiagnosticsLoading && !startupDiagnosticsError) {
          void startupTaniOzetiniGetir();
        }
      },
      aktifKullaniciEposta,
      bayiler,
      urunler,
      tedarikciler,
      giderTuruListesi,
      copKutusuList,
      yeniAyarDeger,
      setYeniAyarDeger,
      yeniUrunSabitle,
      setYeniUrunSabitle,
      handleAyarEkle,
      onSettingEdit: (tablo: any, id: any, isim: any) => {
        const yeniIsim = prompt("Yeni isim", isim);
        if (yeniIsim && yeniIsim.trim() && yeniIsim.trim() !== isim) {
          ayarIslem(tablo, yeniIsim.trim(), "guncelle", id);
        }
      },
      onSettingEditGroup: (_tablo: any, id: any, isim: any, hesapGrubu: any) => {
        const yeniGrup = prompt(`${isim} için hesap grubu (boş bırakılırsa bağ kaldırılır)`, hesapGrubu || "");
        if (yeniGrup === null) return;
        ayarIslem("bayiler", yeniGrup.trim(), "hesap_grubu", id);
      },
      onSettingToggleActive: (tablo: any, id: any, aktif: any) => {
        ayarIslem(tablo, !aktif, "durum", id);
      },
      onSettingTogglePinned: (id: any, sabit: any) => {
        ayarIslem("urunler", !sabit, "sabit", id);
      },
      onSettingDelete: (tablo: any, id: any, isim: any) => {
        void (async () => {
          if (
            await confirmDialogAc({
              title: "Kaydı Sil",
              message: `Silinecek: ${isim}`,
              confirmText: "Evet, Sil",
              cancelText: "İptal",
              tone: "danger",
            })
          ) {
            ayarIslem(tablo, null, "sil", id);
          }
        })();
      },
      onOpenTrash: () => verileriGetir("cop"),
      onEmptyTrash: handleEmptyTrash,
      onRestoreTrashItem: handleRestoreTrashItem,
      restoringTrashId,
      onDeleteTrashItem: handleDeleteTrashItem,
      deletingTrashId,
      startupDiagnostics,
      isStartupDiagnosticsLoading,
      startupDiagnosticsError,
      onLoadStartupDiagnostics: startupTaniOzetiniGetir,
      onHtmlBackup: handleHtmlBackup,
      onExcelBackup: handleExcelBackup,
      onJsonBackup: handleJsonBackup,
      isBackupLoading,
      depolamaDurumu,
      isDepolamaLoading,
      depolamaHata,
      onLoadDepolama: depolamaDurumunuGetir,
      isAdmin,
      mevcutKullanici,
      adminKullanicilar,
      isAdminKullaniciLoading,
      adminKullaniciHata,
      kullaniciListesi,
      tabYetkileri,
      sekmeSecenekleri,
      yetkiKaynak,
      yetkiUyari,
      onChangeOwnPassword: handleOwnPasswordChange,
      onLoadAdminUsers: handleAdminUsersLoad,
      onCreateAdminUser: handleAdminCreateUser,
      onResetAdminUserPassword: handleAdminResetUserPassword,
      onDeleteAdminUser: handleAdminDeleteUser,
      onSavePermissions: handlePermissionSave,
      onConfirm: confirmDialogAc,
    });

  const renderAktifSekme = () => {
    switch (activeTab) {
      case "satis":
        return sekmeBileseniniRenderEt(satisPanelSekmesi.hazirBilesen(), SatisPanel, {
          satisFiltreTip,
          setSatisFiltreTip,
          satisFiltreKisi,
          setSatisFiltreKisi,
          fFisList,
          satisFisToplamBorcMap,
          fisSort,
          setFisSort,
          fisFiltre,
          setFisFiltre,
          tFisToplam,
          tFisTahsilatRaw,
          tKullaniciGider,
          tKasayaDevir,
          tNetTahsilat,
          tFisKalan,
          bugun,
          dun,
          temaRengi,
          bayiler,
          actions: {
            onOpenNewFis: handleYeniFisAc,
            onOpenNewTahsilat: () => {
              resetTahsilatForm();
              setIsTahsilatModalOpen(true);
            },
            onOpenNewKasaDevir: () => setDigerModalConfig({ isOpen: true, type: "kasa_devir", mode: "create", fisId: null }),
            onViewFisImage: handleFisGorselGoster,
            onViewFisDetail: handleFisDetayGoster,
            onViewKasaDevir: handleKasaDevirGoruntule,
            onEditTahsilat: handleTahsilatDuzenle,
            onEditKasaDevir: handleKasaDevirDuzenle,
            onEditFis: handleFisDuzenle,
            onDeleteFis: handleFisSil,
          },
          visibility: {
            fisSilinebilirMi,
            fisDuzenlenebilirMi,
            fisKasayaDevirMi,
            fisTahsilatMi,
            sistemIslemiMi,
            satisFisBayiAdiGetir,
            fisGorunenBayi,
          },
          helpers: { fSayiNoDec },
        });
      case "ozet":
        return sekmeBileseniniRenderEt(ozetPanelSekmesi.hazirBilesen(), OzetPanel, {
          aktifDonemSatisEtiketi,
          tOzetReelSatis,
          tOzetFisTahsilatRaw,
          bayiNetDurum,
          tOzetDevredenBakiye,
          tGiderNormal,
          tHammaddeOdemeleri,
          tHammaddeBorcu,
          hammaddeOdemeDetaySatirlari,
          hammaddeBorcDetaySatirlari,
          bayiBorclari,
          ozetBorcFiltre,
          setOzetBorcFiltre,
          ozetBorcSort,
          setOzetBorcSort,
          personelOzetleri,
          onOpenMiniDetay: setOzetMiniDetay,
          onOpenMusteriEkstre: handleMusteriEkstreAc,
          helpers: { fSayiNoDec },
        });
      case "sut":
        return sekmeBileseniniRenderEt(sutPanelSekmesi.hazirBilesen(), SutPanel, {
          aktifDonem,
          aktifKullaniciEposta,
          aktifKullaniciId: session?.user?.id || null,
          aktifKullaniciKisa,
          isAdmin,
          sutList,
          tedarikciler,
          temaRengi,
          onRefreshSut: () => verileriGetir("sut"),
          onRefreshCop: () => verileriGetir("cop"),
          onPreviewImage: setFisGorselOnizleme,
          onConfirm: confirmDialogAc,
          helpers: {
            fSayi,
            fSayiNoDec,
            veritabaniHatasiMesaji,
            kolonBulunamadiMi,
            dosyaAdiIcinTemizle,
            gorseliYuklemeIcinKucult,
            fisGorselStorageYolu,
            gorselBoyutunuGetir,
            gorselIndirmeAdiBul,
          },
        });
      case "sevkiyat":
        return sekmeBileseniniRenderEt(sevkiyatPanelSekmesi.hazirBilesen(), SevkiyatPanel, {
          aktifKullaniciEposta,
          aktifKullaniciId: session?.user?.id || null,
          aktifKullaniciKisa,
          aktifDonem,
          onRefreshCop: () => verileriGetir("cop"),
          onConfirm: confirmDialogAc,
        });
      case "cek_senet":
        return sekmeBileseniniRenderEt(cekSenetPanelSekmesi.hazirBilesen(), CekSenetPanel, {
          aktifKullaniciKisa,
          aktifDonem,
          onConfirm: confirmDialogAc,
        });
      case "gider":
        return sekmeBileseniniRenderEt(giderPanelSekmesi.hazirBilesen(), GiderPanel, {
          aktifDonem,
          aktifKullaniciEposta,
          aktifKullaniciId: session?.user?.id || null,
          aktifKullaniciKisa,
          giderTurleri,
          periodGider,
          kaydiSilebilirMi,
          kaydiDuzenleyebilirMi,
          onRefreshGiderler: () => verileriGetir("gider"),
          onRefreshCop: () => verileriGetir("cop"),
          onOpenMiniDetay: setOzetMiniDetay,
          onPreviewImage: setFisGorselOnizleme,
          onConfirm: confirmDialogAc,
          helpers: {
            fSayi,
            veritabaniHatasiMesaji,
            kolonBulunamadiMi,
            paraGirdisiniTemizle,
            paraGirdisiniSayiyaCevir,
            paraGirdisiniFormatla,
            dosyaAdiIcinTemizle,
            gorseliYuklemeIcinKucult,
            fisGorselStorageYolu,
            gorselBoyutunuGetir,
            gorselIndirmeAdiBul,
          },
        });
      case "uretim":
        return sekmeBileseniniRenderEt(uretimPanelSekmesi.hazirBilesen(), UretimPanel, {
          aktifDonem,
          aktifKullaniciEposta,
          aktifKullaniciId: session?.user?.id || null,
          aktifKullaniciKisa,
          isAdmin,
          uretimList,
          onRefreshUretim: () => verileriGetir("uretim"),
          onRefreshCop: () => verileriGetir("cop"),
          onConfirm: confirmDialogAc,
          helpers: { fSayi, veritabaniHatasiMesaji },
        });
      case "analiz":
        return sekmeBileseniniRenderEt(analizPanelSekmesi.hazirBilesen(), AnalizPanel, {
          periodSatisList,
          bayiler,
          urunler,
          helpers: { fSayi },
        });
      case "ayarlar":
        return renderAyarlar();
      default:
        return null;
    }
  };

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
    if (tabId === "sevkiyat") return "#ea580c";
    if (tabId === "gider") return "#dc2626";
    if (tabId === "analiz" || tabId === "uretim") return "#8b5cf6";
    if (tabId === "sut") return "#0f766e";
    if (tabId === "ayarlar") return "#64748b";
    if (tabId === "menu") return "#334155";
    return temaRengi;
  };

  const sekmeSec = async (tabId: AppTabId) => {
    setIsFisModalOpen(false);
    resetTahsilatForm();
    setIsTahsilatModalOpen(false);
    setIsBottomMenuOpen(false);

    if (tabId === activeTab) return;

    const gecisIstegi = sekmeGecisIstegiRef.current + 1;
    sekmeGecisIstegiRef.current = gecisIstegi;

    try {
      await sekmeModulunuGetir(tabId);
    } catch (error) {
      if (gecisIstegi === sekmeGecisIstegiRef.current) {
        sekmeYuklemeHatasiniGoster(tabId, error);
      }
      return;
    }

    if (gecisIstegi !== sekmeGecisIstegiRef.current) return;
    setActiveTab(tabId);
  };

  const altMenuyuAcKapat = () => {
    const aciliyor = !isBottomMenuOpen;
    if (aciliyor) {
      sekmeleriOnYukle(altMenuDigerSekmeleri.map((tab) => tab.id));
    }
    setIsBottomMenuOpen(aciliyor);
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
             <option value="KAPAT">Dönemi Kapat</option>
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

      {confirmDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.52)",
            zIndex: 1550,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px",
          }}
          onClick={() => confirmDialogKapat(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "360px",
              background: "#fff",
              borderRadius: "16px",
              border: `1px solid ${confirmDialog.tone === "danger" ? "#fecaca" : confirmDialog.tone === "warning" ? "#fde68a" : "#bfdbfe"}`,
              boxShadow: "0 24px 60px -24px rgba(15,23,42,0.45)",
              overflow: "hidden",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ fontSize: "15px", fontWeight: "bold", color: "#0f172a" }}>
                {confirmDialog.title || "Onay Gerekli"}
              </div>
            </div>
            <div style={{ padding: "16px", color: "#334155", fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {confirmDialog.message}
            </div>
            <div style={{ display: "flex", gap: "8px", padding: "0 16px 16px" }}>
              <button
                onClick={() => confirmDialogKapat(true)}
                style={{
                  flex: 1,
                  padding: "11px 12px",
                  background: confirmDialog.tone === "danger" ? "#dc2626" : confirmDialog.tone === "warning" ? "#d97706" : "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {confirmDialog.confirmText}
              </button>
              <button
                onClick={() => confirmDialogKapat(false)}
                style={{
                  flex: 1,
                  padding: "11px 12px",
                  background: "#f8fafc",
                  color: "#475569",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {confirmDialog.cancelText}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.52)",
            zIndex: 1560,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "360px",
              background: "#fff",
              borderRadius: "16px",
              border: `1px solid ${alertDialog.tone === "danger" ? "#fecaca" : alertDialog.tone === "warning" ? "#fde68a" : "#bfdbfe"}`,
              boxShadow: "0 24px 60px -24px rgba(15,23,42,0.45)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <div style={{ fontSize: "15px", fontWeight: "bold", color: "#0f172a" }}>
                {alertDialog.title || "Uyarı"}
              </div>
            </div>
            <div style={{ padding: "16px", color: "#334155", fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {alertDialog.message}
            </div>
            <div style={{ padding: "0 16px 16px" }}>
              <button
                onClick={alertDialogKapat}
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  background: alertDialog.tone === "danger" ? "#dc2626" : alertDialog.tone === "warning" ? "#d97706" : "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {alertDialog.buttonText}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="main-content">
        <LazySekmeHataSiniri resetKey={activeTab}>
          <Suspense fallback={sekmeYukleniyorFallback}>
            {renderAktifSekme()}
          </Suspense>
        </LazySekmeHataSiniri>

        {isDonemModalOpen && (
          <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.6)', zIndex: 1500, display:'flex', alignItems:'center', justifyContent:'center', padding: '10px'}}>
             <div style={{background:'#fff', padding:'20px', borderRadius:'10px', maxWidth:'300px', width:'100%', boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)"}}>
                 <h3 style={{margin:'0 0 10px', color:'#dc2626', fontSize: '16px'}}>Dönemi Kapat</h3>
                 <p style={{fontSize:'13px', color:'#475569', lineHeight:'1.4'}}>Mevcut dönemi kapatıp yeni aya geçmek istediğinize emin misiniz?<br/><br/><span style={{fontSize: '11px', color: '#94a3b8'}}>(Yeni dönemde bakiyeler sıfırdan başlar, içerideki açık hesaplar yeni döneme otomatik olarak "Devir" fişi şeklinde aktarılır.)</span></p>
                 <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', fontWeight:'bold', marginTop:'15px', cursor:'pointer', color: '#0f172a'}}><input type="checkbox" checked={donemOnay} onChange={e=>setDonemOnay(e.target.checked)} style={{width:'18px', height:'18px'}} /> Onaylıyorum</label>
                 <div style={{display:'flex', gap:'8px', marginTop:'20px'}}><button onClick={handleDonemKapat} disabled={!donemOnay} style={{flex:1, padding:'10px', background: donemOnay ? '#dc2626' : '#fca5a5', border:'none', borderRadius:'6px', fontWeight:'bold', color:'#fff', cursor: donemOnay ? 'pointer' : 'not-allowed'}}>EVET, KAPAT</button><button onClick={()=>{setIsDonemModalOpen(false); setDonemOnay(false);}} style={{flex:1, padding:'10px', background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:'6px', fontWeight:'bold', color:'#475569', cursor: 'pointer'}}>VAZGEÇ</button></div>
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
                 {digerModalConfig.mode !== "view" && <DonemDisiTarihUyarisi tarih={digerForm.tarih} aktifDonem={aktifDonem} />}
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

        {ozetMiniDetay && renderOzetMiniDetay()}

        {fisGorselOnizleme && (
          <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15,23,42,0.86)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1450, padding: "12px" }} onClick={() => setFisGorselOnizleme(null)}>
            <div style={{ width: "100%", maxWidth: "760px", maxHeight: "92vh", background: "#0f172a", borderRadius: "14px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.45)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "#111827", color: "#fff" }}>
                <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ fontWeight: "bold", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fisGorselOnizleme.baslik}</div>
                  {fisGorselOnizleme.boyut ? (
                    <div style={{ fontSize: "11px", color: "#94a3b8", flexShrink: 0 }}>{fisGorselOnizleme.boyut}</div>
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    onClick={handleAcikGorseliIndir}
                    title="İndir"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 9px",
                      borderRadius: "999px",
                      border: "1px solid #334155",
                      background: "#111827",
                      color: "#e2e8f0",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      lineHeight: 1
                    }}
                  >
                    <span style={{ fontSize: "14px", lineHeight: 1 }}>↓</span>
                    <span>İndir</span>
                  </button>
                  <button onClick={() => setFisGorselOnizleme(null)} style={{ background: "none", border: "none", color: "#cbd5e1", fontSize: "20px", cursor: "pointer", lineHeight: 1 }}>✕</button>
                </div>
              </div>
              <div style={{ padding: "8px", overflow: "auto", background: "#020617" }}>
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
                <DonemDisiTarihUyarisi tarih={fisUst.tarih} aktifDonem={aktifDonem} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                  {urunler
                    .filter((u) => {
                      const durum = fisUrunDurumunuGetir(u);
                      return durum.goster && (durum.isVarsayilanUrun || durum.isSutKaymagi);
                    })
                    .sort((a, b) => {
                      const getSira = (urun: Urun) => {
                        if (urunAdiAyniMi(urun.isim, "3 kg yoğurt")) return 1;
                        if (urunAdiAyniMi(urun.isim, "5 kg yoğurt")) return 2;
                        if (urunAdiAyniMi(urun.isim, "Süt kaymağı")) return 3;
                        if (urun.sabit) return 4;
                        return 99;
                      };
                      const siraFarki = getSira(a) - getSira(b);
                      if (siraFarki !== 0) return siraFarki;
                      return a.isim.localeCompare(b.isim, "tr");
                    })
                    .map((u) => fisDetaySatiriniRenderEt(u))}

                  {urunler
                    .filter((u) => {
                      const durum = fisUrunDurumunuGetir(u);
                      return durum.goster && !durum.isVarsayilanUrun && !durum.isSutKaymagi;
                    })
                    .map((u) => fisDetaySatiriniRenderEt(u))}
                  
                  <div style={{ display: "flex", gap: "6px", marginBottom: "4px", marginTop: "4px", flexWrap: "wrap", position: "relative" }}>
                      {(() => {
                        const digerSecenekler = aktifUrunler.filter(u => {
                          const isimLower = urunAdiniNormalizeEt(u.isim);
                          const isVarsayilanUrun = urunAdiAyniMi(u.isim, "3 kg yoğurt") || urunAdiAyniMi(u.isim, "5 kg yoğurt");
                          const isSutKaymagi = urunSutKaymagiMi(u.isim);
                          const isTereyagi = isimLower.includes("tereya");
                          const isYogurtKaymagi = isimLower.includes("yogurt kayma");
                          const isFilled = (Number(fisDetay[u.id]?.adet) > 0 || Number(fisDetay[u.id]?.kg) > 0);
                          if (isVarsayilanUrun || isSutKaymagi || u.sabit || isFilled) return false;
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
                              + Diğer Ürün Ekle
                            </button>
                            {isDigerUrunMenuOpen && (
                              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: "170px", maxWidth: "220px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "8px", boxShadow: "0 12px 24px rgba(15, 23, 42, 0.16)", padding: "6px", zIndex: 5 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "4px",
                                    maxHeight: "180px",
                                    overflowY: "auto",
                                    overscrollBehavior: "contain",
                                    WebkitOverflowScrolling: "touch",
                                    paddingRight: "2px",
                                  }}
                                  onWheel={(event) => event.stopPropagation()}
                                  onTouchMove={(event) => event.stopPropagation()}
                                >
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
                  <select value={fisUst.odeme_turu} onChange={e => setFisUst({ ...fisUst, odeme_turu: e.target.value })} className="m-inp" style={{flex: "0 0 110px", padding: "6px 4px", fontSize: "12px", height: "30px"}}>
                    {ODEME_TURU_SECENEKLERI.map((secenek) => (
                      <option key={secenek.value} value={secenek.value}>{secenek.label}</option>
                    ))}
                  </select>
                  <input placeholder="Açıklama/Not..." value={fisUst.aciklama} onChange={e => setFisUst({ ...fisUst, aciklama: e.target.value })} className="m-inp grow-inp" style={{padding: "6px 8px", fontSize: "12px", height: "30px"}} />
                </div>
                <div style={{display: "flex", gap: "6px", marginTop: "6px", alignItems: "center", flexWrap: "wrap"}}>
                  <input ref={fisGorselKameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFisGorselSec} style={{ display: "none" }} />
                  <input ref={fisGorselGaleriInputRef} type="file" accept="image/*" onChange={handleFisGorselSec} style={{ display: "none" }} />
                  <button
                    type="button"
                    className="btn-anim"
                    onClick={handleFisKameraAc}
                    style={{ background: "#e2e8f0", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 10px", fontSize: "12px", fontWeight: "bold", color: "#334155", cursor: "pointer" }}
                  >
                    {fisGorselDosyaAdi ? "Fotoğrafı Değiştir" : "Fotoğraf Ekle"}
                  </button>
                  <button
                    type="button"
                    className="btn-anim"
                    onClick={handleFisGaleriAc}
                    style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 8px", fontSize: "11px", fontWeight: "bold", color: "#475569", cursor: "pointer" }}
                  >
                    Galeri
                  </button>
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
                      <span>{sonFisData.tarih.split("-").reverse().join(".")}{satisFisSaatiniFormatla(sonFisData.updated_at || sonFisData.created_at) ? ` ${satisFisSaatiniFormatla(sonFisData.updated_at || sonFisData.created_at)}` : ""}</span>
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
                  {fisSilinebilirMi(sonFisData as Partial<SatisFis>) && <button onClick={() => { void handleFisSil({ id: sonFisData.id, fis_no: sonFisData.fis_no, fis_gorseli: sonFisData.fis_gorseli, ekleyen: sonFisData.ekleyen } as any); setSonFisData(null); }} className="btn-anim" style={{ flex: 1, padding: "8px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px" }}>🗑️ SİL</button>}
                </div>
                <button onClick={() => setSonFisData(null)} className="btn-anim" style={{ width: "100%", padding: "8px", background: "transparent", color: "#64748b", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", fontSize: "11px", marginTop: "2px" }}>KAPAT</button>
              </div>
            </div>
          </div>
        )}

        {musteriEkstreData && (
          <div className="print-modal-wrapper" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: "10px" }} onClick={() => setMusteriEkstreData(null)}>
            <div className="print-modal-content" style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "430px", maxHeight: "min(94vh, calc(100dvh - 20px))", borderRadius: "12px", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "14px", overflowY: "auto", flex: 1, minHeight: 0 }}>
              <div id="print-customer-statement" style={{ background: "#fff" }}>
                <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "10px", marginBottom: "10px" }}>
                  <div style={{ fontSize: "20px", fontWeight: "bold", color: "#0f172a" }}>Müşteri Ekstresi</div>
                  <div style={{ fontSize: "14px", color: "#475569", marginTop: "4px" }}>{musteriEkstreData.musteri}</div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{donemMetni(musteriEkstreData.donem)}</div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", tableLayout: "fixed" }}>
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
                      <th style={{ textAlign: "left", padding: "6px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "10px", whiteSpace: "nowrap" }}>Tarih</th>
                      <th style={{ textAlign: "left", padding: "6px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "10px", whiteSpace: "nowrap" }}>Fiş No</th>
                      <th style={{ textAlign: "left", padding: "6px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "10px" }}>
                        <div>Ürün</div>
                        <div style={{ fontSize: "10px", fontWeight: "normal", color: "#94a3b8", marginTop: "1px" }}>(adet/tutar)</div>
                      </th>
                      <th style={{ textAlign: "right", padding: "6px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "10px", whiteSpace: "nowrap" }}>Tutar</th>
                      <th style={{ textAlign: "right", padding: "6px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "10px", whiteSpace: "nowrap" }}>Tahsilat</th>
                      <th style={{ textAlign: "right", padding: "6px 3px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: "bold", fontSize: "10px" }}>Fişten Kalan Borç</th>
                    </tr>
                  </thead>
                  <tbody>
                    {musteriEkstreData.hareketler.length > 0 ? (
                      <>
                        {musteriEkstreData.hareketler.map((hareket, index) => (
                          <tr key={`${hareket.fisNo}-${index}`}>
                            <td style={{ padding: "7px 3px", borderBottom: "1px solid #f1f5f9", fontSize: "10px", whiteSpace: "nowrap" }}>
                              {(() => {
                                const parcalar = String(hareket.tarih || "").split("-");
                                return parcalar.length === 3 ? `${parcalar[2]}.${parcalar[1]}` : hareket.tarih;
                              })()}
                            </td>
                            <td style={{ padding: "7px 3px", borderBottom: "1px solid #f1f5f9", fontSize: "9px", color: "#64748b", whiteSpace: "nowrap" }}>{hareket.fisNo}</td>
                            <td style={{ padding: "7px 3px", borderBottom: "1px solid #f1f5f9", lineHeight: 1.3 }}>
                              {hareket.urunSatirlari.length > 0 ? (
                                hareket.urunSatirlari.map((urun, urunIndex) => (
                                  <div key={`${hareket.fisNo}-${urun.isim}-${urunIndex}`} style={{ marginBottom: urunIndex === hareket.urunSatirlari.length - 1 ? 0 : "3px" }}>
                                    <div style={{ fontSize: "11px", color: "#334155", fontWeight: "bold", whiteSpace: "nowrap" }}>
                                      {urun.isim}
                                    </div>
                                    <div style={{ fontSize: "10px", color: "#64748b", whiteSpace: "nowrap" }}>
                                      ({fSayi(urun.adet)}/{fSayi(urun.tutar)})
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <span style={{ color: "#94a3b8" }}>-</span>
                              )}
                            </td>
                            <td style={{ padding: "7px 3px", borderBottom: "1px solid #f1f5f9", textAlign: "right", color: hareket.tutar > 0 ? "#059669" : "#94a3b8", fontSize: "10px", whiteSpace: "nowrap" }}>{hareket.tutar > 0 ? `${fSayi(hareket.tutar)} ₺` : "-"}</td>
                            <td style={{ padding: "7px 3px", borderBottom: "1px solid #f1f5f9", textAlign: "right", color: hareket.tahsilat > 0 ? "#2563eb" : "#94a3b8", fontSize: "10px", whiteSpace: "nowrap" }}>{hareket.tahsilat > 0 ? `${fSayi(hareket.tahsilat)} ₺` : "-"}</td>
                            <td style={{ padding: "7px 3px", borderBottom: "1px solid #f1f5f9", textAlign: "right", color: hareket.fistenKalanBorc > 0 ? "#dc2626" : "#059669", fontWeight: "bold", fontSize: "10px", whiteSpace: "nowrap" }}>{fSayi(hareket.fistenKalanBorc)} ₺</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3} style={{ padding: "7px 3px 0", fontSize: "10px", color: "#64748b", fontWeight: "bold" }}>Toplam</td>
                          <td style={{ padding: "7px 3px 0", textAlign: "right", fontSize: "10px", color: "#059669", fontWeight: "bold", whiteSpace: "nowrap" }}>{fSayi(musteriEkstreToplamlari.tutar)} ₺</td>
                          <td style={{ padding: "7px 3px 0", textAlign: "right", fontSize: "10px", color: "#2563eb", fontWeight: "bold", whiteSpace: "nowrap" }}>{fSayi(musteriEkstreToplamlari.tahsilat)} ₺</td>
                          <td style={{ padding: "7px 3px 0", textAlign: "right", fontSize: "10px", color: musteriEkstreToplamlari.fistenKalanBorc > 0 ? "#dc2626" : "#059669", fontWeight: "bold", whiteSpace: "nowrap" }}>{fSayi(musteriEkstreToplamlari.fistenKalanBorc)} ₺</td>
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
                  <h3 style={{ margin: "0", color: "#2563eb", fontSize: "15px" }}>{editingTahsilatId ? "💸 Tahsilatı Düzenle" : "💸 Yeni Tahsilat Ekle"}</h3>
                  <button onClick={() => { resetTahsilatForm(); setIsTahsilatModalOpen(false); }} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
               </div>
               <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
                 <div style={{ display: "flex", gap: "8px" }}>
                    <input type="date" value={tahsilatForm.tarih} onChange={e => setTahsilatForm({ ...tahsilatForm, tarih: e.target.value })} className="m-inp date-click" style={{ flex: 1 }} />
                    <button type="button" onClick={() => bayiSecimModalAc("tahsilat")} className="m-inp" style={{ flex: 2, fontWeight: "bold", textAlign: "left", color: tahsilatForm.bayi ? "#0f172a" : "#94a3b8", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: "#fff" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tahsilatForm.bayi || "Müşteri Seç..."}</span>
                      <span style={{ marginLeft: "8px", color: "#64748b", fontSize: "11px" }}>SEÇ</span>
                    </button>
                 </div>
                 <DonemDisiTarihUyarisi tarih={tahsilatForm.tarih} aktifDonem={aktifDonem} />
                 <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{flex: 1}}><label style={{fontSize: "11px", color: "#64748b"}}>Tutar (₺)</label><input type="text" inputMode="decimal" value={paraGirdisiniFormatla(tahsilatForm.miktar)} onChange={e => setTahsilatForm({ ...tahsilatForm, miktar: paraGirdisiniTemizle(e.target.value) })} className="m-inp" style={{width: "100%", textAlign: "right", color: "#059669", fontWeight: "bold"}} /></div>
                    <div style={{flex: 1}}>
                      <label style={{fontSize: "11px", color: "#64748b"}}>Ödeme Türü</label>
                      <select value={tahsilatForm.odeme_turu} onChange={e => setTahsilatForm({ ...tahsilatForm, odeme_turu: e.target.value })} className="m-inp" style={{width: "100%"}}>
                        {ODEME_TURU_SECENEKLERI.filter((secenek) => secenek.value !== "VADE").map((secenek) => (
                          <option key={secenek.value} value={secenek.value}>{secenek.label}</option>
                        ))}
                      </select>
                    </div>
                 </div>
                 <div><label style={{fontSize: "11px", color: "#64748b"}}>Açıklama / Not</label><input placeholder="Opsiyonel..." value={tahsilatForm.aciklama} onChange={e => setTahsilatForm({ ...tahsilatForm, aciklama: e.target.value })} className="m-inp" style={{width: "100%"}} /></div>
               </div>
               <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
                  <button onClick={handleTahsilatKaydet} className="p-btn btn-anim" style={{ background: "#2563eb", width: "100%", height: "45px", fontSize: "15px" }}>{editingTahsilatId ? "GÜNCELLE" : "KAYDET"}</button>
                 </div>
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
              onClick={altMenuyuAcKapat}
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
        .tbl-gider { table-layout: fixed !important; width: 100% !important; min-width: 0 !important; }
        .tbl-gider th { background: #f97316 !important; color: white !important; }
        .tbl-gider th:nth-child(1), .tbl-gider td:nth-child(1) { width: 12%; text-align: center; }
        .tbl-gider th:nth-child(2), .tbl-gider td:nth-child(2) { width: 35%; }
        .tbl-gider th:nth-child(3), .tbl-gider td:nth-child(3) { width: 14%; }
        .tbl-gider th:nth-child(4), .tbl-gider td:nth-child(4) { width: 17%; }
        .tbl-gider th:nth-child(5), .tbl-gider td:nth-child(5) { width: 14%; text-align: center; }
        .tbl-gider th:nth-child(6), .tbl-gider td:nth-child(6) { width: 6%; }
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
          .tbl-gider th:nth-child(1), .tbl-gider td:nth-child(1) { width: 12% !important; }
          .tbl-gider th:nth-child(2), .tbl-gider td:nth-child(2) { width: 33% !important; font-size: 10px !important; }
          .tbl-gider th:nth-child(3), .tbl-gider td:nth-child(3) { width: 14% !important; font-size: 10px !important; }
          .tbl-gider th:nth-child(4), .tbl-gider td:nth-child(4) { width: 20% !important; font-size: 10px !important; }
          .tbl-gider th:nth-child(5), .tbl-gider td:nth-child(5) { width: 15% !important; font-size: 10px !important; }
          .tbl-gider th:nth-child(6), .tbl-gider td:nth-child(6) { width: 6% !important; }
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
          .print-modal-content { max-width: 100% !important; max-height: none !important; overflow: visible !important; border-radius: 0 !important; box-shadow: none !important; }
          #print-receipt { border: none !important; padding: 0 !important; width: 55mm; margin: 0 auto; display: block !important; }
          #print-customer-statement { border: none !important; padding: 0 !important; width: 100%; max-width: 180mm; margin: 0 auto; display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}





