/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DonemDisiTarihUyarisi } from "./DonemDisiTarihUyarisi";
import { supabase } from "../lib/supabase";
import {
  katkiOdemesiMi,
  kovaOdemesiMi,
  kremaOdemesiMi,
  normalGiderMi,
  sutOdemesiMi,
  sutTozuOdemesiMi,
} from "../lib/gider";
import type { Gider, SortConfig } from "../types/app";
import { aktifDonemDisiKayitOnayMetni, getLocalDateString } from "../utils/date";
import { normalizeUsername } from "../utils/format";

type MiniDetay = {
  baslik: string;
  renk: string;
  satirlar: Array<{ etiket: string; deger: string; vurgu?: boolean }>;
} | null;

type GorselOnizleme = { url: string; baslik: string; boyut?: string; indirmeAdi?: string } | null;

type GiderPanelProps = {
  aktifDonem: string;
  aktifKullaniciEposta: string;
  aktifKullaniciId: string | null;
  aktifKullaniciKisa: string;
  giderTurleri: string[];
  periodGider: Gider[];
  kaydiSilebilirMi: (ekleyen?: string | null) => boolean;
  kaydiDuzenleyebilirMi: (ekleyen?: string | null) => boolean;
  onRefreshGiderler: () => void | Promise<void>;
  onRefreshCop: () => void | Promise<void>;
  onOpenMiniDetay: (detay: MiniDetay) => void;
  onPreviewImage: (payload: GorselOnizleme) => void;
  helpers: {
    fSayi: (num: any) => string;
    veritabaniHatasiMesaji: (tablo: string, hata: { message?: string } | null) => string;
    kolonBulunamadiMi: (hata: { message?: string } | null | undefined, tabloAdi: string, kolonAdi: string) => boolean;
    paraGirdisiniTemizle: (value: string) => string;
    paraGirdisiniSayiyaCevir: (value: string) => number;
    paraGirdisiniFormatla: (value: string) => string;
    dosyaAdiIcinTemizle: (deger?: string | null) => string;
    gorseliYuklemeIcinKucult: (dosya: File) => Promise<File>;
    fisGorselStorageYolu: (raw?: string | null) => string;
    gorselBoyutunuGetir: (url: string) => Promise<string>;
    gorselIndirmeAdiBul: (kaynak?: string | null, varsayilan?: string) => string;
  };
};

const varsayilanTarihGetir = (aktifDonem: string) => {
  const bugun = getLocalDateString();
  return bugun.startsWith(aktifDonem) ? bugun : `${aktifDonem}-01`;
};

const giderSaatiFormatla = (value?: string | null) => {
  if (!value) return "-";
  const tarih = new Date(value);
  if (Number.isNaN(tarih.getTime())) return "-";
  return tarih.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

const sortData = (data: any[], sortConfig: SortConfig) => {
  if (!sortConfig.key) return data;
  return [...data].sort((a, b) => {
    const valA = a[sortConfig.key];
    const valB = b[sortConfig.key];
    const numA = Number(valA);
    const numB = Number(valB);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && valA !== "" && valB !== "") {
      if (numA < numB) return sortConfig.direction === "asc" ? -1 : 1;
      if (numA > numB) return sortConfig.direction === "asc" ? 1 : -1;
    } else {
      const strA = String(valA || "");
      const strB = String(valB || "");
      if (strA < strB) return sortConfig.direction === "asc" ? -1 : 1;
      if (strA > strB) return sortConfig.direction === "asc" ? 1 : -1;
    }
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
};

const handleSortClick = (sortKey: string, currentSort: SortConfig, setSort: (next: SortConfig) => void) => {
  if (currentSort.key === sortKey) {
    setSort({ key: sortKey, direction: currentSort.direction === "asc" ? "desc" : "asc" });
  } else {
    setSort({ key: sortKey, direction: "desc" });
  }
};

const GiderTh = ({
  label, sortKey, currentSort, setSort, align = "left", filterType = null, setFilterModal,
}: any) => (
  <th style={{ textAlign: align }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: align === "center" ? "center" : "space-between", gap: "4px", cursor: "pointer" }} onClick={() => handleSortClick(sortKey, currentSort, setSort)}>
      <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start", flex: align === "center" ? "0 1 auto" : 1 }}>
        <span>{label}</span>
        {filterType && (
          <span onClick={(e) => { e.stopPropagation(); setFilterModal(filterType); }} style={{ fontSize: "10px", padding: "2px", background: "#e2e8f0", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            🔽
          </span>
        )}
      </div>
      <span style={{ fontSize: "9px", color: "#94a3b8", visibility: currentSort.key === sortKey ? "visible" : "hidden" }}>
        {currentSort.key === sortKey ? (currentSort.direction === "asc" ? "▲" : "▼") : "▼"}
      </span>
    </div>
  </th>
);

export function GiderPanel({
  aktifDonem,
  aktifKullaniciEposta,
  aktifKullaniciId,
  aktifKullaniciKisa,
  giderTurleri,
  periodGider,
  kaydiSilebilirMi,
  kaydiDuzenleyebilirMi,
  onRefreshGiderler,
  onRefreshCop,
  onOpenMiniDetay,
  onPreviewImage,
  helpers,
}: GiderPanelProps) {
  const [giderFiltreKisi, setGiderFiltreKisi] = useState<"benim" | "tumu">("benim");
  const [giderFiltre, setGiderFiltre] = useState<{ turler: string[]; kisiler: string[] }>({ turler: [], kisiler: [] });
  const [isGiderModalOpen, setIsGiderModalOpen] = useState(false);
  const [editingGiderId, setEditingGiderId] = useState<string | null>(null);
  const [giderModalMode, setGiderModalMode] = useState<"create" | "edit" | "view">("create");
  const [giderForm, setGiderForm] = useState<Gider>({ tarih: varsayilanTarihGetir(aktifDonem), tur: "Genel Gider", aciklama: "", tutar: "" });
  const [giderGorselDosya, setGiderGorselDosya] = useState<File | null>(null);
  const [giderGorselMevcutYol, setGiderGorselMevcutYol] = useState("");
  const [giderSort, setGiderSort] = useState<SortConfig>({ key: "tarih", direction: "desc" });
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [activeFilterModal, setActiveFilterModal] = useState<"gider_tur" | "gider_kisi" | null>(null);
  const giderGorselKameraInputRef = useRef<HTMLInputElement | null>(null);
  const giderGorselGaleriInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isGiderModalOpen || editingGiderId) return;
    setGiderForm((prev) => ({ ...prev, tarih: varsayilanTarihGetir(aktifDonem) }));
  }, [aktifDonem, editingGiderId, isGiderModalOpen]);

  useEffect(() => {
    if (!openDropdownId) return;
    const handleDisTiklama = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest(".dropdown-menu") || target.closest(".actions-cell")) return;
      setOpenDropdownId(null);
    };
    document.addEventListener("mousedown", handleDisTiklama);
    document.addEventListener("touchstart", handleDisTiklama, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleDisTiklama);
      document.removeEventListener("touchstart", handleDisTiklama);
    };
  }, [openDropdownId]);

  const giderTurFiltreSecenekleri = useMemo(() => [...new Set(periodGider.map((g) => g.tur).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [periodGider]);
  const giderKisiFiltreSecenekleri = useMemo(() => [...new Set(periodGider.map((g) => normalizeUsername(g.ekleyen)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [periodGider]);
  const giderGorselDosyaAdi = useMemo(() => giderGorselDosya?.name || (giderGorselMevcutYol.split("/").pop() || ""), [giderGorselDosya, giderGorselMevcutYol]);

  const fGiderList = useMemo(() => sortData(periodGider.filter((g) => {
    const giderKisi = normalizeUsername(g.ekleyen);
    const kisiEslesiyor = giderFiltreKisi === "tumu" || giderKisi === aktifKullaniciKisa;
    const turEslesiyor = giderFiltre.turler.length === 0 || giderFiltre.turler.includes(g.tur);
    const filtreKisiEslesiyor = giderFiltre.kisiler.length === 0 || giderFiltre.kisiler.includes(giderKisi);
    return kisiEslesiyor && turEslesiyor && filtreKisiEslesiyor;
  }), giderSort), [aktifKullaniciKisa, giderFiltre, giderFiltreKisi, giderSort, periodGider]);

  const fGGiderNormal = useMemo(() => fGiderList.filter((g) => normalGiderMi(g.tur)).reduce((a, b) => a + Number(b.tutar), 0), [fGiderList]);
  const fGSutOdemesi = useMemo(() => fGiderList.filter((g) => sutOdemesiMi(g.tur)).reduce((a, b) => a + Number(b.tutar), 0), [fGiderList]);
  const fGKremaOdemesi = useMemo(() => fGiderList.filter((g) => kremaOdemesiMi(g.tur)).reduce((a, b) => a + Number(b.tutar), 0), [fGiderList]);
  const fGKovaOdemesi = useMemo(() => fGiderList.filter((g) => kovaOdemesiMi(g.tur)).reduce((a, b) => a + Number(b.tutar), 0), [fGiderList]);
  const fGKatkiOdemesi = useMemo(() => fGiderList.filter((g) => katkiOdemesiMi(g.tur)).reduce((a, b) => a + Number(b.tutar), 0), [fGiderList]);
  const fGSutTozuOdemesi = useMemo(() => fGiderList.filter((g) => sutTozuOdemesiMi(g.tur)).reduce((a, b) => a + Number(b.tutar), 0), [fGiderList]);
  const fGHammaddeOdemeleri = fGSutOdemesi + fGKremaOdemesi + fGKovaOdemesi + fGKatkiOdemesi + fGSutTozuOdemesi;

  const resetGiderFormu = () => {
    setGiderForm({ tarih: varsayilanTarihGetir(aktifDonem), tur: "Genel Gider", aciklama: "", tutar: "" });
    setGiderGorselDosya(null);
    setGiderGorselMevcutYol("");
    setEditingGiderId(null);
    setGiderModalMode("create");
  };
  const handleGiderModalKapat = () => { setIsGiderModalOpen(false); resetGiderFormu(); };
  const handleYeniGiderModalAc = () => { resetGiderFormu(); setIsGiderModalOpen(true); };

  const handleGiderGoruntule = (gider: Gider) => {
    setEditingGiderId(gider.id || null);
    setGiderForm({ tarih: gider.tarih, tur: gider.tur, aciklama: gider.aciklama || "", tutar: gider.tutar, ekleyen: gider.ekleyen, gorsel: gider.gorsel, created_at: gider.created_at });
    setGiderGorselDosya(null);
    setGiderGorselMevcutYol(gider.gorsel || "");
    setGiderModalMode("view");
    setIsGiderModalOpen(true);
  };
  const handleGiderDuzenle = (gider: Gider) => {
    setEditingGiderId(gider.id || null);
    setGiderForm({ tarih: gider.tarih, tur: gider.tur, aciklama: gider.aciklama || "", tutar: gider.tutar, ekleyen: gider.ekleyen, gorsel: gider.gorsel, created_at: gider.created_at });
    setGiderGorselDosya(null);
    setGiderGorselMevcutYol(gider.gorsel || "");
    setGiderModalMode("edit");
    setIsGiderModalOpen(true);
  };

  const handleGiderGorselSec = (event: ChangeEvent<HTMLInputElement>) => {
    const secilen = event.target.files?.[0];
    event.target.value = "";
    if (!secilen) return;
    if (!secilen.type.startsWith("image/")) return alert("Lütfen sadece görsel dosyası seçin.");
    setGiderGorselDosya(secilen);
  };
  const handleGiderGorselTemizle = () => { setGiderGorselDosya(null); setGiderGorselMevcutYol(""); };

  const giderGorseliniSil = async (yol?: string | null) => {
    const storageYolu = helpers.fisGorselStorageYolu(yol);
    if (!storageYolu) return;
    await supabase.storage.from("fis_gorselleri").remove([storageYolu]);
  };

  const giderGorseliYukle = async () => {
    if (!giderGorselDosya) return giderGorselMevcutYol || null;
    const optimizeDosya = await helpers.gorseliYuklemeIcinKucult(giderGorselDosya);
    const tarihParcasi = String(giderForm.tarih || getLocalDateString()).replace(/-/g, "");
    const turSlug = helpers.dosyaAdiIcinTemizle(giderForm.tur || "gider");
    const kullaniciSlug = helpers.dosyaAdiIcinTemizle(aktifKullaniciKisa || aktifKullaniciEposta || "kullanici");
    const rastgeleEk = Math.random().toString(36).slice(2, 8).toUpperCase();
    const dosyaYolu = `giderler/${turSlug}/${tarihParcasi}-${turSlug}-${kullaniciSlug}-${rastgeleEk}.jpg`;
    const { error } = await supabase.storage.from("fis_gorselleri").upload(dosyaYolu, optimizeDosya, { contentType: optimizeDosya.type, upsert: false });
    if (error) throw error;
    return dosyaYolu;
  };

  const handleGiderGorselGoster = async (gider: Gider) => {
    if (!gider.gorsel) return;
    const raw = gider.gorsel;
    const storageYolu = helpers.fisGorselStorageYolu(raw);
    const baslik = `${gider.tur || "Gider"} • ${gider.tarih ? gider.tarih.split("-").reverse().join(".") : ""}`;
    if (!storageYolu && (raw.startsWith("http://") || raw.startsWith("https://"))) {
      const boyut = await helpers.gorselBoyutunuGetir(raw);
      onPreviewImage({ url: raw, baslik, boyut, indirmeAdi: helpers.gorselIndirmeAdiBul(raw, `${helpers.dosyaAdiIcinTemizle(baslik) || "gider"}.jpg`) });
      return;
    }
    if (!storageYolu) return alert("Gider görseli açılamadı.");
    const { data, error } = await supabase.storage.from("fis_gorselleri").createSignedUrl(storageYolu, 60 * 10);
    if (error || !data?.signedUrl) return alert(`Gider görseli açılamadı: ${error?.message || "Bilinmeyen hata"}`);
    const boyut = await helpers.gorselBoyutunuGetir(data.signedUrl);
    onPreviewImage({ url: data.signedUrl, baslik, boyut, indirmeAdi: helpers.gorselIndirmeAdiBul(raw, `${helpers.dosyaAdiIcinTemizle(baslik) || "gider"}.jpg`) });
  };

  const handleGiderKaydet = async () => {
    if (!giderForm.tarih || !giderForm.tur || !giderForm.tutar) return alert("Tarih, Tür ve Tutar zorunludur!");
    const duzenlenenKayit = periodGider.find((item) => item.id === editingGiderId);
    if (editingGiderId && !kaydiDuzenleyebilirMi(duzenlenenKayit?.ekleyen)) return alert("Bu gider kaydını sadece ekleyen kullanıcı veya admin düzenleyebilir.");
    const donemDisiOnayMesaji = aktifDonemDisiKayitOnayMetni(giderForm.tarih, aktifDonem);
    if (donemDisiOnayMesaji && !window.confirm(donemDisiOnayMesaji)) return;
    const oncekiGorsel = duzenlenenKayit?.gorsel || giderGorselMevcutYol || "";
    let yuklenenGorselYolu = giderGorselMevcutYol || null;
    try { yuklenenGorselYolu = await giderGorseliYukle(); } catch (error: any) { return alert(`Gider görseli yüklenemedi: ${error?.message || "Bilinmeyen hata"}`); }
    const { created_at: _createdAt, ...kayitFormu } = giderForm;
    const payload = { ...kayitFormu, tutar: helpers.paraGirdisiniSayiyaCevir(String(giderForm.tutar || "")), ekleyen: aktifKullaniciEposta, gorsel: yuklenenGorselYolu };
    const kaydet = (body: typeof payload) => editingGiderId ? supabase.from("giderler").update(body).eq("id", editingGiderId) : supabase.from("giderler").insert(body);
    let { error } = await kaydet(payload);
    if (error && helpers.kolonBulunamadiMi(error, "giderler", "gorsel")) {
      if (giderGorselDosya || giderGorselMevcutYol) {
        if (giderGorselDosya && yuklenenGorselYolu && yuklenenGorselYolu !== oncekiGorsel) await giderGorseliniSil(yuklenenGorselYolu);
        return alert("Gider görseli kolonu veritabanında yok. Önce SQL dosyasını çalıştırın: add-gider-gorseli-column.sql");
      }
      ({ error } = await kaydet({ ...payload, gorsel: undefined } as any));
    }
    if (error) {
      if (giderGorselDosya && yuklenenGorselYolu && yuklenenGorselYolu !== oncekiGorsel) await giderGorseliniSil(yuklenenGorselYolu);
      return alert(`Hata: ${helpers.veritabaniHatasiMesaji("Gider", error)}`);
    }
    if (editingGiderId && oncekiGorsel && oncekiGorsel !== yuklenenGorselYolu) await giderGorseliniSil(oncekiGorsel);
    handleGiderModalKapat();
    await onRefreshGiderler();
  };

  const handleGiderSil = async (gider: Gider) => {
    if (!kaydiSilebilirMi(gider.ekleyen)) return alert("Bu kaydı sadece ekleyen kullanıcı veya admin silebilir.");
    if (!window.confirm("Bu gider kaydı silinsin mi?")) return;
    const { error: copError } = await supabase.from("cop_kutusu").insert({
      tablo_adi: "giderler",
      veri: gider,
      silinme_tarihi: new Date().toISOString(),
      silen_user_id: aktifKullaniciId,
      silen_email: aktifKullaniciEposta,
    });
    if (copError) return alert(`Çöp kutusu hatası: ${copError.message}`);
    const { error } = await supabase.from("giderler").delete().eq("id", gider.id);
    if (error) return alert(`Silme hatası: ${helpers.veritabaniHatasiMesaji("Gider", error)}`);
    await onRefreshGiderler();
    await onRefreshCop();
  };

  const giderDetayTarih = giderForm.tarih ? giderForm.tarih.split("-").reverse().join(".") : "-";
  const giderDetaySaat = giderSaatiFormatla(giderForm.created_at);
  const giderDetayKisi = normalizeUsername(giderForm.ekleyen) || "-";
  const giderDetayTutar = helpers.fSayi(giderForm.tutar || 0);

  return (
    <>
      <div className="tab-fade-in main-content-area">
        <div className="gider-ust-satir" style={{ display: "flex", gap: "8px", flexWrap: "nowrap", alignItems: "center", marginBottom: "10px" }}>
          <button onClick={handleYeniGiderModalAc} className="btn-anim m-btn inline-mobile-btn" style={{ background: "#dc2626", margin: 0, width: "auto", minWidth: "136px", flex: "0 0 auto", fontSize: "13px", padding: "10px 12px" }}>➕ YENİ GİDER EKLE</button>
          <div style={{ display: "flex", gap: "6px", flex: "1 1 auto", minWidth: "0", flexWrap: "wrap" }}>
            <div className="gider-ust-ozet" style={{ border: "1px solid #dc262633", background: "#dc262610", color: "#dc2626", borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", flex: "1 1 120px", minWidth: "100px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>GİDERLER: {helpers.fSayi(fGGiderNormal)} ₺</div>
            <div className="gider-ust-ozet" onClick={() => onOpenMiniDetay({ baslik: "Hammadde Ödemeleri", renk: "#7c3aed", satirlar: [{ etiket: "Süt Ödemesi", deger: `${helpers.fSayi(fGSutOdemesi)} TL`, vurgu: true }, { etiket: "Krema Ödemesi", deger: `${helpers.fSayi(fGKremaOdemesi)} TL`, vurgu: true }, { etiket: "Kova Ödemesi", deger: `${helpers.fSayi(fGKovaOdemesi)} TL`, vurgu: true }, { etiket: "Katkı Ödemesi", deger: `${helpers.fSayi(fGKatkiOdemesi)} TL`, vurgu: true }, { etiket: "Süt Tozu Ödemesi", deger: `${helpers.fSayi(fGSutTozuOdemesi)} TL`, vurgu: true }] })} style={{ border: "1px solid #8b5cf633", background: "#8b5cf610", color: "#7c3aed", borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", flex: "1 1 145px", minWidth: "125px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>HAMMADDE ÖDEMELERİ: {helpers.fSayi(fGHammaddeOdemeleri)} ₺</div>
          </div>
          <div className="gider-filtre-grup" style={{ display: "flex", background: "#cbd5e1", borderRadius: "8px", overflow: "hidden", flex: "0 0 auto", minWidth: "110px", marginLeft: "auto" }}>
            <button onClick={() => setGiderFiltreKisi("benim")} style={{ flex: 1, padding: "8px 10px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", background: giderFiltreKisi === "benim" ? "#dc2626" : "transparent", color: giderFiltreKisi === "benim" ? "#fff" : "#475569" }}>Benim</button>
            <button onClick={() => setGiderFiltreKisi("tumu")} style={{ flex: 1, padding: "8px 10px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", background: giderFiltreKisi === "tumu" ? "#dc2626" : "transparent", color: giderFiltreKisi === "tumu" ? "#fff" : "#475569" }}>Tümü</button>
          </div>
        </div>

        <div className="table-wrapper" style={{ overflowX: "hidden" }}><table className="tbl tbl-gider" style={{ borderTop: "3px solid #fca5a5", tableLayout: "fixed", minWidth: 0 }}><thead><tr>
          <GiderTh label="TARİH" sortKey="tarih" currentSort={giderSort} setSort={setGiderSort} setFilterModal={setActiveFilterModal} />
          <GiderTh label="TÜR" sortKey="tur" currentSort={giderSort} setSort={setGiderSort} filterType="gider_tur" setFilterModal={setActiveFilterModal} />
          <GiderTh label="TUTAR" sortKey="tutar" currentSort={giderSort} setSort={setGiderSort} align="right" setFilterModal={setActiveFilterModal} />
          <GiderTh label="AÇIKLAMA" sortKey="aciklama" currentSort={giderSort} setSort={setGiderSort} setFilterModal={setActiveFilterModal} />
          <GiderTh label="KİŞİ" sortKey="ekleyen" currentSort={giderSort} setSort={setGiderSort} align="center" filterType="gider_kisi" setFilterModal={setActiveFilterModal} />
          <th />
        </tr></thead><tbody>{fGiderList.map((g) => {
          const silinebilir = kaydiSilebilirMi(g.ekleyen);
          const duzenlenebilir = kaydiDuzenleyebilirMi(g.ekleyen);
          return <tr key={g.id}>
            <td style={{ textAlign: "center" }}>{g.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }} title={g.tur}>{g.tur}</td>
            <td style={{ textAlign: "right", color: "#dc2626", fontWeight: "bold" }}>{helpers.fSayi(g.tutar)}</td>
            <td style={{ color: "#64748b", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.aciklama || "-"}>{g.aciklama || "-"}</td>
            <td style={{ textAlign: "center", color: "#64748b" }}>{g.ekleyen ? g.ekleyen.split("@")[0] : "-"}</td>
            <td className="actions-cell" style={{ position: "relative" }}>
              <button onClick={(e) => { e.stopPropagation(); setOpenDropdownId(String(g.id)); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "0 8px", color: "#64748b" }}>⋮</button>
              {openDropdownId === String(g.id) && <div className="dropdown-menu">
                <button title="Detay Gör" className="dropdown-item-icon" onClick={() => { setOpenDropdownId(null); handleGiderGoruntule(g); }}>🔍</button>
                {g.gorsel && <button title="Fotoğrafı Gör" className="dropdown-item-icon" onClick={() => { setOpenDropdownId(null); void handleGiderGorselGoster(g); }}>📷</button>}
                {duzenlenebilir && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdownId(null); handleGiderDuzenle(g); }}>✏️</button>}
                {silinebilir && <button title="Sil" className="dropdown-item-icon" style={{ color: "#dc2626" }} onClick={() => { setOpenDropdownId(null); void handleGiderSil(g); }}>🗑️</button>}
              </div>}
            </td>
          </tr>;
        })}</tbody></table></div>
      </div>

      {activeFilterModal && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setActiveFilterModal(null)}>
        <div style={{ backgroundColor: "#fff", padding: "15px", borderRadius: "10px", width: "100%", maxWidth: "260px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
          <h4 style={{ marginTop: 0, marginBottom: "10px", borderBottom: "1px solid #eee", paddingBottom: "5px", color: "#1e293b" }}>Filtrele</h4>
          <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" }}>
            {activeFilterModal === "gider_tur" && giderTurFiltreSecenekleri.map((tur) => <label key={tur} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}><input type="checkbox" checked={giderFiltre.turler.includes(tur)} onChange={() => setGiderFiltre((prev) => ({ ...prev, turler: prev.turler.includes(tur) ? prev.turler.filter((x) => x !== tur) : [...prev.turler, tur] }))} style={{ width: "18px", height: "18px" }} /> {tur}</label>)}
            {activeFilterModal === "gider_kisi" && giderKisiFiltreSecenekleri.map((kisi) => <label key={kisi} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}><input type="checkbox" checked={giderFiltre.kisiler.includes(kisi)} onChange={() => setGiderFiltre((prev) => ({ ...prev, kisiler: prev.kisiler.includes(kisi) ? prev.kisiler.filter((x) => x !== kisi) : [...prev.kisiler, kisi] }))} style={{ width: "18px", height: "18px" }} /> {kisi}</label>)}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "15px" }}>
            <button onClick={() => activeFilterModal === "gider_tur" ? setGiderFiltre((prev) => ({ ...prev, turler: [] })) : setGiderFiltre((prev) => ({ ...prev, kisiler: [] }))} style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: "6px", fontWeight: "bold" }}>TEMİZLE</button>
            <button onClick={() => setActiveFilterModal(null)} style={{ flex: 1, padding: "10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}>UYGULA</button>
          </div>
        </div>
      </div>}

      {isGiderModalOpen && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "10px" }} onClick={handleGiderModalKapat}>
        <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "350px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: giderModalMode === "view" ? "#eff6ff" : editingGiderId ? "#fef2f2" : "#f8fafc", borderRadius: "12px 12px 0 0" }}><h3 style={{ margin: 0, color: giderModalMode === "view" ? "#2563eb" : "#dc2626", fontSize: "15px" }}>{giderModalMode === "view" ? "🔍 Gider Detayı" : editingGiderId ? "✏️ Gider Düzenle" : "💸 Yeni Gider"}</h3><button onClick={handleGiderModalKapat} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button></div>
          {giderModalMode === "view" ? (
            <>
              <div style={{ padding: "16px 15px", background: "#f8fafc" }}>
                <div style={{ background: "#fff", border: "1px dashed #cbd5e1", borderRadius: "12px", padding: "16px 14px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace", color: "#0f172a", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}>
                  <div style={{ textAlign: "center", fontWeight: 700, fontSize: "16px", letterSpacing: "0.08em", marginBottom: "4px" }}>GIDER FISI</div>
                  <div style={{ textAlign: "center", fontSize: "11px", color: "#64748b", marginBottom: "12px" }}>Sultankoy V3</div>
                  <div style={{ borderTop: "1px dashed #cbd5e1", margin: "10px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", marginBottom: "6px" }}>
                    <span>Tarih</span>
                    <b>{giderDetayTarih}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", marginBottom: "6px" }}>
                    <span>Saat</span>
                    <b>{giderDetaySaat}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", marginBottom: "6px" }}>
                    <span>Ekleyen</span>
                    <b>{giderDetayKisi}</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", marginBottom: "6px" }}>
                    <span>Tur</span>
                    <b style={{ textAlign: "right" }}>{giderForm.tur || "-"}</b>
                  </div>
                  <div style={{ borderTop: "1px dashed #cbd5e1", margin: "10px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "13px", alignItems: "baseline" }}>
                    <span>Toplam</span>
                    <b style={{ fontSize: "20px", color: "#dc2626" }}>{giderDetayTutar} TL</b>
                  </div>
                  <div style={{ borderTop: "1px dashed #cbd5e1", margin: "10px 0" }} />
                  <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px" }}>Aciklama / Not</div>
                  <div style={{ minHeight: "54px", padding: "10px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "12px", lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {giderForm.aciklama || "-"}
                  </div>
                  {giderGorselMevcutYol ? (
                    <>
                      <div style={{ borderTop: "1px dashed #cbd5e1", margin: "10px 0" }} />
                      <button type="button" onClick={() => void handleGiderGorselGoster(giderForm)} className="btn-anim" style={{ width: "100%", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", fontWeight: "bold", color: "#2563eb", cursor: "pointer" }}>📷 FOTOGRAFI GOR</button>
                    </>
                  ) : null}
                </div>
              </div>
              <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
                <button onClick={handleGiderModalKapat} className="p-btn btn-anim" style={{ background: "#475569", width: "100%", height: "45px", fontSize: "15px" }}>KAPAT</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <input type="date" value={giderForm.tarih} onChange={(e) => setGiderForm({ ...giderForm, tarih: e.target.value })} className="m-inp date-click" style={{ flex: "0 0 118px", minWidth: "118px" }} />
                  <select value={giderForm.tur} onChange={(e) => setGiderForm({ ...giderForm, tur: e.target.value })} className="m-inp" style={{ flex: "1 1 170px", minWidth: 0, width: "100%", fontWeight: "bold" }}>{giderTurleri.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                </div>
                <DonemDisiTarihUyarisi tarih={giderForm.tarih} aktifDonem={aktifDonem} />
                <div><label style={{ fontSize: "11px", color: "#64748b" }}>Tutar (₺)</label><div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <input type="text" inputMode="decimal" value={helpers.paraGirdisiniFormatla(String(giderForm.tutar || ""))} onChange={(e) => setGiderForm({ ...giderForm, tutar: helpers.paraGirdisiniTemizle(e.target.value) })} className="m-inp" style={{ flex: "1 1 120px", minWidth: "120px", textAlign: "right", color: "#dc2626", fontWeight: "bold" }} />
                  <input ref={giderGorselKameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleGiderGorselSec} style={{ display: "none" }} />
                  <input ref={giderGorselGaleriInputRef} type="file" accept="image/*" onChange={handleGiderGorselSec} style={{ display: "none" }} />
                  <button type="button" onClick={() => giderGorselKameraInputRef.current?.click()} className="btn-anim" style={{ background: "#e2e8f0", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "8px 10px", fontSize: "11px", fontWeight: "bold", color: "#334155", cursor: "pointer", flex: "0 0 auto", whiteSpace: "nowrap" }}>{giderGorselDosyaAdi ? "Fotografi Degistir" : "Fotograf Yukle"}</button>
                  <button type="button" onClick={() => giderGorselGaleriInputRef.current?.click()} className="btn-anim" style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "8px 9px", fontSize: "10px", fontWeight: "bold", color: "#475569", cursor: "pointer", flex: "0 0 auto", whiteSpace: "nowrap" }}>Galeri</button>
                </div>{giderGorselDosyaAdi && <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px", flexWrap: "wrap" }}><span style={{ fontSize: "11px", color: "#64748b", maxWidth: "180px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{giderGorselDosyaAdi}</span><button type="button" onClick={handleGiderGorselTemizle} className="btn-anim" style={{ background: "transparent", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "6px", padding: "6px 8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>Temizle</button></div>}</div>
                <div><label style={{ fontSize: "11px", color: "#64748b" }}>Aciklama / Not</label><input placeholder="Opsiyonel..." value={giderForm.aciklama} onChange={(e) => setGiderForm({ ...giderForm, aciklama: e.target.value })} className="m-inp" style={{ width: "100%" }} /></div>
              </div>
              <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}><button onClick={() => void handleGiderKaydet()} className="p-btn btn-anim" style={{ background: "#dc2626", width: "100%", height: "45px", fontSize: "15px" }}>{editingGiderId ? "GUNCELLE" : "KAYDET"}</button></div>
            </>
          )}
        </div>
      </div>}
    </>
  );
}
