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

  const gosterilecekAyarTablari = useMemo(
    () =>
      AYAR_TAB_TANIMLARI.filter((item) => {
        if (item.id === "yetkiler" || item.id === "kullanici_yonetimi") return isAdmin;
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
    if (!isAdmin && (activeAyarTab === "yetkiler" || activeAyarTab === "kullanici_yonetimi")) {
      setActiveAyarTab("hesap");
    }
  }, [activeAyarTab, isAdmin, setActiveAyarTab]);

  useEffect(() => {
    if (isAdmin && activeAyarTab === "kullanici_yonetimi") {
      void onLoadAdminUsers();
    }
  }, [activeAyarTab, isAdmin, onLoadAdminUsers]);

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

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" }}>
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


