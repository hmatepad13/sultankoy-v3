import { useCallback, useEffect, useMemo, useState } from "react";
import type { SevkiyatKaydi } from "../types/app";
import { getLocalDateString } from "../utils/date";
import { fSayiNoDec, normalizeUsername } from "../utils/format";

const SEVKIYAT_LOCAL_KEY = "sultankoy-sevkiyat-deneme-v1";

type SevkiyatPanelProps = {
  aktifKullaniciKisa: string;
  aktifDonem: string;
};

const sayiDegeri = (deger: unknown) => {
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (typeof deger === "string" && deger.trim() && !Number.isNaN(Number(deger))) return Number(deger);
  return 0;
};

const localKayitOku = <T,>(anahtar: string, varsayilan: T): T => {
  if (typeof window === "undefined") return varsayilan;

  try {
    const ham = localStorage.getItem(anahtar);
    if (!ham) return varsayilan;
    return JSON.parse(ham) as T;
  } catch {
    return varsayilan;
  }
};

const varsayilanTarihGetir = (aktifDonem: string) => {
  const bugun = getLocalDateString();
  return bugun.startsWith(aktifDonem) ? bugun : `${aktifDonem}-01`;
};

export function SevkiyatPanel({ aktifKullaniciKisa, aktifDonem }: SevkiyatPanelProps) {
  const [sevkiyatList, setSevkiyatList] = useState<SevkiyatKaydi[]>(() =>
    localKayitOku<SevkiyatKaydi[]>(SEVKIYAT_LOCAL_KEY, []),
  );
  const [sevkiyatFiltreKisi, setSevkiyatFiltreKisi] = useState<"benim" | "tumu">("benim");
  const [sevkiyatForm, setSevkiyatForm] = useState({
    tarih: varsayilanTarihGetir(aktifDonem),
    yogurt3kg: "",
    yogurt5kg: "",
    kaymak: "",
  });
  const [editingSevkiyatId, setEditingSevkiyatId] = useState<string | null>(null);
  const [sevkiyatDetayKaydi, setSevkiyatDetayKaydi] = useState<SevkiyatKaydi | null>(null);
  const [openDropdown, setOpenDropdown] = useState<{ type: string; id: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SEVKIYAT_LOCAL_KEY, JSON.stringify(sevkiyatList));
  }, [sevkiyatList]);

  useEffect(() => {
    if (editingSevkiyatId) return;
    setSevkiyatForm((prev) => ({ ...prev, tarih: varsayilanTarihGetir(aktifDonem) }));
  }, [aktifDonem, editingSevkiyatId]);

  useEffect(() => {
    if (!openDropdown) return;

    const handleDisTiklama = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".dropdown-menu") || target.closest(".actions-cell")) return;
      setOpenDropdown(null);
    };

    document.addEventListener("mousedown", handleDisTiklama);
    document.addEventListener("touchstart", handleDisTiklama, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handleDisTiklama);
      document.removeEventListener("touchstart", handleDisTiklama);
    };
  }, [openDropdown]);

  const resetSevkiyatForm = useCallback(() => {
    setEditingSevkiyatId(null);
    setSevkiyatForm({
      tarih: varsayilanTarihGetir(aktifDonem),
      yogurt3kg: "",
      yogurt5kg: "",
      kaymak: "",
    });
  }, [aktifDonem]);

  const handleSevkiyatInputDegistir = (alan: "yogurt3kg" | "yogurt5kg" | "kaymak", value: string) => {
    const temiz = value.replace(/[^\d]/g, "");
    setSevkiyatForm((prev) => ({ ...prev, [alan]: temiz }));
  };

  const sevkiyatKaydiSahibiMi = useCallback(
    (kayit?: Partial<SevkiyatKaydi> | null) =>
      !!normalizeUsername(kayit?.kullanici) && normalizeUsername(kayit?.kullanici) === aktifKullaniciKisa,
    [aktifKullaniciKisa],
  );

  const handleSevkiyatKaydet = () => {
    const yeniKayit: SevkiyatKaydi = {
      id: editingSevkiyatId || `${Date.now()}`,
      tarih: sevkiyatForm.tarih,
      kullanici: aktifKullaniciKisa,
      yogurt3kg: sayiDegeri(sevkiyatForm.yogurt3kg),
      yogurt5kg: sayiDegeri(sevkiyatForm.yogurt5kg),
      kaymak: sayiDegeri(sevkiyatForm.kaymak),
      createdAt: new Date().toISOString(),
    };

    if (!sevkiyatForm.tarih) return alert("Tarih seçin.");
    if (yeniKayit.yogurt3kg + yeniKayit.yogurt5kg + yeniKayit.kaymak <= 0) {
      return alert("En az bir sevkiyat miktarı girin.");
    }

    setSevkiyatList((prev) => {
      if (editingSevkiyatId) {
        return prev.map((kayit) => (kayit.id === editingSevkiyatId ? yeniKayit : kayit));
      }
      return [yeniKayit, ...prev];
    });

    resetSevkiyatForm();
  };

  const handleSevkiyatDuzenle = (kayit: SevkiyatKaydi) => {
    if (!sevkiyatKaydiSahibiMi(kayit)) {
      alert("Bu sevkiyati sadece kaydi giren kullanıcı düzenleyebilir.");
      return;
    }

    setEditingSevkiyatId(kayit.id);
    setSevkiyatForm({
      tarih: kayit.tarih,
      yogurt3kg: kayit.yogurt3kg ? String(kayit.yogurt3kg) : "",
      yogurt5kg: kayit.yogurt5kg ? String(kayit.yogurt5kg) : "",
      kaymak: kayit.kaymak ? String(kayit.kaymak) : "",
    });
  };

  const handleSevkiyatSil = (id: string) => {
    const kayit = sevkiyatList.find((item) => item.id === id);
    if (!sevkiyatKaydiSahibiMi(kayit)) {
      alert("Bu sevkiyati sadece kaydi giren kullanıcı silebilir.");
      return;
    }

    if (!confirm("Sevkiyat kaydı silinsin mi?")) return;
    setSevkiyatList((prev) => prev.filter((item) => item.id !== id));
    if (editingSevkiyatId === id) {
      resetSevkiyatForm();
    }
  };

  const filtrelenmisSevkiyatlar = useMemo(
    () =>
      sevkiyatList
        .filter((kayit) => sevkiyatFiltreKisi === "tumu" || normalizeUsername(kayit.kullanici) === aktifKullaniciKisa)
        .sort((a, b) => `${b.tarih}${b.createdAt || ""}`.localeCompare(`${a.tarih}${a.createdAt || ""}`)),
    [aktifKullaniciKisa, sevkiyatFiltreKisi, sevkiyatList],
  );

  const sevkiyatToplamlari = useMemo(
    () =>
      filtrelenmisSevkiyatlar.reduce(
        (toplam, kayit) => ({
          yogurt3kg: toplam.yogurt3kg + sayiDegeri(kayit.yogurt3kg),
          yogurt5kg: toplam.yogurt5kg + sayiDegeri(kayit.yogurt5kg),
          kaymak: toplam.kaymak + sayiDegeri(kayit.kaymak),
        }),
        { yogurt3kg: 0, yogurt5kg: 0, kaymak: 0 },
      ),
    [filtrelenmisSevkiyatlar],
  );

  return (
    <div className="tab-fade-in main-content-area">
      <div className="card" style={{ borderLeft: "4px solid #ea580c", marginBottom: "8px", padding: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0, color: "#9a3412", fontSize: "16px" }}>Sevkiyat</h3>
            <div style={{ fontSize: "12px", color: "#7c2d12", marginTop: "3px" }}>
              Aktif hesap: <b>{aktifKullaniciKisa || "-"}</b>
            </div>
          </div>
          <button
            onClick={resetSevkiyatForm}
            className="btn-anim"
            style={{ border: "1px solid #fed7aa", background: "#fff7ed", color: "#c2410c", borderRadius: "8px", padding: "6px 9px", fontWeight: "bold", fontSize: "11px", cursor: "pointer" }}
          >
            Temizle
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          <input
            type="date"
            className="m-inp"
            value={sevkiyatForm.tarih}
            onChange={(e) => setSevkiyatForm((prev) => ({ ...prev, tarih: e.target.value }))}
            style={{ width: "146px", flex: "0 0 146px", height: "32px", minHeight: "32px", padding: "4px 8px", fontSize: "12px" }}
          />
          <div style={{ display: "flex", background: "#cbd5e1", borderRadius: "6px", overflow: "hidden", flex: "0 0 auto", width: "160px" }}>
            <button onClick={() => setSevkiyatFiltreKisi("benim")} style={{ flex: 1, padding: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", background: sevkiyatFiltreKisi === "benim" ? "#ea580c" : "transparent", color: sevkiyatFiltreKisi === "benim" ? "#fff" : "#475569" }}>Benim</button>
            <button onClick={() => setSevkiyatFiltreKisi("tumu")} style={{ flex: 1, padding: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", background: sevkiyatFiltreKisi === "tumu" ? "#ea580c" : "transparent", color: sevkiyatFiltreKisi === "tumu" ? "#fff" : "#475569" }}>Tümü</button>
          </div>
          <button onClick={handleSevkiyatKaydet} className="p-btn btn-anim" style={{ background: "#ea580c", minWidth: "110px", height: "32px", padding: "0 14px", fontSize: "12px", marginLeft: "auto" }}>
            {editingSevkiyatId ? "GÜNCELLE" : "KAYDET"}
          </button>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", width: "136px", flex: "0 0 136px" }}>
            <span style={{ fontSize: "12px", fontWeight: "bold", color: "#7c2d12" }}>3 KG Yoğurt</span>
            <input type="text" inputMode="numeric" className="m-inp" style={{ flex: "0 0 auto", width: "100%", height: "34px", minHeight: "34px", padding: "4px 8px", fontSize: "12px" }} value={sevkiyatForm.yogurt3kg} onChange={(e) => handleSevkiyatInputDegistir("yogurt3kg", e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", width: "136px", flex: "0 0 136px" }}>
            <span style={{ fontSize: "12px", fontWeight: "bold", color: "#7c2d12" }}>5 KG Yoğurt</span>
            <input type="text" inputMode="numeric" className="m-inp" style={{ flex: "0 0 auto", width: "100%", height: "34px", minHeight: "34px", padding: "4px 8px", fontSize: "12px" }} value={sevkiyatForm.yogurt5kg} onChange={(e) => handleSevkiyatInputDegistir("yogurt5kg", e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", width: "136px", flex: "0 0 136px" }}>
            <span style={{ fontSize: "12px", fontWeight: "bold", color: "#7c2d12" }}>Kaymak</span>
            <input type="text" inputMode="numeric" className="m-inp" style={{ flex: "0 0 auto", width: "100%", height: "34px", minHeight: "34px", padding: "4px 8px", fontSize: "12px" }} value={sevkiyatForm.kaymak} onChange={(e) => handleSevkiyatInputDegistir("kaymak", e.target.value)} />
          </label>
        </div>
      </div>

      <div className="compact-totals three" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
        <div className="c-kutu" style={{ borderLeftColor: "#ea580c" }}>
          <span>TOP 3 KG</span>
          <b>{fSayiNoDec(sevkiyatToplamlari.yogurt3kg)}</b>
        </div>
        <div className="c-kutu" style={{ borderLeftColor: "#c2410c" }}>
          <span>TOP 5 KG</span>
          <b>{fSayiNoDec(sevkiyatToplamlari.yogurt5kg)}</b>
        </div>
        <div className="c-kutu" style={{ borderLeftColor: "#9a3412" }}>
          <span>TOP KAYMAK</span>
          <b>{fSayiNoDec(sevkiyatToplamlari.kaymak)}</b>
        </div>
      </div>

      <div className="table-wrapper table-wrapper-fixed">
        <table className="tbl" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: "16%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>TAR.</th>
              <th style={{ width: "22%", textAlign: "left", background: "#5b9bd5", color: "#fff" }}>KİŞİ</th>
              <th style={{ width: "18%", textAlign: "right", background: "#5b9bd5", color: "#fff" }}>3 KG</th>
              <th style={{ width: "18%", textAlign: "right", background: "#5b9bd5", color: "#fff" }}>5 KG</th>
              <th style={{ width: "18%", textAlign: "right", background: "#5b9bd5", color: "#fff" }}>KAYMAK</th>
              <th style={{ width: "8%", background: "#5b9bd5" }}></th>
            </tr>
          </thead>
          <tbody>
            {filtrelenmisSevkiyatlar.map((kayit) => (
              <tr key={kayit.id}>
                <td style={{ textAlign: "center" }}>{kayit.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
                <td style={{ fontWeight: "bold", textAlign: "left" }}>{kayit.kullanici}</td>
                <td style={{ textAlign: "right", fontWeight: "bold", color: "#ea580c" }}>{fSayiNoDec(kayit.yogurt3kg)}</td>
                <td style={{ textAlign: "right", fontWeight: "bold", color: "#ea580c" }}>{fSayiNoDec(kayit.yogurt5kg)}</td>
                <td style={{ textAlign: "right", fontWeight: "bold", color: "#ea580c" }}>{fSayiNoDec(kayit.kaymak)}</td>
                <td className="actions-cell" style={{ position: "relative" }}>
                  <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: "sevkiyat", id: kayit.id }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "0 8px", color: "#64748b" }}>⋮</button>
                  {openDropdown?.type === "sevkiyat" && openDropdown.id === kayit.id && (
                    <div className="dropdown-menu">
                      <button title="Detay Gör" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setSevkiyatDetayKaydi(kayit); }}>🔍</button>
                      {sevkiyatKaydiSahibiMi(kayit) && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); handleSevkiyatDuzenle(kayit); }}>✏️</button>}
                      {sevkiyatKaydiSahibiMi(kayit) && <button title="Sil" className="dropdown-item-icon" style={{ color: "#dc2626" }} onClick={() => { setOpenDropdown(null); handleSevkiyatSil(kayit.id); }}>🗑️</button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sevkiyatDetayKaydi && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1320, padding: "14px" }} onClick={() => setSevkiyatDetayKaydi(null)}>
          <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "320px", padding: "16px", boxShadow: "0 20px 45px rgba(15, 23, 42, 0.2)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px", color: "#9a3412" }}>Sevkiyat Detayı</h3>
            <div style={{ display: "grid", gap: "8px", fontSize: "13px", color: "#475569" }}>
              <div><b>Tarih:</b> {sevkiyatDetayKaydi.tarih.split("-").reverse().join(".")}</div>
              <div><b>Kişi:</b> {sevkiyatDetayKaydi.kullanici}</div>
              <div><b>3 KG Yoğurt:</b> {fSayiNoDec(sevkiyatDetayKaydi.yogurt3kg)}</div>
              <div><b>5 KG Yoğurt:</b> {fSayiNoDec(sevkiyatDetayKaydi.yogurt5kg)}</div>
              <div><b>Kaymak:</b> {fSayiNoDec(sevkiyatDetayKaydi.kaymak)}</div>
            </div>
            <button onClick={() => setSevkiyatDetayKaydi(null)} style={{ width: "100%", marginTop: "14px", padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", color: "#475569", cursor: "pointer" }}>KAPAT</button>
          </div>
        </div>
      )}
    </div>
  );
}
