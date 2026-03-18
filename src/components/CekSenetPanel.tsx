import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CekSenetKaydi, CekSenetTur } from "../types/app";
import { getLocalDateString } from "../utils/date";
import { fSayi, normalizeUsername } from "../utils/format";

type CekSenetPanelProps = {
  aktifKullaniciKisa: string;
  aktifDonem: string;
};

type CekSenetFiltre = "hepsi" | CekSenetTur;
type CekSenetModalModu = "create" | "edit" | "view";
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

const FILTRE_SECENEKLERI: Array<{ deger: CekSenetFiltre; etiket: string }> = [
  { deger: "hepsi", etiket: "Hepsi" },
  { deger: "verilen_cek", etiket: "Verilen Çek" },
  { deger: "alinan_cek", etiket: "Alınan Çek" },
  { deger: "verilen_senet", etiket: "Verilen Senet" },
  { deger: "alinan_senet", etiket: "Alınan Senet" },
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

const turBilgisiGetir = (tur: CekSenetTur) =>
  TUR_SECENEKLERI.find((item) => item.deger === tur) || TUR_SECENEKLERI[0];

const fotografDurumuGetir = (kayit: Pick<CekSenetKaydi, "onYuzFoto" | "arkaYuzFoto">) => {
  const onVar = !!kayit.onYuzFoto;
  const arkaVar = !!kayit.arkaYuzFoto;
  if (onVar && arkaVar) return "2 Foto";
  if (onVar) return "Ön";
  if (arkaVar) return "Arka";
  return "-";
};

const localStorageOku = (): CekSenetKaydi[] => {
  if (typeof window === "undefined") return [];

  try {
    const ham = window.localStorage.getItem(STORAGE_KEY);
    if (!ham) return [];
    const parsed = JSON.parse(ham);
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

const dosyayiDataUrlYap = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });

const gorseliOptimizeEt = async (file: File) => {
  const dataUrl = await dosyayiDataUrlYap(file);
  if (!file.type.startsWith("image/")) return dataUrl;

  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxBoyut = 1280;
      const oran = Math.min(1, maxBoyut / Math.max(image.width || 1, image.height || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((image.width || 1) * oran));
      canvas.height = Math.max(1, Math.round((image.height || 1) * oran));
      const context = canvas.getContext("2d");

      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
};

export function CekSenetPanel({ aktifKullaniciKisa, aktifDonem }: CekSenetPanelProps) {
  const [kayitlar, setKayitlar] = useState<CekSenetKaydi[]>(() => localStorageOku());
  const [filtre, setFiltre] = useState<CekSenetFiltre>("hepsi");
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [modalModu, setModalModu] = useState<CekSenetModalModu>("create");
  const [form, setForm] = useState<CekSenetForm>(() => bosFormGetir(aktifDonem));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detayKaydi, setDetayKaydi] = useState<CekSenetKaydi | null>(null);
  const [openDropdown, setOpenDropdown] = useState<{ type: string; id: string } | null>(null);
  const [gorselOnizleme, setGorselOnizleme] = useState<{ src: string; baslik: string } | null>(null);
  const [isKaydediliyor, setIsKaydediliyor] = useState(false);
  const onYuzInputRef = useRef<HTMLInputElement | null>(null);
  const arkaYuzInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (modalModu !== "create") return;
    setForm((prev) => ({
      ...prev,
      tarih: varsayilanTarihGetir(aktifDonem),
      tahTarihi: prev.tahTarihi || varsayilanTarihGetir(aktifDonem),
    }));
  }, [aktifDonem, modalModu]);

  useEffect(() => {
    const handleStorage = () => setKayitlar(localStorageOku());
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

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

  const modalKapat = useCallback(() => {
    setIsFormModalOpen(false);
    setModalModu("create");
    setEditingId(null);
    setForm(bosFormGetir(aktifDonem));
  }, [aktifDonem]);

  const kayitlariGuncelle = useCallback((sonrakiKayitlar: CekSenetKaydi[]) => {
    setKayitlar(sonrakiKayitlar);
    if (!localStorageYaz(sonrakiKayitlar)) {
      alert("Kayıt saklanamadı. Tarayıcı depolama alanı dolu olabilir.");
      return false;
    }
    return true;
  }, []);

  const kayitSahibiMi = useCallback(
    (kayit?: Partial<CekSenetKaydi> | null) =>
      normalizeUsername(kayit?.ekleyen) === aktifKullaniciKisa,
    [aktifKullaniciKisa],
  );

  const filtrelenmisKayitlar = useMemo(
    () =>
      kayitlar
        .filter((kayit) => String(kayit.tarih || "").startsWith(aktifDonem))
        .filter((kayit) => filtre === "hepsi" || kayit.tur === filtre)
        .sort((a, b) => `${b.tarih}${b.createdAt || ""}`.localeCompare(`${a.tarih}${a.createdAt || ""}`)),
    [aktifDonem, filtre, kayitlar],
  );

  const toplamTutar = useMemo(
    () => filtrelenmisKayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.miktar), 0),
    [filtrelenmisKayitlar],
  );

  const kayitSayisi = filtrelenmisKayitlar.length;

  const formAc = (mod: CekSenetModalModu, kayit?: CekSenetKaydi) => {
    setIsFormModalOpen(true);
    setModalModu(mod);
    if (!kayit) {
      setEditingId(null);
      setForm(bosFormGetir(aktifDonem));
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
  };

  const handleFotoSec = async (alan: "onYuzFoto" | "arkaYuzFoto", file?: File | null) => {
    if (!file) return;

    try {
      const optimize = await gorseliOptimizeEt(file);
      setForm((prev) => ({ ...prev, [alan]: optimize }));
    } catch {
      alert("Fotoğraf yüklenemedi.");
    }
  };

  const handleKaydet = async () => {
    if (!form.tarih) return alert("Tarih seçin.");
    if (!form.duzenleyen.trim()) return alert("Düzenleyen girin.");
    if (!form.tahTarihi) return alert("Tah. tarihi seçin.");
    if (!form.miktar.trim() || sayiDegeri(form.miktar) <= 0) return alert("Geçerli miktar girin.");
    if (!form.banka.trim()) return alert("Banka girin.");

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
      createdAt: editingId
        ? kayitlar.find((item) => item.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };

    if (editingId) {
      const eskiKayit = kayitlar.find((item) => item.id === editingId);
      if (!kayitSahibiMi(eskiKayit)) return alert("Bu kaydı sadece ekleyen kullanıcı düzenleyebilir.");
    }

    setIsKaydediliyor(true);

    const sonrakiKayitlar = editingId
      ? kayitlar.map((item) => (item.id === editingId ? yeniKayit : item))
      : [yeniKayit, ...kayitlar];

    const kaydedildi = kayitlariGuncelle(sonrakiKayitlar);
    setIsKaydediliyor(false);
    if (!kaydedildi) return;

    modalKapat();
  };

  const handleSil = (kayit: CekSenetKaydi) => {
    if (!kayitSahibiMi(kayit)) return alert("Bu kaydı sadece ekleyen kullanıcı silebilir.");
    if (!confirm("Kayıt silinsin mi?")) return;

    const sonrakiKayitlar = kayitlar.filter((item) => item.id !== kayit.id);
    if (!kayitlariGuncelle(sonrakiKayitlar)) return;

    if (editingId === kayit.id) modalKapat();
  };

  return (
    <div className="tab-fade-in main-content-area">
      <div className="card" style={{ borderLeft: "4px solid #0f766e", marginBottom: "8px", padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, color: "#0f766e", fontSize: "16px" }}>Çek-Senet</h3>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginLeft: "auto" }}>
            <div style={{ minWidth: "88px", border: "1px solid #0f766e33", background: "#ecfdf5", color: "#0f766e", borderRadius: "10px", padding: "4px 8px", textAlign: "center" }}>
              <div style={{ fontSize: "9px", fontWeight: "bold" }}>KAYIT</div>
              <div style={{ fontSize: "14px", fontWeight: "bold", marginTop: "1px" }}>{fSayi(kayitSayisi)}</div>
            </div>
            <div style={{ minWidth: "112px", border: "1px solid #0369a133", background: "#f0f9ff", color: "#0369a1", borderRadius: "10px", padding: "4px 8px", textAlign: "center" }}>
              <div style={{ fontSize: "9px", fontWeight: "bold" }}>TOPLAM TUTAR</div>
              <div style={{ fontSize: "14px", fontWeight: "bold", marginTop: "1px" }}>{fSayi(toplamTutar)} ₺</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: "#cbd5e1", borderRadius: "8px", overflow: "hidden", flexWrap: "wrap" }}>
            {FILTRE_SECENEKLERI.map((secenek) => (
              <button
                key={secenek.deger}
                onClick={() => setFiltre(secenek.deger)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: "bold",
                  padding: "7px 10px",
                  background: filtre === secenek.deger ? "#0f766e" : "transparent",
                  color: filtre === secenek.deger ? "#fff" : "#475569",
                }}
              >
                {secenek.etiket}
              </button>
            ))}
          </div>

          <button
            onClick={() => formAc("create")}
            className="p-btn btn-anim"
            style={{ background: "#0f766e", minWidth: "118px", height: "34px", padding: "0 14px", fontSize: "12px", marginLeft: "auto" }}
          >
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
              <th style={{ width: "12%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>TAH. TAR.</th>
              <th style={{ width: "13%", textAlign: "right", background: "#5b9bd5", color: "#fff" }}>MİKTAR</th>
              <th style={{ width: "14%", textAlign: "left", background: "#5b9bd5", color: "#fff" }}>BANKA</th>
              <th style={{ width: "8%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>FOTO</th>
              <th style={{ width: "8%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>KİŞİ</th>
              <th style={{ width: "8%", background: "#5b9bd5" }}></th>
            </tr>
          </thead>
          <tbody>
            {filtrelenmisKayitlar.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "14px", color: "#94a3b8", fontWeight: "bold" }}>
                  Kayıt bulunmuyor.
                </td>
              </tr>
            )}
            {filtrelenmisKayitlar.map((kayit) => {
              const tur = turBilgisiGetir(kayit.tur);
              return (
                <tr key={kayit.id}>
                  <td style={{ textAlign: "center" }}>{kayit.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
                  <td style={{ textAlign: "left" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", borderRadius: "999px", padding: "4px 7px", background: tur.arkaPlan, color: tur.renk, fontWeight: "bold", fontSize: "10px" }}>
                      {tur.etiket}
                    </span>
                  </td>
                  <td style={{ fontWeight: "bold", textAlign: "left" }}>{kayit.duzenleyen}</td>
                  <td style={{ textAlign: "center" }}>{kayit.tahTarihi.split("-").reverse().slice(0, 2).join(".")}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold", color: "#0f766e" }}>{fSayi(kayit.miktar)}</td>
                  <td style={{ textAlign: "left" }}>{kayit.banka}</td>
                  <td style={{ textAlign: "center", fontWeight: "bold", color: "#64748b" }}>{fotografDurumuGetir(kayit)}</td>
                  <td style={{ textAlign: "center", color: "#64748b" }}>{normalizeUsername(kayit.ekleyen) || "-"}</td>
                  <td className="actions-cell" style={{ position: "relative" }}>
                    <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: "cek_senet", id: kayit.id }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "0 8px", color: "#64748b" }}>⋮</button>
                    {openDropdown?.type === "cek_senet" && openDropdown.id === kayit.id && (
                      <div className="dropdown-menu">
                        <button title="Detay Gör" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setDetayKaydi(kayit); }}>🔍</button>
                        {kayitSahibiMi(kayit) && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); formAc("edit", kayit); }}>✏️</button>}
                        {kayitSahibiMi(kayit) && <button title="Sil" className="dropdown-item-icon" style={{ color: "#dc2626" }} onClick={() => { setOpenDropdown(null); handleSil(kayit); }}>🗑️</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isFormModalOpen && modalModu !== "view" && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1320, padding: "14px" }} onClick={modalKapat}>
          <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 45px rgba(15, 23, 42, 0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, color: "#0f766e", fontSize: "16px" }}>{editingId ? "Çek-Senet Düzenle" : "Yeni Çek-Senet"}</h3>
              <button onClick={modalKapat} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
            </div>

            <div style={{ padding: "14px 16px", display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Tür</span>
                  <select className="m-inp" value={form.tur} onChange={(e) => setForm((prev) => ({ ...prev, tur: e.target.value as CekSenetTur }))} style={{ width: "100%" }}>
                    {TUR_SECENEKLERI.map((item) => <option key={item.deger} value={item.deger}>{item.etiket}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Tarih</span>
                  <input type="date" className="m-inp date-click" value={form.tarih} onChange={(e) => setForm((prev) => ({ ...prev, tarih: e.target.value }))} style={{ width: "100%" }} />
                </label>
              </div>

              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Düzenleyen</span>
                  <input className="m-inp" value={form.duzenleyen} onChange={(e) => setForm((prev) => ({ ...prev, duzenleyen: e.target.value }))} placeholder="İsim / firma" style={{ width: "100%" }} />
                </label>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Tah. Tarihi</span>
                  <input type="date" className="m-inp date-click" value={form.tahTarihi} onChange={(e) => setForm((prev) => ({ ...prev, tahTarihi: e.target.value }))} style={{ width: "100%" }} />
                </label>
              </div>

              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Miktar</span>
                  <input type="number" step="0.01" className="m-inp" value={form.miktar} onChange={(e) => setForm((prev) => ({ ...prev, miktar: e.target.value }))} placeholder="0" style={{ width: "100%", textAlign: "right" }} />
                </label>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>Banka</span>
                  <input className="m-inp" value={form.banka} onChange={(e) => setForm((prev) => ({ ...prev, banka: e.target.value }))} placeholder="Banka adı" style={{ width: "100%" }} />
                </label>
              </div>

              <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
                <input ref={onYuzInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { void handleFotoSec("onYuzFoto", e.target.files?.[0]); e.currentTarget.value = ""; }} />
                <input ref={arkaYuzInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { void handleFotoSec("arkaYuzFoto", e.target.files?.[0]); e.currentTarget.value = ""; }} />

                <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px", background: "#f8fafc" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", marginBottom: "8px" }}>Ön Yüz</div>
                  {form.onYuzFoto ? (
                    <img src={form.onYuzFoto} alt="Ön yüz" style={{ width: "100%", height: "112px", objectFit: "cover", borderRadius: "8px", marginBottom: "8px", cursor: "pointer" }} onClick={() => setGorselOnizleme({ src: form.onYuzFoto, baslik: "Ön Yüz" })} />
                  ) : (
                    <div style={{ height: "112px", borderRadius: "8px", border: "1px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "11px", marginBottom: "8px" }}>Foto yok</div>
                  )}
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => onYuzInputRef.current?.click()} type="button" style={{ flex: 1, border: "1px solid #0f766e33", background: "#ecfdf5", color: "#0f766e", borderRadius: "8px", padding: "7px 8px", fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}>Foto Yükle</button>
                    {form.onYuzFoto && <button onClick={() => setForm((prev) => ({ ...prev, onYuzFoto: "" }))} type="button" style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", padding: "7px 8px", fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}>Sil</button>}
                  </div>
                </div>

                <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px", background: "#f8fafc" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", marginBottom: "8px" }}>Arka Yüz</div>
                  {form.arkaYuzFoto ? (
                    <img src={form.arkaYuzFoto} alt="Arka yüz" style={{ width: "100%", height: "112px", objectFit: "cover", borderRadius: "8px", marginBottom: "8px", cursor: "pointer" }} onClick={() => setGorselOnizleme({ src: form.arkaYuzFoto, baslik: "Arka Yüz" })} />
                  ) : (
                    <div style={{ height: "112px", borderRadius: "8px", border: "1px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "11px", marginBottom: "8px" }}>Foto yok</div>
                  )}
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => arkaYuzInputRef.current?.click()} type="button" style={{ flex: 1, border: "1px solid #0f766e33", background: "#ecfdf5", color: "#0f766e", borderRadius: "8px", padding: "7px 8px", fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}>Foto Yükle</button>
                    {form.arkaYuzFoto && <button onClick={() => setForm((prev) => ({ ...prev, arkaYuzFoto: "" }))} type="button" style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", padding: "7px 8px", fontWeight: "bold", cursor: "pointer", fontSize: "11px" }}>Sil</button>}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "8px", background: "#f8fafc", borderRadius: "0 0 14px 14px" }}>
              <button onClick={modalKapat} type="button" style={{ flex: 1, background: "#fff", border: "1px solid #cbd5e1", color: "#475569", borderRadius: "8px", padding: "10px", fontWeight: "bold", cursor: "pointer" }}>VAZGEÇ</button>
              <button onClick={() => void handleKaydet()} type="button" disabled={isKaydediliyor} style={{ flex: 1, background: "#0f766e", border: "none", color: "#fff", borderRadius: "8px", padding: "10px", fontWeight: "bold", cursor: isKaydediliyor ? "wait" : "pointer", opacity: isKaydediliyor ? 0.7 : 1 }}>
                {isKaydediliyor ? "KAYDEDİLİYOR" : editingId ? "GÜNCELLE" : "KAYDET"}
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
              <div><b>Tarih:</b> {detayKaydi.tarih.split("-").reverse().join(".")}</div>
              <div><b>Düzenleyen:</b> {detayKaydi.duzenleyen}</div>
              <div><b>Tah. Tarihi:</b> {detayKaydi.tahTarihi.split("-").reverse().join(".")}</div>
              <div><b>Miktar:</b> {fSayi(detayKaydi.miktar)} ₺</div>
              <div><b>Banka:</b> {detayKaydi.banka}</div>
              <div><b>Ekleyen:</b> {normalizeUsername(detayKaydi.ekleyen) || "-"}</div>
            </div>
            <div style={{ padding: "0 16px 16px", display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px", background: "#f8fafc" }}>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", marginBottom: "8px" }}>Ön Yüz</div>
                {detayKaydi.onYuzFoto ? (
                  <img src={detayKaydi.onYuzFoto} alt="Ön yüz" style={{ width: "100%", height: "120px", objectFit: "cover", borderRadius: "8px", cursor: "pointer" }} onClick={() => setGorselOnizleme({ src: detayKaydi.onYuzFoto || "", baslik: "Ön Yüz" })} />
                ) : (
                  <div style={{ height: "120px", borderRadius: "8px", border: "1px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "11px" }}>Foto yok</div>
                )}
              </div>
              <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px", background: "#f8fafc" }}>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", marginBottom: "8px" }}>Arka Yüz</div>
                {detayKaydi.arkaYuzFoto ? (
                  <img src={detayKaydi.arkaYuzFoto} alt="Arka yüz" style={{ width: "100%", height: "120px", objectFit: "cover", borderRadius: "8px", cursor: "pointer" }} onClick={() => setGorselOnizleme({ src: detayKaydi.arkaYuzFoto || "", baslik: "Arka Yüz" })} />
                ) : (
                  <div style={{ height: "120px", borderRadius: "8px", border: "1px dashed #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "11px" }}>Foto yok</div>
                )}
              </div>
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
