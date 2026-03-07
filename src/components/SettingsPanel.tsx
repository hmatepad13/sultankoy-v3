import { useEffect, useMemo, useState } from "react";
import { AYAR_TAB_TANIMLARI, VARSAYILAN_SEKME_YETKILERI } from "../constants/app";
import { fSayi, normalizeUsername } from "../utils/format";
import type {
  ActiveAyarTab,
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
  bayiler: Bayi[];
  urunler: Urun[];
  tedarikciler: Ciftlik[];
  giderTuruListesi: GiderTuru[];
  copKutusuList: CopKutusu[];
  yeniAyarDeger: string;
  setYeniAyarDeger: (value: string) => void;
  handleAyarEkle: () => void;
  onSettingEdit: (tablo: string, id: string, isim: string) => void;
  onSettingToggleActive: (tablo: string, id: string, aktif: boolean) => void;
  onSettingDelete: (tablo: string, id: string, isim: string) => void;
  onOpenTrash: () => void;
  onEmptyTrash: () => Promise<void> | void;
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
  kullaniciListesi: string[];
  tabYetkileri: KullaniciSekmeYetkisi[];
  sekmeSecenekleri: Array<{ id: AppTabId; etiket: string }>;
  yetkiKaynak: "supabase" | "local";
  yetkiUyari: string;
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
  bayiler,
  urunler,
  tedarikciler,
  giderTuruListesi,
  copKutusuList,
  yeniAyarDeger,
  setYeniAyarDeger,
  handleAyarEkle,
  onSettingEdit,
  onSettingToggleActive,
  onSettingDelete,
  onOpenTrash,
  onEmptyTrash,
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
  kullaniciListesi,
  tabYetkileri,
  sekmeSecenekleri,
  yetkiKaynak,
  yetkiUyari,
  onSavePermissions,
}: SettingsPanelProps) {
  const [hedefKullanici, setHedefKullanici] = useState("");
  const [taslakYetkiler, setTaslakYetkiler] = useState<SekmeYetkiMap | null>(null);

  const gosterilecekAyarTablari = useMemo(
    () => AYAR_TAB_TANIMLARI.filter((item) => (item.id === "yetkiler" ? isAdmin : true)),
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
    if (!isAdmin && activeAyarTab === "yetkiler") {
      setActiveAyarTab("musteriler");
    }
  }, [activeAyarTab, isAdmin, setActiveAyarTab]);

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

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", paddingRight: "4px" }}>
              {aktifAyarListesi.map((item) => (
                (() => {
                  const aktif = "aktif" in item ? item.aktif !== false : true;
                  const pasifDestekli = activeAyarTab === "musteriler" || activeAyarTab === "urunler" || activeAyarTab === "ciftlikler";
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
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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
                  </div>
                </div>
                  );
                })()
              ))}

              {aktifAyarListesi.length === 0 && (
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
                  disabled={copKutusuList.length === 0}
                  style={{
                    background: copKutusuList.length === 0 ? "#e2e8f0" : "#dc2626",
                    color: copKutusuList.length === 0 ? "#64748b" : "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "7px 12px",
                    fontWeight: "bold",
                    cursor: copKutusuList.length === 0 ? "not-allowed" : "pointer",
                    fontSize: "12px",
                  }}
                >
                  Çöp Kutusunu Boşalt
                </button>
              )}
            </div>
            {copKutusuList.map((kayit) => (
              (() => {
                const ozet = copKutusuOzetiniGetir(kayit.tablo_adi, kayit.veri);
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
                    <div style={{ background: "#fff", padding: "7px 8px", borderRadius: "6px", border: "1px solid #fee2e2" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>{ozet.baslik}</div>
                      <div style={{ color: "#475569", lineHeight: 1.45 }}>{ozet.detay}</div>
                    </div>
                  </div>
                );
              })()
            ))}
            {copKutusuList.length === 0 && (
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
