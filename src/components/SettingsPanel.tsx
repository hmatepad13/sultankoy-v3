import { useEffect, useMemo, useState } from "react";
import { AYAR_TAB_TANIMLARI, VARSAYILAN_SEKME_YETKILERI } from "../constants/app";
import { fSayi, normalizeUsername } from "../utils/format";
import type {
  ActiveAyarTab,
  AdminKullanici,
  AppTabId,
  Bayi,
  Ciftlik,
  CopKutusu,
  DepolamaDurumu,
  GiderTuru,
  KullaniciSekmeYetkisi,
  SekmeYetkiMap,
  StartupLogDiagnostics,
  Urun,
} from "../types/app";

interface SettingsPanelProps {
  activeAyarTab: ActiveAyarTab;
  setActiveAyarTab: (tab: ActiveAyarTab) => void;
  aktifKullaniciEposta: string;
  bayiler: Bayi[];
  urunler: Urun[];
  tedarikciler: Ciftlik[];
  giderTuruListesi: GiderTuru[];
  copKutusuList: CopKutusu[];
  yeniAyarDeger: string;
  setYeniAyarDeger: (value: string) => void;
  yeniUrunSabitle: boolean;
  setYeniUrunSabitle: (value: boolean) => void;
  handleAyarEkle: () => void;
  onSettingEdit: (tablo: string, id: string, isim: string) => void;
  onSettingEditGroup: (tablo: string, id: string, isim: string, hesapGrubu?: string | null) => void;
  onSettingToggleActive: (tablo: string, id: string, aktif: boolean) => void;
  onSettingTogglePinned: (id: string, sabit: boolean) => void;
  onSettingDelete: (tablo: string, id: string, isim: string) => void;
  onOpenTrash: () => void;
  onEmptyTrash: () => Promise<void> | void;
  onRestoreTrashItem: (trashId: string) => Promise<void> | void;
  restoringTrashId: string | null;
  onDeleteTrashItem: (trashId: string) => Promise<void> | void;
  deletingTrashId: string | null;
  startupDiagnostics: StartupLogDiagnostics | null;
  isStartupDiagnosticsLoading: boolean;
  startupDiagnosticsError: string;
  onLoadStartupDiagnostics: (force?: boolean) => Promise<void> | void;
  onExcelBackup: () => void;
  onJsonBackup: () => void;
  onHtmlBackup: () => void;
  isBackupLoading: boolean;
  depolamaDurumu: DepolamaDurumu | null;
  isDepolamaLoading: boolean;
  depolamaHata: string;
  onLoadDepolama: (force?: boolean) => void;
  isAdmin: boolean;
  mevcutKullanici: string;
  adminKullanicilar: AdminKullanici[];
  isAdminKullaniciLoading: boolean;
  adminKullaniciHata: string;
  kullaniciListesi: string[];
  tabYetkileri: KullaniciSekmeYetkisi[];
  sekmeSecenekleri: Array<{ id: AppTabId; etiket: string }>;
  yetkiKaynak: "supabase" | "local";
  yetkiUyari: string;
  onChangeOwnPassword: (payload: { oldPassword: string; newPassword: string }) => Promise<{ ok: boolean; message: string }>;
  onLoadAdminUsers: (force?: boolean) => Promise<void> | void;
  onCreateAdminUser: (payload: { email: string; password: string; displayName: string }) => Promise<{ ok: boolean; message: string }>;
  onResetAdminUserPassword: (payload: { userId: string; newPassword: string }) => Promise<{ ok: boolean; message: string }>;
  onDeleteAdminUser: (payload: { userId: string; email: string }) => Promise<{ ok: boolean; message: string }>;
  onSavePermissions: (next: KullaniciSekmeYetkisi[]) => Promise<void> | void;
}

const kartStili = {
  background: "#fff",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "14px",
} as const;

const kayitObjesi = (veri: unknown): Record<string, unknown> | null => {
  if (!veri || typeof veri !== "object" || Array.isArray(veri)) return null;
  return veri as Record<string, unknown>;
};

const metinDegeri = (veri: Record<string, unknown> | null, alan: string) => {
  const deger = veri?.[alan];
  return typeof deger === "string" && deger.trim() ? deger.trim() : "";
};

const sayiDegeri = (veri: Record<string, unknown> | null, alan: string) => {
  const deger = veri?.[alan];
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (typeof deger === "string" && deger.trim() && !Number.isNaN(Number(deger))) return Number(deger);
  return null;
};

const paraMetni = (deger: number | null) => (deger === null ? "" : `${fSayi(deger)} ₺`);

const byteMetni = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const birimler = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let deger = bytes;
  while (deger >= 1000 && index < birimler.length - 1) {
    deger /= 1000;
    index += 1;
  }
  const fractionDigits = deger >= 100 ? 0 : deger >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: fractionDigits }).format(deger)} ${birimler[index]}`;
};

const sayiMetni = (deger: number) =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Number.isFinite(deger) ? deger : 0);

const msMetni = (deger: number) => `${sayiMetni(deger)} ms`;

const tarihSaatMetni = (deger?: string | null) => {
  const tarih = deger ? new Date(deger) : null;
  if (!tarih || Number.isNaN(tarih.getTime())) return "-";
  return tarih.toLocaleString("tr-TR");
};

const taniKartStili = {
  display: "grid",
  gap: "6px",
  padding: "10px",
  borderRadius: "10px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
} as const;

const taniEtiketStili = {
  fontSize: "11px",
  fontWeight: "bold",
  color: "#64748b",
} as const;

const taniDegerStili = {
  fontSize: "12px",
  color: "#0f172a",
  lineHeight: 1.45,
  wordBreak: "break-word",
} as const;

const RESTORE_DESTEKLI_TABLOLAR = new Set([
  "satis_fisleri",
  "sut_giris",
  "giderler",
  "uretim",
  "sevkiyatlar",
]);

const copKutusuOzetiniGetir = (tabloAdi: string, veri: unknown) => {
  const kayit = kayitObjesi(veri);
  if (!kayit) {
    return {
      baslik: "Kayıt özeti alınamadı",
      detay: typeof veri === "string" ? veri : "Ham veri görüntülenemedi.",
    };
  }

  const tarih = metinDegeri(kayit, "tarih");
  const bayi = metinDegeri(kayit, "bayi");
  const fisNo = metinDegeri(kayit, "fis_no");
  const ciftlik = metinDegeri(kayit, "ciftlik");
  const urun = metinDegeri(kayit, "urun");
  const tur = metinDegeri(kayit, "tur");
  const aciklama = metinDegeri(kayit, "aciklama");

  if (tabloAdi === "satis_fisleri") {
    const detaylar = [tarih, bayi, paraMetni(sayiDegeri(kayit, "toplam_tutar")), paraMetni(sayiDegeri(kayit, "kalan_bakiye"))].filter(Boolean);
    return {
      baslik: fisNo || bayi || "Satış fişi",
      detay: detaylar.join(" | ") || "Satış fişi kaydı",
    };
  }

  if (tabloAdi === "satis_giris") {
    const detaylar = [tarih, bayi, urun, paraMetni(sayiDegeri(kayit, "tutar"))].filter(Boolean);
    return {
      baslik: urun || fisNo || "Satış satırı",
      detay: detaylar.join(" | ") || "Satış satırı kaydı",
    };
  }

  if (tabloAdi === "sut_giris") {
    const detaylar = [tarih, ciftlik, `${fSayi(sayiDegeri(kayit, "kg") || 0)} kg`, paraMetni(sayiDegeri(kayit, "toplam_tl"))].filter(Boolean);
    return {
      baslik: ciftlik || "Süt girişi",
      detay: detaylar.join(" | "),
    };
  }

  if (tabloAdi === "giderler") {
    const detaylar = [tarih, tur, paraMetni(sayiDegeri(kayit, "tutar")), aciklama].filter(Boolean);
    return {
      baslik: tur || "Gider kaydı",
      detay: detaylar.join(" | "),
    };
  }

  if (tabloAdi === "uretim") {
    const detaylar = [
      tarih,
      paraMetni(sayiDegeri(kayit, "toplam_maliyet")),
      paraMetni(sayiDegeri(kayit, "kar")),
      aciklama,
    ].filter(Boolean);
    return {
      baslik: tarih ? `${tarih} üretim kaydı` : "Üretim kaydı",
      detay: detaylar.join(" | "),
    };
  }

  const genelDetaylar = [
    tarih,
    bayi,
    ciftlik,
    urun,
    tur,
    aciklama,
    paraMetni(sayiDegeri(kayit, "tutar")),
    paraMetni(sayiDegeri(kayit, "toplam_tutar")),
  ].filter(Boolean);

  return {
    baslik: fisNo || bayi || ciftlik || urun || tur || tabloAdi,
    detay: genelDetaylar.join(" | ") || JSON.stringify(kayit).substring(0, 120),
  };
};

export function SettingsPanel({
  activeAyarTab,
  setActiveAyarTab,
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
  onSettingEdit,
  onSettingEditGroup,
  onSettingToggleActive,
  onSettingTogglePinned,
  onSettingDelete,
  onOpenTrash,
  onEmptyTrash,
  onRestoreTrashItem,
  restoringTrashId,
  onDeleteTrashItem,
  deletingTrashId,
  startupDiagnostics,
  isStartupDiagnosticsLoading,
  startupDiagnosticsError,
  onLoadStartupDiagnostics,
  onExcelBackup,
  onJsonBackup,
  onHtmlBackup,
  isBackupLoading,
  depolamaDurumu,
  isDepolamaLoading,
  depolamaHata,
  onLoadDepolama,
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
  onChangeOwnPassword,
  onLoadAdminUsers,
  onCreateAdminUser,
  onResetAdminUserPassword,
  onDeleteAdminUser,
  onSavePermissions,
}: SettingsPanelProps) {
  const [hedefKullanici, setHedefKullanici] = useState("");
  const [taslakYetkiler, setTaslakYetkiler] = useState<SekmeYetkiMap | null>(null);
  const [sifreForm, setSifreForm] = useState({ eski: "", yeni: "", tekrar: "" });
  const [sifreMesaji, setSifreMesaji] = useState<{ tip: "success" | "error"; metin: string } | null>(null);
  const [isSifreKayitLoading, setIsSifreKayitLoading] = useState(false);
  const [yeniKullaniciForm, setYeniKullaniciForm] = useState({ displayName: "", email: "", password: "" });
  const [sifreSifirlamaForm, setSifreSifirlamaForm] = useState({ userId: "", newPassword: "" });
  const [adminMesaji, setAdminMesaji] = useState<{ tip: "success" | "error"; metin: string } | null>(null);
  const [ayarArama, setAyarArama] = useState("");
  const [isDarEkran, setIsDarEkran] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 720 : false));

  const gosterilecekAyarTablari = useMemo(
    () =>
      AYAR_TAB_TANIMLARI.filter((item) => {
        if (item.id === "performans" || item.id === "yetkiler" || item.id === "kullanici_yonetimi") return isAdmin;
        return true;
      }),
    [isAdmin],
  );

  const aktifAyarListesi = useMemo(() => {
    const liste =
      activeAyarTab === "musteriler"
        ? bayiler
        : activeAyarTab === "urunler"
          ? urunler
          : activeAyarTab === "ciftlikler"
            ? tedarikciler
            : giderTuruListesi;

    return [...liste].sort((a, b) => {
      const aAktif = "aktif" in a ? a.aktif !== false : true;
      const bAktif = "aktif" in b ? b.aktif !== false : true;
      if (aAktif !== bAktif) return aAktif ? -1 : 1;
      return a.isim.localeCompare(b.isim, "tr");
    });
  }, [activeAyarTab, bayiler, giderTuruListesi, urunler, tedarikciler]);

  const gorunenCopKutusuList = useMemo(() => {
    if (isAdmin) return copKutusuList;
    const aktifKullanici = normalizeUsername(aktifKullaniciEposta);
    return copKutusuList.filter((kayit) => {
      const kayitVerisi = kayitObjesi(kayit.veri);
      const silen = normalizeUsername(kayit.silen_email || "");
      const ekleyen = normalizeUsername(metinDegeri(kayitVerisi, "ekleyen"));
      return silen === aktifKullanici || (!silen && ekleyen === aktifKullanici);
    });
  }, [aktifKullaniciEposta, copKutusuList, isAdmin]);

  const filtrelenmisAyarListesi = useMemo(() => {
    const arama = ayarArama.trim().toLocaleLowerCase("tr-TR");
    if (!arama || (activeAyarTab !== "musteriler" && activeAyarTab !== "gider_turleri")) {
      return aktifAyarListesi;
    }

    return aktifAyarListesi.filter((item) => item.isim.toLocaleLowerCase("tr-TR").includes(arama));
  }, [activeAyarTab, aktifAyarListesi, ayarArama]);

  const aktifTabloAdi = useMemo(() => {
    if (activeAyarTab === "musteriler") return "bayiler";
    if (activeAyarTab === "urunler") return "urunler";
    if (activeAyarTab === "ciftlikler") return "ciftlikler";
    return "gider_turleri";
  }, [activeAyarTab]);

  const ayarPlaceholderi = useMemo(() => {
    if (activeAyarTab === "musteriler") return "Yeni müşteri ismi...";
    if (activeAyarTab === "urunler") return "Yeni ürün ismi...";
    if (activeAyarTab === "ciftlikler") return "Yeni çiftlik ismi...";
    return "Yeni gider türü...";
  }, [activeAyarTab]);

  useEffect(() => {
    if (!isAdmin && (activeAyarTab === "performans" || activeAyarTab === "yetkiler" || activeAyarTab === "kullanici_yonetimi")) {
      setActiveAyarTab("hesap");
    }
  }, [activeAyarTab, isAdmin, setActiveAyarTab]);

  useEffect(() => {
    if (isAdmin && activeAyarTab === "kullanici_yonetimi") {
      void onLoadAdminUsers();
    }
  }, [activeAyarTab, isAdmin, onLoadAdminUsers]);

  useEffect(() => {
    if (isAdmin && activeAyarTab === "performans") {
      void onLoadStartupDiagnostics();
    }
  }, [activeAyarTab, isAdmin, onLoadStartupDiagnostics]);

  useEffect(() => {
    const handleResize = () => setIsDarEkran(window.innerWidth <= 720);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSifreDegistir = async () => {
    const eskiSifre = sifreForm.eski.trim();
    const yeniSifre = sifreForm.yeni.trim();
    if (!eskiSifre) {
      setSifreMesaji({ tip: "error", metin: "Eski şifre zorunludur." });
      return;
    }
    if (!yeniSifre) {
      setSifreMesaji({ tip: "error", metin: "Yeni şifre boş bırakılamaz." });
      return;
    }
    if (yeniSifre.length < 6) {
      setSifreMesaji({ tip: "error", metin: "Şifre en az 6 karakter olmalıdır." });
      return;
    }
    if (yeniSifre !== sifreForm.tekrar) {
      setSifreMesaji({ tip: "error", metin: "Şifre tekrar alanı eşleşmiyor." });
      return;
    }

    setIsSifreKayitLoading(true);
    const sonuc = await onChangeOwnPassword({ oldPassword: eskiSifre, newPassword: yeniSifre });
    setSifreMesaji({ tip: sonuc.ok ? "success" : "error", metin: sonuc.message });
    if (sonuc.ok) {
      setSifreForm({ eski: "", yeni: "", tekrar: "" });
    }
    setIsSifreKayitLoading(false);
  };

  const handleAdminKullaniciOlustur = async () => {
    const email = yeniKullaniciForm.email.trim().toLowerCase();
    const password = yeniKullaniciForm.password.trim();
    if (!email || !password) {
      setAdminMesaji({ tip: "error", metin: "E-posta ve şifre zorunludur." });
      return;
    }
    if (password.length < 6) {
      setAdminMesaji({ tip: "error", metin: "Şifre en az 6 karakter olmalıdır." });
      return;
    }
    const sonuc = await onCreateAdminUser({
      email,
      password,
      displayName: yeniKullaniciForm.displayName.trim(),
    });
    setAdminMesaji({ tip: sonuc.ok ? "success" : "error", metin: sonuc.message });
    if (sonuc.ok) {
      setYeniKullaniciForm({ displayName: "", email: "", password: "" });
    }
  };

  const handleAdminSifreGuncelle = async () => {
    if (!sifreSifirlamaForm.userId || !sifreSifirlamaForm.newPassword.trim()) {
      setAdminMesaji({ tip: "error", metin: "Kullanıcı ve yeni şifre alanı zorunludur." });
      return;
    }
    if (sifreSifirlamaForm.newPassword.trim().length < 6) {
      setAdminMesaji({ tip: "error", metin: "Yeni şifre en az 6 karakter olmalıdır." });
      return;
    }

    const sonuc = await onResetAdminUserPassword({
      userId: sifreSifirlamaForm.userId,
      newPassword: sifreSifirlamaForm.newPassword.trim(),
    });
    setAdminMesaji({ tip: sonuc.ok ? "success" : "error", metin: sonuc.message });
    if (sonuc.ok) {
      setSifreSifirlamaForm((prev) => ({ ...prev, newPassword: "" }));
    }
  };

  const handleAdminKullaniciSil = async (kullanici: AdminKullanici) => {
    const hedefEposta = kullanici.email.trim().toLowerCase();
    const aktifEposta = aktifKullaniciEposta.trim().toLowerCase();

    if (hedefEposta && aktifEposta && hedefEposta === aktifEposta) {
      setAdminMesaji({ tip: "error", metin: "Açık olan admin oturumu silinemez." });
      return;
    }

    if (!window.confirm(`${kullanici.email} kullanıcısı silinsin mi? Bu işlem geri alınamaz.`)) {
      return;
    }

    const sonuc = await onDeleteAdminUser({ userId: kullanici.id, email: kullanici.email });
    setAdminMesaji({ tip: sonuc.ok ? "success" : "error", metin: sonuc.message });

    if (sonuc.ok) {
      setSifreSifirlamaForm((prev) => (
        prev.userId === kullanici.id
          ? { userId: "", newPassword: "" }
          : prev
      ));
    }
  };

  const seciliAdminKullanici = useMemo(
    () => adminKullanicilar.find((item) => item.id === sifreSifirlamaForm.userId) || null,
    [adminKullanicilar, sifreSifirlamaForm.userId],
  );

  const hedefKullaniciSec = (value: string) => {
    setHedefKullanici(value);
    const normalized = normalizeUsername(value);

    if (!normalized) {
      setTaslakYetkiler(null);
      return;
    }

    const kayit = tabYetkileri.find((item) => normalizeUsername(item.username) === normalized);
    setTaslakYetkiler(kayit?.tabs || { ...VARSAYILAN_SEKME_YETKILERI });
  };

  const handlePermissionToggle = (tabId: AppTabId) => {
    setTaslakYetkiler((prev) => {
      if (!prev) return prev;
      return { ...prev, [tabId]: !prev[tabId] };
    });
  };

  const handlePermissionSave = async () => {
    const normalized = normalizeUsername(hedefKullanici);
    if (!normalized || !taslakYetkiler) return;

    const next = [...tabYetkileri];
    const index = next.findIndex((item) => normalizeUsername(item.username) === normalized);
    const kayit: KullaniciSekmeYetkisi = {
      username: normalized,
      tabs: taslakYetkiler,
      updatedAt: new Date().toISOString(),
    };

    if (index >= 0) {
      next[index] = kayit;
    } else {
      next.push(kayit);
    }

    await onSavePermissions(next);
  };

  return (
    <div
      className="tab-fade-in main-content-area"
      style={{ display: "flex", gap: "10px", height: "calc(100vh - 160px)", minHeight: "400px" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "96px", flexShrink: 0 }}>
        {gosterilecekAyarTablari.map((tab) => {
          const aktif = activeAyarTab === tab.id;
          const renk = tab.renk || "#0f172a";
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveAyarTab(tab.id);
                if (tab.id === "cop_kutusu") onOpenTrash();
                if (tab.id === "performans") void onLoadStartupDiagnostics();
              }}
              style={{
                padding: "8px 4px",
                borderRadius: "8px",
                background: aktif ? renk : "#fff",
                color: aktif ? "#fff" : renk,
                border: `1px solid ${aktif ? renk : "#cbd5e1"}`,
                fontWeight: "bold",
                cursor: "pointer",
                textAlign: "center",
                fontSize: "11px",
                transition: "all 0.2s",
              }}
            >
              {tab.etiket}
            </button>
          );
        })}

      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden", minHeight: 0 }}>
        {activeAyarTab === "hesap" && (
          <div style={{ display: "grid", gap: "12px", overflowY: "auto" }}>
            <div style={kartStili}>
              <h3 style={{ margin: "0 0 8px", fontSize: "15px", color: "#0f172a" }}>Şifre Değiştir</h3>
              <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "13px", lineHeight: 1.5 }}>
                Oturumdaki kullanıcı: <b>{aktifKullaniciEposta || mevcutKullanici || "-"}</b>
              </p>
              <p style={{ margin: 0, color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>
                Buradan sadece kendi hesabınızın şifresini değiştirebilirsiniz.
              </p>
            </div>

            {sifreMesaji && (
              <div
                style={{
                  ...kartStili,
                  background: sifreMesaji.tip === "success" ? "#ecfdf5" : "#fef2f2",
                  borderColor: sifreMesaji.tip === "success" ? "#86efac" : "#fecaca",
                  color: sifreMesaji.tip === "success" ? "#166534" : "#b91c1c",
                  fontSize: "12px",
                }}
              >
                {sifreMesaji.metin}
              </div>
            )}

            <div style={{ ...kartStili, display: "grid", gap: "10px", maxWidth: "420px" }}>
              <input
                type="password"
                placeholder="Eski şifre"
                value={sifreForm.eski}
                onChange={(event) => setSifreForm((prev) => ({ ...prev, eski: event.target.value }))}
                style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "13px" }}
              />
              <input
                type="password"
                placeholder="Yeni şifre"
                value={sifreForm.yeni}
                onChange={(event) => setSifreForm((prev) => ({ ...prev, yeni: event.target.value }))}
                style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "13px" }}
              />
              <input
                type="password"
                placeholder="Yeni şifre tekrar"
                value={sifreForm.tekrar}
                onChange={(event) => setSifreForm((prev) => ({ ...prev, tekrar: event.target.value }))}
                style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "13px" }}
              />
              <button
                onClick={() => void handleSifreDegistir()}
                disabled={isSifreKayitLoading}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontWeight: "bold",
                  cursor: isSifreKayitLoading ? "wait" : "pointer",
                  fontSize: "13px",
                }}
              >
                {isSifreKayitLoading ? "Kaydediliyor..." : "Şifreyi Değiştir"}
              </button>
            </div>
          </div>
        )}

        {activeAyarTab === "performans" && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", minHeight: 0, paddingRight: "2px" }}>
            <div style={kartStili}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: "0 0 6px", fontSize: "15px", color: "#0f172a" }}>Açılış Performansı</h3>
                  <p style={{ margin: 0, color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>
                    Bu ekran Supabase CLI yerine admin RPC özeti kullanır. Son 2 günün startup logları hızlıca okunur.
                  </p>
                  <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "11px", lineHeight: 1.5 }}>
                    Saklama kuralı: `client/startup` ve `işlem performansı` 14 gün, `hata logları` 60 gün. Temizlik girişlerden sonra arka planda çalışır.
                  </p>
                </div>
                <button
                  onClick={() => void onLoadStartupDiagnostics(true)}
                  disabled={isStartupDiagnosticsLoading}
                  style={{
                    background: "#0f766e",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontWeight: "bold",
                    cursor: isStartupDiagnosticsLoading ? "wait" : "pointer",
                    fontSize: "12px",
                  }}
                >
                  {isStartupDiagnosticsLoading ? "Yükleniyor..." : "Özeti Yenile"}
                </button>
              </div>
            </div>

            {startupDiagnosticsError && (
              <div
                style={{
                  ...kartStili,
                  background: "#fff7ed",
                  borderColor: "#fdba74",
                  color: "#9a3412",
                  fontSize: "12px",
                }}
              >
                {startupDiagnosticsError}
              </div>
            )}

            {startupDiagnostics && (
              <>
                <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                  {[
                    { etiket: "Oturum", deger: sayiMetni(startupDiagnostics.sessionCount), renk: "#0f172a" },
                    { etiket: "Kullanıcı", deger: sayiMetni(startupDiagnostics.userCount), renk: "#2563eb" },
                    { etiket: "Medyan Açılış", deger: msMetni(startupDiagnostics.p50Ms), renk: "#0f766e" },
                    { etiket: "P95 Açılış", deger: msMetni(startupDiagnostics.p95Ms), renk: "#b45309" },
                    { etiket: "En Kötü", deger: msMetni(startupDiagnostics.maxMs), renk: "#dc2626" },
                    { etiket: "5 sn Üstü", deger: sayiMetni(startupDiagnostics.slow5sCount), renk: "#7c3aed" },
                  ].map((item) => (
                    <div key={item.etiket} style={{ ...kartStili, padding: "12px", display: "grid", gap: "5px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "#64748b" }}>{item.etiket}</div>
                      <div style={{ fontSize: "20px", fontWeight: "bold", color: item.renk }}>{item.deger}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                  <div style={{ ...kartStili, display: "grid", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                      <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Gün Özeti</h4>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                        {tarihSaatMetni(startupDiagnostics.generatedAt)}
                      </span>
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {startupDiagnostics.daily.map((gun) => (
                        <div
                          key={gun.gun}
                          style={{
                            display: "grid",
                            gap: "4px",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            fontSize: "12px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                            <span style={{ fontWeight: "bold", color: "#0f172a" }}>{gun.gun}</span>
                            <span style={{ color: "#64748b" }}>{sayiMetni(gun.sessionCount)} oturum</span>
                          </div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", color: "#475569" }}>
                            <span>Medyan: {msMetni(gun.p50Ms)}</span>
                            <span>P95: {msMetni(gun.p95Ms)}</span>
                            <span>Kötü: {msMetni(gun.maxMs)}</span>
                            <span>Yavaş: {sayiMetni(gun.slow5sCount)}</span>
                          </div>
                        </div>
                      ))}
                      {startupDiagnostics.daily.length === 0 && (
                        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                          Son 2 gün için startup kaydı bulunamadı.
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ ...kartStili, display: "grid", gap: "8px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Fetch Deseni</h4>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {startupDiagnostics.fetchPatterns.map((pattern) => (
                        <div
                          key={`${pattern.fetchTableCount}-${pattern.fetchAllCount}-${pattern.firstInteractiveCount}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "8px",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            fontSize: "12px",
                          }}
                        >
                          <div style={{ display: "grid", gap: "4px" }}>
                            <span style={{ fontWeight: "bold", color: "#0f172a" }}>
                              {pattern.fetchTableCount} tablo / {pattern.fetchAllCount} toplam / {pattern.firstInteractiveCount} final
                            </span>
                            <span style={{ color: "#64748b" }}>
                              {sayiMetni(pattern.sessionCount)} oturum
                            </span>
                          </div>
                          <span
                            style={{
                              alignSelf: "center",
                              fontWeight: "bold",
                              color:
                                pattern.fetchTableCount === 11 && pattern.fetchAllCount === 1 && pattern.firstInteractiveCount === 1
                                  ? "#059669"
                                  : "#b45309",
                            }}
                          >
                            {pattern.fetchTableCount === 11 && pattern.fetchAllCount === 1 && pattern.firstInteractiveCount === 1 ? "Normal" : "İncele"}
                          </span>
                        </div>
                      ))}
                      {startupDiagnostics.fetchPatterns.length === 0 && (
                        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                          Fetch paterni bulunamadı.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ ...kartStili, overflowX: isDarEkran ? "visible" : "auto", overflowY: "visible", flexShrink: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Tablo Bazlı Fetch Süresi</h4>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Ortalamaya göre sıralı</span>
                  </div>
                  {isDarEkran ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {startupDiagnostics.tableMetrics.map((item) => (
                        <div key={item.table} style={taniKartStili}>
                          <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>{item.table}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                            <div>
                              <div style={taniEtiketStili}>Örnek</div>
                              <div style={taniDegerStili}>{sayiMetni(item.sampleCount)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Satır Ort.</div>
                              <div style={taniDegerStili}>{sayiMetni(item.avgRowCount)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Ort.</div>
                              <div style={taniDegerStili}>{msMetni(item.avgMs)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>P50</div>
                              <div style={taniDegerStili}>{msMetni(item.p50Ms)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>P95</div>
                              <div style={taniDegerStili}>{msMetni(item.p95Ms)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {startupDiagnostics.tableMetrics.length === 0 && (
                        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                          Tablo bazlı startup verisi yok.
                        </div>
                      )}
                    </div>
                  ) : (
                    <table className="tbl" style={{ minWidth: "100%", tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <th style={{ width: "22%" }}>Tablo</th>
                          <th style={{ width: "12%" }}>Örnek</th>
                          <th style={{ width: "16%" }}>Ort.</th>
                          <th style={{ width: "16%" }}>P50</th>
                          <th style={{ width: "16%" }}>P95</th>
                          <th style={{ width: "18%" }}>Satır Ort.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {startupDiagnostics.tableMetrics.map((item) => (
                          <tr key={item.table}>
                            <td style={{ fontWeight: "bold", color: "#0f172a" }}>{item.table}</td>
                            <td>{sayiMetni(item.sampleCount)}</td>
                            <td>{msMetni(item.avgMs)}</td>
                            <td>{msMetni(item.p50Ms)}</td>
                            <td>{msMetni(item.p95Ms)}</td>
                            <td>{sayiMetni(item.avgRowCount)}</td>
                          </tr>
                        ))}
                        {startupDiagnostics.tableMetrics.length === 0 && (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center", color: "#94a3b8" }}>
                              Tablo bazlı startup verisi yok.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ ...kartStili, overflowX: isDarEkran ? "visible" : "auto", overflowY: "visible", flexShrink: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Son Açılış Oturumları</h4>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>En yeni oturumlar</span>
                  </div>
                  {isDarEkran ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {startupDiagnostics.recentSessions.map((oturum) => (
                        <div key={`${oturum.sessionId}-${oturum.createdAt}`} style={taniKartStili}>
                          <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>
                            {oturum.userEmail || "-"}
                          </div>
                          <div style={taniEtiketStili}>{tarihSaatMetni(oturum.createdAt)}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                            <div>
                              <div style={taniEtiketStili}>Dönem</div>
                              <div style={taniDegerStili}>{oturum.aktifDonem || "-"}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Sekme</div>
                              <div style={taniDegerStili}>{oturum.activeTab || "-"}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Toplam</div>
                              <div style={taniDegerStili}>{msMetni(oturum.durationMs)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Fetch</div>
                              <div style={taniDegerStili}>{msMetni(oturum.fetchMs)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Render</div>
                              <div style={taniDegerStili}>{msMetni(oturum.renderMs)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {startupDiagnostics.recentSessions.length === 0 && (
                        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                          Görüntülenecek startup oturumu yok.
                        </div>
                      )}
                    </div>
                  ) : (
                    <table className="tbl" style={{ minWidth: "100%", tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <th style={{ width: "24%" }}>Zaman</th>
                          <th style={{ width: "18%" }}>Kullanıcı</th>
                          <th style={{ width: "10%" }}>Dönem</th>
                          <th style={{ width: "12%" }}>Toplam</th>
                          <th style={{ width: "12%" }}>Fetch</th>
                          <th style={{ width: "12%" }}>Render</th>
                          <th style={{ width: "12%" }}>Sekme</th>
                        </tr>
                      </thead>
                      <tbody>
                        {startupDiagnostics.recentSessions.map((oturum) => (
                          <tr key={`${oturum.sessionId}-${oturum.createdAt}`}>
                            <td>{tarihSaatMetni(oturum.createdAt)}</td>
                            <td style={{ fontWeight: "bold", color: "#0f172a" }}>{oturum.userEmail || "-"}</td>
                            <td>{oturum.aktifDonem || "-"}</td>
                            <td>{msMetni(oturum.durationMs)}</td>
                            <td>{msMetni(oturum.fetchMs)}</td>
                            <td>{msMetni(oturum.renderMs)}</td>
                            <td>{oturum.activeTab || "-"}</td>
                          </tr>
                        ))}
                        {startupDiagnostics.recentSessions.length === 0 && (
                          <tr>
                            <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8" }}>
                              Görüntülenecek startup oturumu yok.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                  <div style={{ ...kartStili, padding: "12px", display: "grid", gap: "5px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "bold", color: "#64748b" }}>İşlem Performans Logu</div>
                    <div style={{ fontSize: "20px", fontWeight: "bold", color: "#2563eb" }}>{sayiMetni(startupDiagnostics.appPerformanceCount)}</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>Son {startupDiagnostics.daily.length > 0 ? "2 gün" : "dönem"} performans kaydı</div>
                  </div>
                  <div style={{ ...kartStili, padding: "12px", display: "grid", gap: "5px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "bold", color: "#64748b" }}>Hata Logu</div>
                    <div style={{ fontSize: "20px", fontWeight: "bold", color: "#dc2626" }}>{sayiMetni(startupDiagnostics.appErrorCount)}</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>Son 30 gün hata kaydı</div>
                  </div>
                </div>

                <div style={{ ...kartStili, overflowX: isDarEkran ? "visible" : "auto", overflowY: "visible", flexShrink: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>İşlem Performansı</h4>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Eski app_performans_loglari özeti</span>
                  </div>
                  {isDarEkran ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {startupDiagnostics.appPerformanceMetrics.map((item) => (
                        <div key={`${item.olay}-${item.kategori}-${item.sonuc}`} style={taniKartStili}>
                          <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>{item.olay}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                            <div>
                              <div style={taniEtiketStili}>Kategori</div>
                              <div style={taniDegerStili}>{item.kategori || "-"}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Sonuç</div>
                              <div style={taniDegerStili}>{item.sonuc || "-"}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Adet</div>
                              <div style={taniDegerStili}>{sayiMetni(item.sampleCount)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Yenileme</div>
                              <div style={taniDegerStili}>{msMetni(item.avgYenilemeMs)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Ort.</div>
                              <div style={taniDegerStili}>{msMetni(item.avgMs)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>P50</div>
                              <div style={taniDegerStili}>{msMetni(item.p50Ms)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>P95</div>
                              <div style={taniDegerStili}>{msMetni(item.p95Ms)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {startupDiagnostics.appPerformanceMetrics.length === 0 && (
                        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                          İşlem performans kaydı bulunamadı.
                        </div>
                      )}
                    </div>
                  ) : (
                    <table className="tbl" style={{ minWidth: "100%", tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <th style={{ width: "22%" }}>Olay</th>
                          <th style={{ width: "10%" }}>Kategori</th>
                          <th style={{ width: "10%" }}>Sonuç</th>
                          <th style={{ width: "10%" }}>Adet</th>
                          <th style={{ width: "12%" }}>Ort.</th>
                          <th style={{ width: "12%" }}>P50</th>
                          <th style={{ width: "12%" }}>P95</th>
                          <th style={{ width: "12%" }}>Yenileme</th>
                        </tr>
                      </thead>
                      <tbody>
                        {startupDiagnostics.appPerformanceMetrics.map((item) => (
                          <tr key={`${item.olay}-${item.kategori}-${item.sonuc}`}>
                            <td style={{ fontWeight: "bold", color: "#0f172a" }}>{item.olay}</td>
                            <td>{item.kategori || "-"}</td>
                            <td>{item.sonuc || "-"}</td>
                            <td>{sayiMetni(item.sampleCount)}</td>
                            <td>{msMetni(item.avgMs)}</td>
                            <td>{msMetni(item.p50Ms)}</td>
                            <td>{msMetni(item.p95Ms)}</td>
                            <td>{msMetni(item.avgYenilemeMs)}</td>
                          </tr>
                        ))}
                        {startupDiagnostics.appPerformanceMetrics.length === 0 && (
                          <tr>
                            <td colSpan={8} style={{ textAlign: "center", color: "#94a3b8" }}>
                              İşlem performans kaydı bulunamadı.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ ...kartStili, overflowX: isDarEkran ? "visible" : "auto", overflowY: "visible", flexShrink: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Son İşlem Performans Kayıtları</h4>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>En yeni kayıtlar</span>
                  </div>
                  {isDarEkran ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {startupDiagnostics.appPerformanceRecent.map((item) => (
                        <div key={`${item.createdAt}-${item.olay}-${item.userEmail}`} style={taniKartStili}>
                          <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>{item.olay}</div>
                          <div style={taniEtiketStili}>{tarihSaatMetni(item.createdAt)}</div>
                          <div style={{ ...taniDegerStili, fontWeight: "bold" }}>{item.userEmail || "-"}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                            <div>
                              <div style={taniEtiketStili}>Sonuç</div>
                              <div style={taniDegerStili}>{item.sonuc || "-"}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Toplam</div>
                              <div style={taniDegerStili}>{msMetni(item.toplamMs)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Kayıt</div>
                              <div style={taniDegerStili}>{msMetni(item.kayitMs)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Yenileme</div>
                              <div style={taniDegerStili}>{msMetni(item.yenilemeMs)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {startupDiagnostics.appPerformanceRecent.length === 0 && (
                        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                          Gösterilecek işlem performans kaydı yok.
                        </div>
                      )}
                    </div>
                  ) : (
                    <table className="tbl" style={{ minWidth: "100%", tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <th style={{ width: "22%" }}>Zaman</th>
                          <th style={{ width: "18%" }}>Kullanıcı</th>
                          <th style={{ width: "18%" }}>Olay</th>
                          <th style={{ width: "10%" }}>Sonuç</th>
                          <th style={{ width: "10%" }}>Toplam</th>
                          <th style={{ width: "10%" }}>Kayıt</th>
                          <th style={{ width: "12%" }}>Yenileme</th>
                        </tr>
                      </thead>
                      <tbody>
                        {startupDiagnostics.appPerformanceRecent.map((item) => (
                          <tr key={`${item.createdAt}-${item.olay}-${item.userEmail}`}>
                            <td>{tarihSaatMetni(item.createdAt)}</td>
                            <td style={{ fontWeight: "bold", color: "#0f172a" }}>{item.userEmail || "-"}</td>
                            <td>{item.olay}</td>
                            <td>{item.sonuc || "-"}</td>
                            <td>{msMetni(item.toplamMs)}</td>
                            <td>{msMetni(item.kayitMs)}</td>
                            <td>{msMetni(item.yenilemeMs)}</td>
                          </tr>
                        ))}
                        {startupDiagnostics.appPerformanceRecent.length === 0 && (
                          <tr>
                            <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8" }}>
                              Gösterilecek işlem performans kaydı yok.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ ...kartStili, overflowX: isDarEkran ? "visible" : "auto", overflowY: "visible", flexShrink: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Hata Grupları</h4>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Eski app_hata_loglari özeti</span>
                  </div>
                  {isDarEkran ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {startupDiagnostics.appErrorMetrics.map((item) => (
                        <div key={`${item.islem}-${item.kategori}-${item.seviye}`} style={taniKartStili}>
                          <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>{item.islem || "-"}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
                            <div>
                              <div style={taniEtiketStili}>Kategori</div>
                              <div style={taniDegerStili}>{item.kategori || "-"}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Seviye</div>
                              <div style={taniDegerStili}>{item.seviye || "-"}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Adet</div>
                              <div style={taniDegerStili}>{sayiMetni(item.count)}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Durum</div>
                              <div style={{ ...taniDegerStili, color: item.count > 0 ? "#dc2626" : "#059669", fontWeight: "bold" }}>
                                {item.count > 0 ? "İncele" : "Temiz"}
                              </div>
                            </div>
                          </div>
                          <div>
                            <div style={taniEtiketStili}>Son Kayıt</div>
                            <div style={taniDegerStili}>{tarihSaatMetni(item.latestAt)}</div>
                          </div>
                        </div>
                      ))}
                      {startupDiagnostics.appErrorMetrics.length === 0 && (
                        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                          Hata özeti bulunamadı.
                        </div>
                      )}
                    </div>
                  ) : (
                    <table className="tbl" style={{ minWidth: "100%", tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <th style={{ width: "22%" }}>İşlem</th>
                          <th style={{ width: "16%" }}>Kategori</th>
                          <th style={{ width: "12%" }}>Seviye</th>
                          <th style={{ width: "10%" }}>Adet</th>
                          <th style={{ width: "20%" }}>Son Kayıt</th>
                          <th style={{ width: "20%" }}>Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {startupDiagnostics.appErrorMetrics.map((item) => (
                          <tr key={`${item.islem}-${item.kategori}-${item.seviye}`}>
                            <td style={{ fontWeight: "bold", color: "#0f172a" }}>{item.islem || "-"}</td>
                            <td>{item.kategori || "-"}</td>
                            <td>{item.seviye || "-"}</td>
                            <td>{sayiMetni(item.count)}</td>
                            <td>{tarihSaatMetni(item.latestAt)}</td>
                            <td style={{ color: item.count > 0 ? "#dc2626" : "#059669", fontWeight: "bold" }}>{item.count > 0 ? "İncele" : "Temiz"}</td>
                          </tr>
                        ))}
                        {startupDiagnostics.appErrorMetrics.length === 0 && (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center", color: "#94a3b8" }}>
                              Hata özeti bulunamadı.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ ...kartStili, overflowX: isDarEkran ? "visible" : "auto", overflowY: "visible", flexShrink: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Son Hata Kayıtları</h4>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>En yeni hata kayıtları</span>
                  </div>
                  {isDarEkran ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {startupDiagnostics.appErrorRecent.map((item) => (
                        <div key={`${item.createdAt}-${item.islem}-${item.userEmail}`} style={taniKartStili}>
                          <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>{item.islem || "-"}</div>
                          <div style={taniEtiketStili}>{tarihSaatMetni(item.createdAt)}</div>
                          <div style={{ ...taniDegerStili, fontWeight: "bold" }}>{item.userEmail || "-"}</div>
                          <div style={{ display: "grid", gap: "6px" }}>
                            <div>
                              <div style={taniEtiketStili}>Kategori</div>
                              <div style={taniDegerStili}>{item.kategori || "-"}</div>
                            </div>
                            <div>
                              <div style={taniEtiketStili}>Mesaj</div>
                              <div style={taniDegerStili}>{item.mesaj || "-"}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {startupDiagnostics.appErrorRecent.length === 0 && (
                        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                          Son hata kaydı bulunamadı.
                        </div>
                      )}
                    </div>
                  ) : (
                    <table className="tbl" style={{ minWidth: "100%", tableLayout: "fixed" }}>
                      <thead>
                        <tr>
                          <th style={{ width: "22%" }}>Zaman</th>
                          <th style={{ width: "16%" }}>Kullanıcı</th>
                          <th style={{ width: "16%" }}>İşlem</th>
                          <th style={{ width: "12%" }}>Kategori</th>
                          <th style={{ width: "34%" }}>Mesaj</th>
                        </tr>
                      </thead>
                      <tbody>
                        {startupDiagnostics.appErrorRecent.map((item) => (
                          <tr key={`${item.createdAt}-${item.islem}-${item.userEmail}`}>
                            <td>{tarihSaatMetni(item.createdAt)}</td>
                            <td style={{ fontWeight: "bold", color: "#0f172a" }}>{item.userEmail || "-"}</td>
                            <td>{item.islem || "-"}</td>
                            <td>{item.kategori || "-"}</td>
                            <td title={item.mesaj} style={{ color: "#475569" }}>{item.mesaj || "-"}</td>
                          </tr>
                        ))}
                        {startupDiagnostics.appErrorRecent.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ textAlign: "center", color: "#94a3b8" }}>
                              Son hata kaydı bulunamadı.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {isStartupDiagnosticsLoading && !startupDiagnostics && (
              <div style={{ ...kartStili, textAlign: "center", color: "#64748b", fontSize: "12px" }}>
                Startup performans özeti yükleniyor...
              </div>
            )}
          </div>
        )}

        {activeAyarTab === "kullanici_yonetimi" && isAdmin && (
          <div style={{ display: "grid", gap: "12px", overflowY: "auto" }}>
            <div style={kartStili}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: "0 0 6px", fontSize: "15px", color: "#0f172a" }}>Kullanıcı Yönetimi</h3>
                  <p style={{ margin: 0, color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>
                    Admin burada mevcut kullanıcıları görebilir, yeni kullanıcı ekleyebilir, şifre değiştirebilir ve kullanıcı silebilir.
                  </p>
                </div>
                <button
                  onClick={() => void onLoadAdminUsers(true)}
                  disabled={isAdminKullaniciLoading}
                  style={{
                    background: "#0f766e",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontWeight: "bold",
                    cursor: isAdminKullaniciLoading ? "wait" : "pointer",
                    fontSize: "12px",
                  }}
                >
                  {isAdminKullaniciLoading ? "Yükleniyor..." : "Listeyi Yenile"}
                </button>
              </div>
            </div>

            {adminMesaji && (
              <div
                style={{
                  ...kartStili,
                  background: adminMesaji.tip === "success" ? "#ecfdf5" : "#fef2f2",
                  borderColor: adminMesaji.tip === "success" ? "#86efac" : "#fecaca",
                  color: adminMesaji.tip === "success" ? "#166534" : "#b91c1c",
                  fontSize: "12px",
                }}
              >
                {adminMesaji.metin}
              </div>
            )}

            {adminKullaniciHata && (
              <div
                style={{
                  ...kartStili,
                  background: "#fff7ed",
                  borderColor: "#fdba74",
                  color: "#9a3412",
                  fontSize: "12px",
                }}
              >
                {adminKullaniciHata}
              </div>
            )}

            <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <div style={{ ...kartStili, display: "grid", gap: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Yeni Kullanıcı Ekle</h4>
                <input
                  placeholder="Ad soyad (opsiyonel)"
                  value={yeniKullaniciForm.displayName}
                  onChange={(event) => setYeniKullaniciForm((prev) => ({ ...prev, displayName: event.target.value }))}
                  style={{ padding: "9px 11px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "13px" }}
                />
                <input
                  placeholder="E-posta"
                  value={yeniKullaniciForm.email}
                  onChange={(event) => setYeniKullaniciForm((prev) => ({ ...prev, email: event.target.value }))}
                  style={{ padding: "9px 11px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "13px" }}
                />
                <input
                  type="password"
                  placeholder="Geçici şifre"
                  value={yeniKullaniciForm.password}
                  onChange={(event) => setYeniKullaniciForm((prev) => ({ ...prev, password: event.target.value }))}
                  style={{ padding: "9px 11px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "13px" }}
                />
                <button
                  onClick={() => void handleAdminKullaniciOlustur()}
                  disabled={isAdminKullaniciLoading}
                  style={{
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontWeight: "bold",
                    cursor: isAdminKullaniciLoading ? "wait" : "pointer",
                    fontSize: "13px",
                  }}
                >
                  Kullanıcı Ekle
                </button>
              </div>

              <div style={{ ...kartStili, display: "grid", gap: "10px" }}>
                <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Kullanıcı Şifresi Değiştir</h4>
                <select
                  value={sifreSifirlamaForm.userId}
                  onChange={(event) => setSifreSifirlamaForm((prev) => ({ ...prev, userId: event.target.value }))}
                  style={{ padding: "9px 11px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "13px", background: "#fff" }}
                >
                  <option value="">Kullanıcı seçin</option>
                  {adminKullanicilar.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.email}
                    </option>
                  ))}
                </select>
                {seciliAdminKullanici && (
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    <div><b>Kullanıcı:</b> {seciliAdminKullanici.email}</div>
                    {seciliAdminKullanici.role && <div><b>Rol:</b> {seciliAdminKullanici.role}</div>}
                  </div>
                )}
                <input
                  type="password"
                  placeholder="Yeni şifre"
                  value={sifreSifirlamaForm.newPassword}
                  onChange={(event) => setSifreSifirlamaForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                  style={{ padding: "9px 11px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "13px" }}
                />
                <button
                  onClick={() => void handleAdminSifreGuncelle()}
                  disabled={isAdminKullaniciLoading}
                  style={{
                    background: "#0f766e",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontWeight: "bold",
                    cursor: isAdminKullaniciLoading ? "wait" : "pointer",
                    fontSize: "13px",
                  }}
                >
                  Şifreyi Güncelle
                </button>
              </div>
            </div>

            <div style={{ ...kartStili, display: "grid", gap: "8px" }}>
              <h4 style={{ margin: 0, fontSize: "14px", color: "#0f172a" }}>Mevcut Kullanıcılar</h4>
              <div style={{ display: "grid", gap: "8px" }}>
                {adminKullanicilar.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "10px",
                      padding: "9px 10px",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: "bold", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis" }}>{item.email}</div>
                      <div style={{ color: "#64748b" }}>
                        {(item.displayName || item.username || "-")}{item.role ? ` • ${item.role}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <div style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString("tr-TR") : "-"}
                      </div>
                      <button
                        onClick={() => setSifreSifirlamaForm((prev) => ({ ...prev, userId: item.id }))}
                        disabled={isAdminKullaniciLoading}
                        style={{
                          background: "#e0f2fe",
                          color: "#0369a1",
                          border: "1px solid #bae6fd",
                          borderRadius: "7px",
                          padding: "6px 9px",
                          fontWeight: "bold",
                          cursor: isAdminKullaniciLoading ? "wait" : "pointer",
                          fontSize: "11px",
                        }}
                      >
                        Şifre
                      </button>
                      <button
                        onClick={() => void handleAdminKullaniciSil(item)}
                        disabled={isAdminKullaniciLoading || item.email.trim().toLowerCase() === aktifKullaniciEposta.trim().toLowerCase()}
                        style={{
                          background: item.email.trim().toLowerCase() === aktifKullaniciEposta.trim().toLowerCase() ? "#e2e8f0" : "#fee2e2",
                          color: item.email.trim().toLowerCase() === aktifKullaniciEposta.trim().toLowerCase() ? "#64748b" : "#b91c1c",
                          border: `1px solid ${item.email.trim().toLowerCase() === aktifKullaniciEposta.trim().toLowerCase() ? "#cbd5e1" : "#fecaca"}`,
                          borderRadius: "7px",
                          padding: "6px 9px",
                          fontWeight: "bold",
                          cursor: isAdminKullaniciLoading || item.email.trim().toLowerCase() === aktifKullaniciEposta.trim().toLowerCase() ? "not-allowed" : "pointer",
                          fontSize: "11px",
                        }}
                        title={item.email.trim().toLowerCase() === aktifKullaniciEposta.trim().toLowerCase() ? "Açık olan hesabı silemezsiniz." : "Kullanıcıyı sil"}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
                {adminKullanicilar.length === 0 && (
                  <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                    {isAdminKullaniciLoading ? "Kullanıcılar yükleniyor..." : "Henüz kullanıcı bulunamadı."}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {(activeAyarTab === "musteriler" || activeAyarTab === "urunler" || activeAyarTab === "ciftlikler" || activeAyarTab === "gider_turleri") && (
          <>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                placeholder={ayarPlaceholderi}
                value={yeniAyarDeger}
                onChange={(event) => setYeniAyarDeger(event.target.value)}
                style={{
                  flex: "1 1 180px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  outline: "none",
                  fontSize: "13px",
                }}
              />
              {activeAyarTab === "urunler" && (
                <button
                  onClick={() => setYeniUrunSabitle(!yeniUrunSabitle)}
                  style={{
                    background: yeniUrunSabitle ? "#ecfdf5" : "#f8fafc",
                    color: yeniUrunSabitle ? "#047857" : "#475569",
                    border: `1px solid ${yeniUrunSabitle ? "#86efac" : "#cbd5e1"}`,
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                    flex: "0 0 auto",
                  }}
                  title="Yeni ürün satış fişinde sabit ürün olarak görünsün mü?"
                >
                  {yeniUrunSabitle ? "Sabitlenecek" : "Sabitle"}
                </button>
              )}
              <button
                onClick={handleAyarEkle}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "13px",
                  whiteSpace: "nowrap",
                  flex: "0 0 auto",
                }}
              >
                Ekle
              </button>
            </div>

            {(activeAyarTab === "musteriler" || activeAyarTab === "gider_turleri") && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <input
                  placeholder={activeAyarTab === "musteriler" ? "Müşteri ara..." : "Gider türü ara..."}
                  value={ayarArama}
                  onChange={(event) => setAyarArama(event.target.value)}
                  style={{
                    width: "100%",
                    maxWidth: "220px",
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                    fontSize: "12px",
                    background: "#fff",
                  }}
                />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", paddingRight: "4px" }}>
              {filtrelenmisAyarListesi.map((item) => (
                (() => {
                  const aktif = "aktif" in item ? item.aktif !== false : true;
                  const pasifDestekli = activeAyarTab === "musteriler" || activeAyarTab === "urunler" || activeAyarTab === "ciftlikler";
                  const adminSilmeDestekli = isAdmin && (activeAyarTab === "musteriler" || activeAyarTab === "urunler");
                  return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: aktif ? "#fff" : "#f8fafc",
                    border: `1px solid ${aktif ? "#cbd5e1" : "#e2e8f0"}`,
                    borderRadius: "8px",
                    opacity: aktif ? 1 : 0.82,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                    <span style={{ fontWeight: "bold", color: "#475569", fontSize: "12px" }}>
                      {item.isim}
                      {activeAyarTab === "urunler" && "fiyat" in item && item.fiyat
                        ? ` (${fSayi((item as Urun).fiyat)} ₺)`
                        : ""}
                    </span>
                    {activeAyarTab === "urunler" && (
                      <span
                        style={{
                          background: (item as Urun).sabit ? "#eff6ff" : "#f8fafc",
                          color: (item as Urun).sabit ? "#2563eb" : "#64748b",
                          border: `1px solid ${(item as Urun).sabit ? "#bfdbfe" : "#e2e8f0"}`,
                          borderRadius: "999px",
                          padding: "1px 6px",
                          fontSize: "10px",
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {(item as Urun).sabit ? "Sabit" : "Normal"}
                      </span>
                    )}
                    {activeAyarTab === "musteriler" && Boolean((item as Bayi).hesap_grubu) && (
                      <span
                        style={{
                          background: "#fff7ed",
                          color: "#c2410c",
                          border: "1px solid #fdba74",
                          borderRadius: "999px",
                          padding: "1px 6px",
                          fontSize: "10px",
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                        }}
                        title={`Hesap grubu: ${(item as Bayi).hesap_grubu}`}
                      >
                        {(item as Bayi).hesap_grubu}
                      </span>
                    )}
                    {pasifDestekli && (
                      <span
                        style={{
                          background: aktif ? "#ecfdf5" : "#fef2f2",
                          color: aktif ? "#059669" : "#dc2626",
                          border: `1px solid ${aktif ? "#a7f3d0" : "#fecaca"}`,
                          borderRadius: "999px",
                          padding: "1px 6px",
                          fontSize: "10px",
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {aktif ? "Aktif" : "Pasif"}
                      </span>
                    )}


                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {activeAyarTab === "urunler" && (
                      <button
                        onClick={() => onSettingTogglePinned(item.id, Boolean((item as Urun).sabit))}
                        style={{
                          background: (item as Urun).sabit ? "#eff6ff" : "#f8fafc",
                          border: `1px solid ${(item as Urun).sabit ? "#bfdbfe" : "#cbd5e1"}`,
                          color: (item as Urun).sabit ? "#2563eb" : "#475569",
                          borderRadius: "6px",
                          minWidth: "64px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontWeight: "bold",
                          padding: "0 8px",
                          whiteSpace: "nowrap",
                        }}
                        title={(item as Urun).sabit ? "Sabit ürünü kaldır" : "Ürünü sabitle"}
                      >
                        {(item as Urun).sabit ? "Sabitten Çık" : "Sabitle"}
                      </button>
                    )}
                    <button
                      onClick={() => onSettingEdit(aktifTabloAdi, item.id, item.isim)}
                      style={{
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        color: "#2563eb",
                        borderRadius: "4px",
                        width: "24px",
                        height: "24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                      title="Düzenle"
                    >
                      ✎
                    </button>
                    {activeAyarTab === "musteriler" && (
                      <button
                        onClick={() => onSettingEditGroup(aktifTabloAdi, item.id, item.isim, (item as Bayi).hesap_grubu)}
                        style={{
                          background: "#fff7ed",
                          border: "1px solid #fdba74",
                          color: "#c2410c",
                          borderRadius: "6px",
                          minWidth: "48px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontWeight: "bold",
                          padding: "0 8px",
                          whiteSpace: "nowrap",
                        }}
                        title="Hesap grubunu düzenle"
                      >
                        Grup
                      </button>
                    )}
                    {pasifDestekli ? (
                      <button
                        onClick={() => onSettingToggleActive(aktifTabloAdi, item.id, aktif)}
                        style={{
                          background: aktif ? "#fef2f2" : "#ecfdf5",
                          border: `1px solid ${aktif ? "#fecaca" : "#a7f3d0"}`,
                          color: aktif ? "#dc2626" : "#059669",
                          borderRadius: "6px",
                          minWidth: "56px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontWeight: "bold",
                          padding: "0 8px",
                          whiteSpace: "nowrap",
                        }}
                        title={aktif ? "Pasif yap" : "Aktif yap"}
                      >
                        {aktif ? "Pasif Yap" : "Aktif Yap"}
                      </button>
                    ) : (
                      <button
                        onClick={() => onSettingDelete(aktifTabloAdi, item.id, item.isim)}
                        style={{
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          color: "#dc2626",
                          borderRadius: "4px",
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                        title="Sil"
                      >
                        ✕
                      </button>
                    )}
                    {adminSilmeDestekli && (
                      <button
                        onClick={() => onSettingDelete(aktifTabloAdi, item.id, item.isim)}
                        style={{
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          color: "#dc2626",
                          borderRadius: "4px",
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                        title="Sil"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
                  );
                })()
              ))}

              {filtrelenmisAyarListesi.length === 0 && (
                <div style={{ textAlign: "center", color: "#94a3b8", marginTop: "20px", fontSize: "13px" }}>
                  Kayıt bulunamadı.
                </div>
              )}
            </div>
          </>
        )}

        {activeAyarTab === "yedekleme" && (
          <div style={{ display: "grid", gap: "12px", overflowY: "auto" }}>
            <div style={kartStili}>
              <h3 style={{ margin: "0 0 8px", fontSize: "15px", color: "#0f172a" }}>Veri Yedekleme</h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px", lineHeight: 1.5 }}>
                Excel yedeği kullanıcının ekranda gördüğü sade tablo görünümünü ayrı sayfalara böler. JSON yedeği ise tam veri dökümünü alır.
              </p>
            </div>
            <div style={{ ...kartStili, display: "grid", gap: "10px" }}>
              <button
                onClick={onHtmlBackup}
                disabled={isBackupLoading}
                style={{
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  fontWeight: "bold",
                  cursor: isBackupLoading ? "wait" : "pointer",
                }}
              >
                {isBackupLoading ? "Hazirlaniyor..." : "HTML Rapor Yedegi Indir"}
              </button>
              <button
                onClick={onExcelBackup}
                disabled={isBackupLoading}
                style={{
                  background: "#0f766e",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  fontWeight: "bold",
                  cursor: isBackupLoading ? "wait" : "pointer",
                }}
              >
                {isBackupLoading ? "Hazırlanıyor..." : "Excel Yedeği İndir"}
              </button>
              <button
                onClick={onJsonBackup}
                disabled={isBackupLoading}
                style={{
                  background: "#1d4ed8",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  fontWeight: "bold",
                  cursor: isBackupLoading ? "wait" : "pointer",
                }}
              >
                {isBackupLoading ? "Hazırlanıyor..." : "JSON Yedeği İndir"}
              </button>
            </div>
          </div>
        )}

        {activeAyarTab === "depolama" && (
          <div style={{ display: "grid", gap: "12px", overflowY: "auto" }}>
            <div style={kartStili}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "15px", color: "#0f172a" }}>Depolama Durumu</h3>
                <button
                  onClick={() => onLoadDepolama(true)}
                  disabled={isDepolamaLoading}
                  style={{
                    background: "#0369a1",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "7px 12px",
                    fontWeight: "bold",
                    cursor: isDepolamaLoading ? "wait" : "pointer",
                    fontSize: "12px",
                  }}
                >
                  {isDepolamaLoading ? "Yenileniyor..." : "Yenile"}
                </button>
              </div>
              <p style={{ margin: 0, color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>
                Bu veri sadece bu sekme acildiginda cekilir. Toplam alan bilgisi mevcut Free plan limitlerine gore gosterilir.
              </p>
            </div>

            {depolamaHata && (
              <div
                style={{
                  ...kartStili,
                  background: "#fff7ed",
                  borderColor: "#fdba74",
                  color: "#9a3412",
                  fontSize: "12px",
                  lineHeight: 1.5,
                }}
              >
                {depolamaHata}
              </div>
            )}

            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div style={kartStili}>
                <div style={{ color: "#0369a1", fontWeight: "bold", fontSize: "13px", marginBottom: "8px" }}>Database</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>
                  {byteMetni(depolamaDurumu?.databaseBytes || 0)}
                </div>
                <div style={{ display: "grid", gap: "4px", fontSize: "12px", color: "#475569" }}>
                  <div>Toplam: {byteMetni(depolamaDurumu?.databaseTotalBytes || 500000000)}</div>
                  <div>Kalan: {byteMetni(depolamaDurumu?.databaseRemainingBytes || 0)}</div>
                </div>
              </div>

              <div style={kartStili}>
                <div style={{ color: "#0f766e", fontWeight: "bold", fontSize: "13px", marginBottom: "8px" }}>Gorseller</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>
                  {byteMetni(depolamaDurumu?.imageBytes || 0)}
                </div>
                <div style={{ display: "grid", gap: "4px", fontSize: "12px", color: "#475569" }}>
                  <div>Toplam: {byteMetni(depolamaDurumu?.imageTotalBytes || 1000000000)}</div>
                  <div>Kalan: {byteMetni(depolamaDurumu?.imageRemainingBytes || 0)}</div>
                  <div>Dosya: {new Intl.NumberFormat("tr-TR").format(depolamaDurumu?.imageCount || 0)}</div>
                </div>
              </div>
            </div>

            {depolamaDurumu?.updatedAt && (
              <div style={{ color: "#94a3b8", fontSize: "11px", textAlign: "right" }}>
                Son guncelleme: {new Date(depolamaDurumu.updatedAt).toLocaleString("tr-TR")}
              </div>
            )}
          </div>
        )}

        {activeAyarTab === "yetkiler" && isAdmin && (
          <div style={{ display: "grid", gap: "12px", overflowY: "auto" }}>
            <div style={kartStili}>
              <h3 style={{ margin: "0 0 8px", fontSize: "15px", color: "#0f172a" }}>Sekme Yetkileri</h3>
              <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "13px", lineHeight: 1.5 }}>
                Admin kullanıcı: <b>{mevcutKullanici || "-"}</b>
              </p>
              <p style={{ margin: 0, color: yetkiKaynak === "supabase" ? "#0f766e" : "#b45309", fontSize: "12px" }}>
                Yetki kaynağı: {yetkiKaynak === "supabase" ? "Supabase tablosu" : "Bu cihazın yerel kaydı"}
              </p>
              {yetkiUyari && <p style={{ margin: "8px 0 0", color: "#b45309", fontSize: "12px" }}>{yetkiUyari}</p>}
            </div>

            <div style={{ ...kartStili, display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <input
                  list="kullanici-listesi"
                  value={hedefKullanici}
                  onChange={(event) => hedefKullaniciSec(event.target.value)}
                  placeholder="Kullanıcı adı seç veya yaz"
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                    fontSize: "13px",
                  }}
                />
                <datalist id="kullanici-listesi">
                  {kullaniciListesi.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
                <button
                  onClick={handlePermissionSave}
                  disabled={!hedefKullanici || !taslakYetkiler}
                  style={{
                    background: "#7c3aed",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0 15px",
                    fontWeight: "bold",
                    cursor: !hedefKullanici || !taslakYetkiler ? "not-allowed" : "pointer",
                    fontSize: "13px",
                  }}
                >
                  Kaydet
                </button>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                {sekmeSecenekleri.map((tab) => (
                  <label
                    key={tab.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <span style={{ fontWeight: "bold", color: "#334155", fontSize: "13px" }}>{tab.etiket}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(taslakYetkiler?.[tab.id])}
                      onChange={() => handlePermissionToggle(tab.id)}
                      disabled={!taslakYetkiler}
                      style={{ width: "18px", height: "18px" }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeAyarTab === "cop_kutusu" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", paddingRight: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
              <h4 style={{ margin: 0, fontSize: "13px", color: "#dc2626" }}>Son Silinen Kayıtlar</h4>
              {isAdmin && (
                <button
                  onClick={() => void onEmptyTrash()}
                  disabled={gorunenCopKutusuList.length === 0}
                  style={{
                    background: gorunenCopKutusuList.length === 0 ? "#e2e8f0" : "#dc2626",
                    color: gorunenCopKutusuList.length === 0 ? "#64748b" : "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "7px 12px",
                    fontWeight: "bold",
                    cursor: gorunenCopKutusuList.length === 0 ? "not-allowed" : "pointer",
                    fontSize: "12px",
                  }}
                >
                  Çöp Kutusunu Boşalt
                </button>
              )}
            </div>
            {gorunenCopKutusuList.map((kayit) => (
              (() => {
                const ozet = copKutusuOzetiniGetir(kayit.tablo_adi, kayit.veri);
                const kayitVerisi = kayitObjesi(kayit.veri);
                const silenBilgisi = kayit.silen_email || metinDegeri(kayitVerisi, "ekleyen");
                const destekleniyor = RESTORE_DESTEKLI_TABLOLAR.has(kayit.tablo_adi);
                const geriYuklendi = kayit.geri_yuklendi === true;
                const geriYuklenebilir = destekleniyor && !geriYuklendi && Boolean(kayit.id);
                const restoreLoading = Boolean(kayit.id && restoringTrashId === kayit.id);
                const deleteLoading = Boolean(kayit.id && deletingTrashId === kayit.id);
                return (
                  <div
                    key={kayit.id}
                    style={{
                      padding: "8px 10px",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "8px",
                      fontSize: "11px",
                      color: "#475569",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", gap: "8px" }}>
                      <strong style={{ color: "#dc2626" }}>{kayit.tablo_adi.toUpperCase()}</strong>
                      <span style={{ textAlign: "right" }}>
                        {kayit.silinme_tarihi ? new Date(kayit.silinme_tarihi).toLocaleString("tr-TR") : ""}
                      </span>
                    </div>
                    <div style={{ background: "#fff", padding: "7px 8px", borderRadius: "6px", border: "1px solid #fee2e2", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>{ozet.baslik}</div>
                        <div style={{ color: "#475569", lineHeight: 1.45 }}>{ozet.detay}</div>
                        {(silenBilgisi || geriYuklendi) && (
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px", fontSize: "10px", color: "#64748b" }}>
                            {silenBilgisi && <span>Silen: {silenBilgisi}</span>}
                            {geriYuklendi && (
                              <span style={{ color: "#059669", fontWeight: 700 }}>
                                Geri yüklendi
                                {kayit.geri_yukleme_tarihi ? ` • ${new Date(kayit.geri_yukleme_tarihi).toLocaleString("tr-TR")}` : ""}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flex: "0 0 auto", gap: "6px", flexWrap: "wrap" }}>
                        <button
                          onClick={() => kayit.id && void onRestoreTrashItem(kayit.id)}
                          disabled={!geriYuklenebilir || restoreLoading || deleteLoading}
                          style={{
                            border: "none",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: !geriYuklenebilir ? "#e2e8f0" : "#0f766e",
                            color: !geriYuklenebilir ? "#64748b" : "#fff",
                            cursor: !geriYuklenebilir ? "not-allowed" : "pointer",
                          }}
                        >
                          {restoreLoading ? "Geri yukleniyor..." : geriYuklendi ? "Geri Yuklendi" : destekleniyor ? "Geri Yukle" : "Desteklenmiyor"}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => kayit.id && void onDeleteTrashItem(kayit.id)}
                            disabled={!kayit.id || deleteLoading || restoreLoading}
                            style={{
                              border: "none",
                              borderRadius: "8px",
                              padding: "6px 10px",
                              fontSize: "11px",
                              fontWeight: 700,
                              background: !kayit.id || deleteLoading ? "#e2e8f0" : "#dc2626",
                              color: !kayit.id || deleteLoading ? "#64748b" : "#fff",
                              cursor: !kayit.id || deleteLoading ? "not-allowed" : "pointer",
                            }}
                          >
                            {deleteLoading ? "Siliniyor..." : "Kalici Sil"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            ))}
            {gorunenCopKutusuList.length === 0 && (
              <div style={{ textAlign: "center", color: "#94a3b8", marginTop: "20px", fontSize: "12px" }}>
                Çöp kutusu boş. Eğer Supabase tablosu yoksa silinenler buraya düşmez.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


