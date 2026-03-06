import { useEffect, useMemo, useState } from "react";
import { AYAR_TAB_TANIMLARI, VARSAYILAN_SEKME_YETKILERI } from "../constants/app";
import { fSayi, normalizeUsername } from "../utils/format";
import type {
  ActiveAyarTab,
  AppTabId,
  Bayi,
  Ciftlik,
  CopKutusu,
  KullaniciSekmeYetkisi,
  SekmeYetkiMap,
  Urun,
} from "../types/app";

interface SettingsPanelProps {
  activeAyarTab: ActiveAyarTab;
  setActiveAyarTab: (tab: ActiveAyarTab) => void;
  fontSize: number;
  setFontSize: (fontSize: number) => void;
  bayiler: Bayi[];
  urunler: Urun[];
  tedarikciler: Ciftlik[];
  copKutusuList: CopKutusu[];
  yeniAyarDeger: string;
  setYeniAyarDeger: (value: string) => void;
  yeniUrunFiyat: string;
  setYeniUrunFiyat: (value: string) => void;
  handleAyarEkle: () => void;
  handleTopluMusteriEkle: () => void;
  onSettingDelete: (tablo: string, id: string, isim: string) => void;
  onOpenTrash: () => void;
  onExcelBackup: () => void;
  onJsonBackup: () => void;
  isBackupLoading: boolean;
  isAdmin: boolean;
  mevcutKullanici: string;
  kullaniciListesi: string[];
  tabYetkileri: KullaniciSekmeYetkisi[];
  sekmeSecenekleri: Array<{ id: AppTabId; etiket: string }>;
  yetkiKaynak: "supabase" | "local";
  yetkiUyari: string;
  onSavePermissions: (next: KullaniciSekmeYetkisi[]) => Promise<void> | void;
  topluMusteriSayisi: number;
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
  fontSize,
  setFontSize,
  bayiler,
  urunler,
  tedarikciler,
  copKutusuList,
  yeniAyarDeger,
  setYeniAyarDeger,
  yeniUrunFiyat,
  setYeniUrunFiyat,
  handleAyarEkle,
  handleTopluMusteriEkle,
  onSettingDelete,
  onOpenTrash,
  onExcelBackup,
  onJsonBackup,
  isBackupLoading,
  isAdmin,
  mevcutKullanici,
  kullaniciListesi,
  tabYetkileri,
  sekmeSecenekleri,
  yetkiKaynak,
  yetkiUyari,
  onSavePermissions,
  topluMusteriSayisi,
}: SettingsPanelProps) {
  const [hedefKullanici, setHedefKullanici] = useState("");
  const [taslakYetkiler, setTaslakYetkiler] = useState<SekmeYetkiMap | null>(null);

  const gosterilecekAyarTablari = useMemo(
    () => AYAR_TAB_TANIMLARI.filter((item) => (item.id === "yetkiler" ? isAdmin : true)),
    [isAdmin],
  );

  const aktifAyarListesi = useMemo(() => {
    if (activeAyarTab === "musteriler") return bayiler;
    if (activeAyarTab === "urunler") return urunler;
    return tedarikciler;
  }, [activeAyarTab, bayiler, urunler, tedarikciler]);

  const aktifTabloAdi = useMemo(() => {
    if (activeAyarTab === "musteriler") return "bayiler";
    if (activeAyarTab === "urunler") return "urunler";
    return "ciftlikler";
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

        <div style={{ marginTop: "auto", paddingTop: "20px" }}>
          <h4 style={{ margin: "0 0 5px", fontSize: "11px", color: "#64748b", textAlign: "center" }}>Yazı Boyutu</h4>
          <input
            type="range"
            min="10"
            max="18"
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            style={{ width: "100%", cursor: "pointer" }}
          />
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" }}>
        {(activeAyarTab === "musteriler" || activeAyarTab === "urunler" || activeAyarTab === "ciftlikler") && (
          <>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                placeholder={`Yeni ${activeAyarTab.slice(0, -3)} ismi...`}
                value={yeniAyarDeger}
                onChange={(event) => setYeniAyarDeger(event.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  outline: "none",
                  fontSize: "13px",
                }}
              />
              {activeAyarTab === "urunler" && (
                <input
                  placeholder="Fiyat"
                  type="number"
                  value={yeniUrunFiyat}
                  onChange={(event) => setYeniUrunFiyat(event.target.value)}
                  style={{
                    width: "80px",
                    padding: "8px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                    fontSize: "13px",
                  }}
                />
              )}
              <button
                onClick={handleAyarEkle}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0 15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Ekle
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", paddingRight: "4px" }}>
              {aktifAyarListesi.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    background: "#fff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                  }}
                >
                  <span style={{ fontWeight: "bold", color: "#475569", fontSize: "12px" }}>
                    {item.isim}
                    {activeAyarTab === "urunler" && "fiyat" in item && item.fiyat
                      ? ` (${fSayi((item as Urun).fiyat)} ₺)`
                      : ""}
                  </span>
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
                  >
                    ✕
                  </button>
                </div>
              ))}

              {aktifAyarListesi.length === 0 && (
                <div style={{ textAlign: "center", color: "#94a3b8", marginTop: "20px", fontSize: "13px" }}>
                  Kayıt bulunamadı.
                </div>
              )}

              {activeAyarTab === "musteriler" && (
                <button
                  onClick={handleTopluMusteriEkle}
                  style={{
                    background: "#8b5cf6",
                    color: "#fff",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "bold",
                    marginTop: "15px",
                  }}
                >
                  📥 {topluMusteriSayisi} Hazır Müşteriyi İçe Aktar
                </button>
              )}
            </div>
          </>
        )}

        {activeAyarTab === "yedekleme" && (
          <div style={{ display: "grid", gap: "12px", overflowY: "auto" }}>
            <div style={kartStili}>
              <h3 style={{ margin: "0 0 8px", fontSize: "15px", color: "#0f172a" }}>Veri Yedekleme</h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px", lineHeight: 1.5 }}>
                Excel yedeği ekranlardaki ana veri sekmelerini ayrı sayfalara böler. JSON yedeği ise tam veri dökümünü alır.
              </p>
            </div>
            <div style={{ ...kartStili, display: "grid", gap: "10px" }}>
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
            <h4 style={{ margin: "0 0 5px", fontSize: "13px", color: "#dc2626" }}>Son Silinen Kayıtlar</h4>
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
