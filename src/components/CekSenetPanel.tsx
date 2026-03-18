import { useCallback, useEffect, useRef, useState } from "react";
import type { CekSenetKaydi, CekSenetTur } from "../types/app";
import { getLocalDateString } from "../utils/date";
import { fSayi, normalizeUsername } from "../utils/format";

type CekSenetPanelProps = {
  aktifKullaniciKisa: string;
  aktifDonem: string;
};

type CekSenetForm = {
  tur: CekSenetTur;
  tarih: string;
  duzenleyen: string;
  tahTarihi: string;
  miktar: string;
  banka: string;
  onYuzFoto: string;
  arkaYuzFoto: string;
};

const STORAGE_KEY = "sultankoy_cek_senet_kayitlari_v1";

const TUR_SECENEKLERI: Array<{ deger: CekSenetTur; etiket: string; renk: string; arkaPlan: string }> = [
  { deger: "verilen_cek", etiket: "Verilen Çek", renk: "#b45309", arkaPlan: "#fff7ed" },
  { deger: "alinan_cek", etiket: "Alınan Çek", renk: "#0369a1", arkaPlan: "#f0f9ff" },
  { deger: "verilen_senet", etiket: "Verilen Senet", renk: "#7c3aed", arkaPlan: "#f5f3ff" },
  { deger: "alinan_senet", etiket: "Alınan Senet", renk: "#0f766e", arkaPlan: "#ecfdf5" },
];

const varsayilanTarihGetir = (aktifDonem: string) => {
  const bugun = getLocalDateString();
  return bugun.startsWith(aktifDonem) ? bugun : `${aktifDonem}-01`;
};

const bosFormGetir = (aktifDonem: string): CekSenetForm => {
  const tarih = varsayilanTarihGetir(aktifDonem);
  return {
    tur: "alinan_cek",
    tarih,
    duzenleyen: "",
    tahTarihi: tarih,
    miktar: "",
    banka: "",
    onYuzFoto: "",
    arkaYuzFoto: "",
  };
};

const sayiDegeri = (deger: unknown) => {
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (typeof deger === "string" && deger.trim() && !Number.isNaN(Number(deger))) return Number(deger);
  return 0;
};

const kisaTarih = (tarih?: string) => String(tarih || "").split("-").reverse().slice(0, 2).join(".");

const turBilgisiGetir = (tur: CekSenetTur) =>
  TUR_SECENEKLERI.find((item) => item.deger === tur) || TUR_SECENEKLERI[0];

const localStorageOku = (): CekSenetKaydi[] => {
  if (typeof window === "undefined") return [];

  try {
    const ham = window.localStorage.getItem(STORAGE_KEY);
    const parsed = ham ? JSON.parse(ham) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => ({
      id: String(item?.id || ""),
      tur: (item?.tur || "alinan_cek") as CekSenetTur,
      tarih: String(item?.tarih || ""),
      duzenleyen: String(item?.duzenleyen || ""),
      tahTarihi: String(item?.tahTarihi || ""),
      miktar: sayiDegeri(item?.miktar),
      banka: String(item?.banka || ""),
      onYuzFoto: typeof item?.onYuzFoto === "string" ? item.onYuzFoto : "",
      arkaYuzFoto: typeof item?.arkaYuzFoto === "string" ? item.arkaYuzFoto : "",
      ekleyen: String(item?.ekleyen || ""),
      createdAt: String(item?.createdAt || ""),
    }));
  } catch {
    return [];
  }
};

const localStorageYaz = (kayitlar: CekSenetKaydi[]) => {
  if (typeof window === "undefined") return true;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kayitlar));
    return true;
  } catch {
    return false;
  }
};

const dosyaDataUrlGetir = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Fotoğraf okunamadı."));
    reader.readAsDataURL(file);
  });

export function CekSenetPanel({ aktifKullaniciKisa, aktifDonem }: CekSenetPanelProps) {
  const [kayitlar, setKayitlar] = useState<CekSenetKaydi[]>(() => localStorageOku());
  const [formAcik, setFormAcik] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CekSenetForm>(() => bosFormGetir(aktifDonem));
  const [detayKaydi, setDetayKaydi] = useState<CekSenetKaydi | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [gorselOnizleme, setGorselOnizleme] = useState<{ src: string; baslik: string } | null>(null);
  const onYuzInputRef = useRef<HTMLInputElement | null>(null);
  const arkaYuzInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (formAcik || editingId) return;
    setForm(bosFormGetir(aktifDonem));
  }, [aktifDonem, editingId, formAcik]);

  useEffect(() => {
    if (!openDropdownId) return;

    const handleDisTiklama = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".dropdown-menu") || target.closest(".actions-cell")) return;
      setOpenDropdownId(null);
    };

    document.addEventListener("mousedown", handleDisTiklama);
    document.addEventListener("touchstart", handleDisTiklama, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handleDisTiklama);
      document.removeEventListener("touchstart", handleDisTiklama);
    };
  }, [openDropdownId]);

  const formKapat = useCallback(() => {
    setFormAcik(false);
    setEditingId(null);
    setForm(bosFormGetir(aktifDonem));
  }, [aktifDonem]);

  const kayitSahibiMi = useCallback(
    (kayit?: Partial<CekSenetKaydi> | null) => normalizeUsername(kayit?.ekleyen) === aktifKullaniciKisa,
    [aktifKullaniciKisa],
  );

  const kayitlariKaydet = useCallback((sonrakiKayitlar: CekSenetKaydi[]) => {
    if (!localStorageYaz(sonrakiKayitlar)) {
      alert("Kayıt saklanamadı. Tarayıcı depolama alanı dolu olabilir.");
      return false;
    }

    setKayitlar(sonrakiKayitlar);
    return true;
  }, []);

  const donemKayitlari = [...kayitlar]
    .filter((kayit) => String(kayit.tarih || "").startsWith(aktifDonem))
    .sort((a, b) => `${b.tarih}${b.createdAt || ""}`.localeCompare(`${a.tarih}${a.createdAt || ""}`));

  const yeniKayitAc = () => {
    setEditingId(null);
    setForm(bosFormGetir(aktifDonem));
    setFormAcik(true);
  };

  const duzenlemeAc = (kayit: CekSenetKaydi) => {
    if (!kayitSahibiMi(kayit)) {
      alert("Bu kaydı sadece ekleyen kullanıcı düzenleyebilir.");
      return;
    }

    setEditingId(kayit.id);
    setForm({
      tur: kayit.tur,
      tarih: kayit.tarih,
      duzenleyen: kayit.duzenleyen,
      tahTarihi: kayit.tahTarihi,
      miktar: kayit.miktar ? String(kayit.miktar) : "",
      banka: kayit.banka,
      onYuzFoto: kayit.onYuzFoto || "",
      arkaYuzFoto: kayit.arkaYuzFoto || "",
    });
    setFormAcik(true);
  };

  const fotoSec = async (alan: "onYuzFoto" | "arkaYuzFoto", file?: File | null) => {
    if (!file) return;

    try {
      const dataUrl = await dosyaDataUrlGetir(file);
      setForm((prev) => ({ ...prev, [alan]: dataUrl }));
    } catch {
      alert("Fotoğraf yüklenemedi.");
    }
  };

  const handleKaydet = () => {
    if (!form.tarih) return alert("Tarih seçin.");
    if (!form.duzenleyen.trim()) return alert("Düzenleyen girin.");
    if (!form.tahTarihi) return alert("Tahsilat tarihi seçin.");
    if (sayiDegeri(form.miktar) <= 0) return alert("Geçerli miktar girin.");
    if (!form.banka.trim()) return alert("Banka girin.");

    const oncekiKayit = editingId ? kayitlar.find((item) => item.id === editingId) : null;
    if (editingId && !kayitSahibiMi(oncekiKayit)) {
      return alert("Bu kaydı sadece ekleyen kullanıcı düzenleyebilir.");
    }

    const yeniKayit: CekSenetKaydi = {
      id: editingId || `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      tur: form.tur,
      tarih: form.tarih,
      duzenleyen: form.duzenleyen.trim(),
      tahTarihi: form.tahTarihi,
      miktar: sayiDegeri(form.miktar),
      banka: form.banka.trim(),
      onYuzFoto: form.onYuzFoto || "",
      arkaYuzFoto: form.arkaYuzFoto || "",
      ekleyen: aktifKullaniciKisa,
      createdAt: oncekiKayit?.createdAt || new Date().toISOString(),
    };

    const sonrakiKayitlar = editingId
      ? kayitlar.map((item) => (item.id === editingId ? yeniKayit : item))
      : [yeniKayit, ...kayitlar];

    if (!kayitlariKaydet(sonrakiKayitlar)) return;
    formKapat();
  };

  const handleSil = (kayit: CekSenetKaydi) => {
    if (!kayitSahibiMi(kayit)) {
      alert("Bu kaydı sadece ekleyen kullanıcı silebilir.");
      return;
    }
    if (!confirm("Kayıt silinsin mi?")) return;

    const sonrakiKayitlar = kayitlar.filter((item) => item.id !== kayit.id);
    if (!kayitlariKaydet(sonrakiKayitlar)) return;
    if (editingId === kayit.id) formKapat();
  };

  const renderFotoAlani = (
    baslik: string,
    alan: "onYuzFoto" | "arkaYuzFoto",
    inputRef: { current: HTMLInputElement | null },
  ) => {
    const src = form[alan];

    return (
      <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px", background: "#f8fafc" }}>
        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", marginBottom: "8px" }}>{baslik}</div>
        {src ? (
          <img
            src={src}
            alt={baslik}
            style={{ width: "100%", height: "112px", objectFit: "cover", borderRadius: "8px", marginBottom: "8px", cursor: "pointer" }}
            onClick={() => setGorselOnizleme({ src, baslik })}
          />
        ) : (
          <div style={{ height: "112px", borderRadius: "8px", border: "1px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "11px", marginBottom: "8px" }}>
            Foto yok
          </div>
        )}
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{ flex: 1, border: "1px solid #0f766e33", background: "#ecfdf5", color: "#0f766e", borderRadius: "8px", padding: "7px 8px", fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}
          >
            Foto Yükle
          </button>
          {src && (
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, [alan]: "" }))}
              style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", padding: "7px 8px", fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}
            >
              Sil
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderDetayFoto = (baslik: string, src?: string) => (
    <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px", background: "#f8fafc" }}>
      <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", marginBottom: "8px" }}>{baslik}</div>
      {src ? (
        <img
          src={src}
          alt={baslik}
          style={{ width: "100%", height: "120px", objectFit: "cover", borderRadius: "8px", cursor: "pointer" }}
          onClick={() => setGorselOnizleme({ src, baslik })}
        />
      ) : (
        <div style={{ height: "120px", borderRadius: "8px", border: "1px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "11px" }}>
          Foto yok
        </div>
      )}
    </div>
  );

  return (
    <div className="tab-fade-in main-content-area">
      <div className="card" style={{ borderLeft: "4px solid #0f766e", marginBottom: "8px", padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, color: "#0f766e", fontSize: "16px" }}>Çek-Senet</h3>
          <button onClick={yeniKayitAc} className="p-btn btn-anim" style={{ background: "#0f766e", minWidth: "118px", height: "34px", padding: "0 14px", fontSize: "12px", marginLeft: "auto" }}>
            + EKLE
          </button>
        </div>
      </div>

      <div className="table-wrapper table-wrapper-fixed">
        <table className="tbl" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: "11%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>TAR.</th>
              <th style={{ width: "16%", textAlign: "left", background: "#5b9bd5", color: "#fff" }}>TÜR</th>
              <th style={{ width: "18%", textAlign: "left", background: "#5b9bd5", color: "#fff" }}>DÜZENLEYEN</th>
              <th style={{ width: "14%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>TAHSİLAT TAR.</th>
              <th style={{ width: "13%", textAlign: "right", background: "#5b9bd5", color: "#fff" }}>MİKTAR</th>
              <th style={{ width: "14%", textAlign: "left", background: "#5b9bd5", color: "#fff" }}>BANKA</th>
              <th style={{ width: "6%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>KİŞİ</th>
              <th style={{ width: "8%", background: "#5b9bd5" }}></th>
            </tr>
          </thead>
          <tbody>
            {donemKayitlari.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "14px", color: "#94a3b8", fontWeight: "bold" }}>
                  Kayıt bulunmuyor.
                </td>
              </tr>
            )}
            {donemKayitlari.map((kayit) => {
              const tur = turBilgisiGetir(kayit.tur);
              return (
                <tr key={kayit.id}>
                  <td style={{ textAlign: "center" }}>{kisaTarih(kayit.tarih)}</td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", borderRadius: "999px", padding: "4px 7px", background: tur.arkaPlan, color: tur.renk, fontWeight: "bold", fontSize: "10px" }}>
                      {tur.etiket}
                    </span>
                  </td>
                  <td style={{ fontWeight: "bold" }}>{kayit.duzenleyen}</td>
                  <td style={{ textAlign: "center" }}>{kisaTarih(kayit.tahTarihi)}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold", color: "#0f766e" }}>{fSayi(kayit.miktar)}</td>
                  <td>{kayit.banka}</td>
                  <td style={{ textAlign: "center", color: "#64748b" }}>{normalizeUsername(kayit.ekleyen) || "-"}</td>
                  <td className="actions-cell" style={{ position: "relative" }}>
                    <button onClick={(e) => { e.stopPropagation(); setOpenDropdownId(kayit.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "0 8px", color: "#64748b" }}>⋮</button>
                    {openDropdownId === kayit.id && (
                      <div className="dropdown-menu">
                        <button title="Detay Gör" className="dropdown-item-icon" onClick={() => { setOpenDropdownId(null); setDetayKaydi(kayit); }}>🔍</button>
                        {(kayit.onYuzFoto || kayit.arkaYuzFoto) && (
                          <button
                            title="Fotoğrafları Gör"
                            className="dropdown-item-icon"
                            onClick={() => {
                              setOpenDropdownId(null);
                              setGorselOnizleme({
                                src: kayit.onYuzFoto || kayit.arkaYuzFoto || "",
                                baslik: kayit.onYuzFoto ? "Ön Yüz" : "Arka Yüz",
                              });
                            }}
                          >
                            🖼️
                          </button>
                        )}
                        {kayitSahibiMi(kayit) && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdownId(null); duzenlemeAc(kayit); }}>✏️</button>}
                        {kayitSahibiMi(kayit) && <button title="Sil" className="dropdown-item-icon" style={{ color: "#dc2626" }} onClick={() => { setOpenDropdownId(null); handleSil(kayit); }}>🗑️</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {formAcik && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1320, padding: "14px" }} onClick={formKapat}>
          <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 45px rgba(15, 23, 42, 0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, color: "#0f766e", fontSize: "16px" }}>{editingId ? "Çek-Senet Düzenle" : "Yeni Çek-Senet"}</h3>
              <button onClick={formKapat} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
            </div>

            <div style={{ padding: "14px 16px", display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Tür</span>
                  <select className="m-inp" value={form.tur} onChange={(e) => setForm((prev) => ({ ...prev, tur: e.target.value as CekSenetTur }))}>
                    {TUR_SECENEKLERI.map((item) => <option key={item.deger} value={item.deger}>{item.etiket}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Tarih</span>
                  <input type="date" className="m-inp date-click" value={form.tarih} onChange={(e) => setForm((prev) => ({ ...prev, tarih: e.target.value }))} />
                </label>
              </div>

              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Düzenleyen</span>
                  <input className="m-inp" value={form.duzenleyen} onChange={(e) => setForm((prev) => ({ ...prev, duzenleyen: e.target.value }))} placeholder="İsim / firma" />
                </label>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Tahsilat Tarihi</span>
                  <input type="date" className="m-inp date-click" value={form.tahTarihi} onChange={(e) => setForm((prev) => ({ ...prev, tahTarihi: e.target.value }))} />
                </label>
              </div>

              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Miktar</span>
                  <input type="number" step="0.01" className="m-inp" value={form.miktar} onChange={(e) => setForm((prev) => ({ ...prev, miktar: e.target.value }))} placeholder="0" style={{ textAlign: "right" }} />
                </label>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Banka</span>
                  <input className="m-inp" value={form.banka} onChange={(e) => setForm((prev) => ({ ...prev, banka: e.target.value }))} placeholder="Banka adı" />
                </label>
              </div>

              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
                <input ref={onYuzInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { void fotoSec("onYuzFoto", e.target.files?.[0]); e.currentTarget.value = ""; }} />
                <input ref={arkaYuzInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { void fotoSec("arkaYuzFoto", e.target.files?.[0]); e.currentTarget.value = ""; }} />
                {renderFotoAlani("Ön Yüz", "onYuzFoto", onYuzInputRef)}
                {renderFotoAlani("Arka Yüz", "arkaYuzFoto", arkaYuzInputRef)}
              </div>
            </div>

            <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "8px", background: "#f8fafc", borderRadius: "0 0 14px 14px" }}>
              <button onClick={formKapat} type="button" style={{ flex: 1, background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: "8px", padding: "10px", fontWeight: "bold", cursor: "pointer" }}>VAZGEÇ</button>
              <button onClick={handleKaydet} type="button" style={{ flex: 1, background: "#0f766e", border: "none", color: "#fff", borderRadius: "8px", padding: "10px", fontWeight: "bold", cursor: "pointer" }}>
                {editingId ? "GÜNCELLE" : "KAYDET"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detayKaydi && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1320, padding: "14px" }} onClick={() => setDetayKaydi(null)}>
          <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "460px", boxShadow: "0 20px 45px rgba(15, 23, 42, 0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, color: turBilgisiGetir(detayKaydi.tur).renk, fontSize: "16px" }}>{turBilgisiGetir(detayKaydi.tur).etiket}</h3>
              <button onClick={() => setDetayKaydi(null)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
            </div>
            <div style={{ padding: "14px 16px", display: "grid", gap: "8px", fontSize: "13px", color: "#475569" }}>
              <div><b>Tarih:</b> {String(detayKaydi.tarih || "").split("-").reverse().join(".")}</div>
              <div><b>Düzenleyen:</b> {detayKaydi.duzenleyen}</div>
              <div><b>Tahsilat Tarihi:</b> {String(detayKaydi.tahTarihi || "").split("-").reverse().join(".")}</div>
              <div><b>Miktar:</b> {fSayi(detayKaydi.miktar)} ₺</div>
              <div><b>Banka:</b> {detayKaydi.banka}</div>
              <div><b>Ekleyen:</b> {normalizeUsername(detayKaydi.ekleyen) || "-"}</div>
            </div>
            <div style={{ padding: "0 16px 16px", display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
              {renderDetayFoto("Ön Yüz", detayKaydi.onYuzFoto)}
              {renderDetayFoto("Arka Yüz", detayKaydi.arkaYuzFoto)}
            </div>
          </div>
        </div>
      )}

      {gorselOnizleme && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15,23,42,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1350, padding: "16px" }} onClick={() => setGorselOnizleme(null)}>
          <div style={{ width: "100%", maxWidth: "840px", background: "#111827", borderRadius: "14px", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.45)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "10px 12px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a" }}>
              <div style={{ fontWeight: "bold", fontSize: "13px" }}>{gorselOnizleme.baslik}</div>
              <button onClick={() => setGorselOnizleme(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: "20px", cursor: "pointer", padding: 0 }}>✕</button>
            </div>
            <div style={{ padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617" }}>
              <img src={gorselOnizleme.src} alt={gorselOnizleme.baslik} style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", borderRadius: "10px" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
