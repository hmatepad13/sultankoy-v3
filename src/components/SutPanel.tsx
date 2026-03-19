import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Ciftlik, SortConfig, SutGiris } from "../types/app";
import { getLocalDateString } from "../utils/date";
import { normalizeUsername } from "../utils/format";

type SutFilterModal = "sut_ciftlik" | "sut_tarih" | null;

type SutPanelProps = {
  aktifDonem: string;
  aktifKullaniciEposta: string;
  aktifKullaniciKisa: string;
  isAdmin: boolean;
  sutList: SutGiris[];
  tedarikciler: Ciftlik[];
  temaRengi: string;
  onRefreshSut: () => void | Promise<void>;
  onRefreshCop: () => void | Promise<void>;
  helpers: {
    fSayi: (num: unknown) => string;
    fSayiNoDec: (num: unknown) => string;
    veritabaniHatasiMesaji: (tablo: string, hata: { message?: string } | null) => string;
  };
};

const varsayilanTarihGetir = (aktifDonem: string) => {
  const bugun = getLocalDateString();
  return bugun.startsWith(aktifDonem) ? bugun : `${aktifDonem}-01`;
};

const varsayilanSutFormu = (aktifDonem: string): SutGiris => ({
  tarih: varsayilanTarihGetir(aktifDonem),
  ciftlik: "",
  kg: "",
  fiyat: "",
  aciklama: "",
});

const kayitAdiniNormalizeEt = (deger?: string | null) =>
  String(deger || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR");

const kayitAktifMi = <T extends { aktif?: boolean | null }>(item: T) => item.aktif !== false;

const sortData = (data: SutGiris[], sortConfig: SortConfig) => {
  if (!sortConfig.key) return data;

  return [...data].sort((a, b) => {
    const valA = (a as unknown as Record<string, unknown>)[sortConfig.key];
    const valB = (b as unknown as Record<string, unknown>)[sortConfig.key];
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

    const createdAtA = String((a as SutGiris & { created_at?: string | null }).created_at || "");
    const createdAtB = String((b as SutGiris & { created_at?: string | null }).created_at || "");
    if (createdAtA !== createdAtB) {
      return sortConfig.direction === "asc"
        ? createdAtA.localeCompare(createdAtB)
        : createdAtB.localeCompare(createdAtA);
    }

    return String(a.id || "").localeCompare(String(b.id || ""));
  });
};

const handleSortClick = (
  sortKey: string,
  currentSort: SortConfig,
  setSort: (next: SortConfig) => void,
) => {
  if (currentSort.key === sortKey) {
    setSort({ key: sortKey, direction: currentSort.direction === "asc" ? "desc" : "asc" });
  } else {
    setSort({ key: sortKey, direction: "desc" });
  }
};

function SutTh({
  label,
  sortKey,
  currentSort,
  setSort,
  align = "left",
  filterType = null,
  setFilterModal,
}: {
  label: string;
  sortKey: string;
  currentSort: SortConfig;
  setSort: (next: SortConfig) => void;
  align?: "left" | "center" | "right";
  filterType?: SutFilterModal;
  setFilterModal: (value: SutFilterModal) => void;
}) {
  return (
    <th style={{ textAlign: align }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: align === "center" ? "center" : "space-between",
          gap: "4px",
          cursor: "pointer",
        }}
        onClick={() => handleSortClick(sortKey, currentSort, setSort)}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            justifyContent:
              align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
            flex: align === "center" ? "0 1 auto" : 1,
          }}
        >
          <span>{label}</span>
          {filterType && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setFilterModal(filterType);
              }}
              style={{
                fontSize: "10px",
                padding: "2px",
                background: "#e2e8f0",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              🔽
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: "9px",
            color: "#94a3b8",
            visibility: currentSort.key === sortKey ? "visible" : "hidden",
          }}
        >
          {currentSort.key === sortKey ? (currentSort.direction === "asc" ? "▲" : "▼") : "▼"}
        </span>
      </div>
    </th>
  );
}

export function SutPanel({
  aktifDonem,
  aktifKullaniciEposta,
  aktifKullaniciKisa,
  isAdmin,
  sutList,
  tedarikciler,
  temaRengi,
  onRefreshSut,
  onRefreshCop,
  helpers,
}: SutPanelProps) {
  const [isSutModalOpen, setIsSutModalOpen] = useState(false);
  const [sutModalMode, setSutModalMode] = useState<"create" | "edit" | "view">("create");
  const [editingSutId, setEditingSutId] = useState<string | null>(null);
  const [sutForm, setSutForm] = useState<SutGiris>(() => varsayilanSutFormu(aktifDonem));
  const [sutFiltre, setSutFiltre] = useState<{ ciftlikler: string[]; baslangic: string; bitis: string }>(
    { ciftlikler: [], baslangic: "", bitis: "" },
  );
  const [sutSort, setSutSort] = useState<SortConfig>({ key: "tarih", direction: "desc" });
  const [activeFilterModal, setActiveFilterModal] = useState<SutFilterModal>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [detayNot, setDetayNot] = useState<string | null>(null);

  useEffect(() => {
    if (isSutModalOpen || editingSutId) return;
    setSutForm((prev) => ({ ...prev, tarih: varsayilanTarihGetir(aktifDonem) }));
  }, [aktifDonem, editingSutId, isSutModalOpen]);

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

  const ciftlikMap = useMemo(
    () => new Map(tedarikciler.map((item) => [item.id, item.isim])),
    [tedarikciler],
  );
  const aktifTedarikciler = useMemo(
    () => tedarikciler.filter(kayitAktifMi),
    [tedarikciler],
  );
  const sutCiftlikFiltreSecenekleri = useMemo(
    () => tedarikciler.map((item) => item.isim).filter(Boolean),
    [tedarikciler],
  );

  const sutCiftlikAdiGetir = (kayit?: Partial<SutGiris> | null) =>
    (kayit?.ciftlik_id ? ciftlikMap.get(kayit.ciftlik_id) : undefined) || kayit?.ciftlik || "";

  const seciliCiftlikId = (ciftlikAdi?: string | null) =>
    tedarikciler.find((item) => item.isim === ciftlikAdi)?.id ?? null;

  const sutCiftlikAnahtariGetir = (kayit?: Partial<SutGiris> | null) =>
    kayit?.ciftlik_id
      ? `id:${kayit.ciftlik_id}`
      : `isim:${kayitAdiniNormalizeEt(kayit?.ciftlik)}`;

  const sutSonFiyatHaritasi = useMemo(() => {
    const map = new Map<string, string>();
    const siraliKayitlar = [...sutList].sort((a, b) => {
      const tarihFarki = String(b.tarih || "").localeCompare(String(a.tarih || ""));
      if (tarihFarki !== 0) return tarihFarki;
      const createdAtFarki = String((b as SutGiris & { created_at?: string | null }).created_at || "")
        .localeCompare(String((a as SutGiris & { created_at?: string | null }).created_at || ""));
      if (createdAtFarki !== 0) return createdAtFarki;
      return Number(b.id || 0) - Number(a.id || 0);
    });

    siraliKayitlar.forEach((kayit) => {
      const key = sutCiftlikAnahtariGetir(kayit);
      if (!key || map.has(key)) return;
      const fiyat = Number(kayit.fiyat) || 0;
      if (fiyat > 0) map.set(key, String(kayit.fiyat));
    });

    return map;
  }, [sutList]);

  const sonSutFiyatiniGetir = (ciftlikAdi?: string | null) => {
    if (!ciftlikAdi) return "";
    const ciftlikId = seciliCiftlikId(ciftlikAdi);
    const key = ciftlikId ? `id:${ciftlikId}` : `isim:${kayitAdiniNormalizeEt(ciftlikAdi)}`;
    return sutSonFiyatHaritasi.get(key) || "";
  };

  const periodSut = useMemo(
    () => sutList.filter((kayit) => kayit.tarih.startsWith(aktifDonem)),
    [aktifDonem, sutList],
  );

  const fSutList = useMemo(
    () =>
      sortData(
        periodSut.filter(
          (kayit) =>
            (sutFiltre.ciftlikler.length === 0 ||
              sutFiltre.ciftlikler.includes(sutCiftlikAdiGetir(kayit))) &&
            (!sutFiltre.baslangic || kayit.tarih >= sutFiltre.baslangic) &&
            (!sutFiltre.bitis || kayit.tarih <= sutFiltre.bitis),
        ),
        sutSort,
      ),
    [periodSut, sutFiltre, sutSort],
  );

  const tSutKg = useMemo(
    () => fSutList.reduce((toplam, kayit) => toplam + Number(kayit.kg || 0), 0),
    [fSutList],
  );
  const tSutTl = useMemo(
    () =>
      fSutList.reduce(
        (toplam, kayit) =>
          toplam + (Number(kayit.toplam_tl || 0) || Number(kayit.kg || 0) * Number(kayit.fiyat || 0)),
        0,
      ),
    [fSutList],
  );

  const kaydiSilebilirMi = (ekleyen?: string | null) =>
    isAdmin || (!!normalizeUsername(ekleyen) && normalizeUsername(ekleyen) === aktifKullaniciKisa);
  const kaydiDuzenleyebilirMi = (ekleyen?: string | null) => kaydiSilebilirMi(ekleyen);

  const resetSutFormu = () => {
    setSutForm(varsayilanSutFormu(aktifDonem));
    setEditingSutId(null);
    setSutModalMode("create");
  };

  const handleSutModalKapat = () => {
    setIsSutModalOpen(false);
    resetSutFormu();
  };

  const handleYeniSutModalAc = () => {
    resetSutFormu();
    setIsSutModalOpen(true);
  };

  const handleSutCiftlikSecimi = (secilenCiftlik: string) => {
    const hafizaFiyati = sonSutFiyatiniGetir(secilenCiftlik);
    setSutForm((prev) => ({
      ...prev,
      ciftlik: secilenCiftlik,
      fiyat: hafizaFiyati || prev.fiyat || "",
    }));
  };

  const handleSutGoruntule = (kayit: SutGiris) => {
    setEditingSutId(String(kayit.id || ""));
    setSutForm({ ...kayit, ciftlik: sutCiftlikAdiGetir(kayit) });
    setSutModalMode("view");
    setIsSutModalOpen(true);
  };

  const handleSutDuzenle = (kayit: SutGiris) => {
    setEditingSutId(String(kayit.id || ""));
    setSutForm({ ...kayit, ciftlik: sutCiftlikAdiGetir(kayit) });
    setSutModalMode("edit");
    setIsSutModalOpen(true);
  };

  const handleCheckboxToggle = (deger: string) => {
    setSutFiltre((prev) =>
      prev.ciftlikler.includes(deger)
        ? { ...prev, ciftlikler: prev.ciftlikler.filter((item) => item !== deger) }
        : { ...prev, ciftlikler: [...prev.ciftlikler, deger] },
    );
  };

  const handleSutKaydet = async () => {
    if (!sutForm.ciftlik || !sutForm.kg || !sutForm.fiyat) {
      alert("Çiftlik, KG ve Fiyat alanları zorunludur!");
      return;
    }

    const duzenlenenKayit = sutList.find((item) => String(item.id || "") === editingSutId);
    if (editingSutId && !kaydiDuzenleyebilirMi(duzenlenenKayit?.ekleyen)) {
      alert("Bu süt kaydını sadece ekleyen kullanıcı veya admin düzenleyebilir.");
      return;
    }

    const payload = {
      ...sutForm,
      ciftlik_id: seciliCiftlikId(sutForm.ciftlik),
      kg: Number(sutForm.kg),
      fiyat: Number(sutForm.fiyat),
      toplam_tl: Number(sutForm.kg) * Number(sutForm.fiyat),
      ekleyen: aktifKullaniciEposta,
    };

    const { error } = editingSutId
      ? await supabase.from("sut_giris").update(payload).eq("id", editingSutId)
      : await supabase.from("sut_giris").insert(payload);

    if (error) {
      alert(`Hata: ${helpers.veritabaniHatasiMesaji("sut_giris", error)}`);
      return;
    }

    handleSutModalKapat();
    await onRefreshSut();
  };

  const coptKutusunaAt = async (tablo: string, veri: SutGiris) => {
    const { error } = await supabase
      .from("cop_kutusu")
      .insert({ tablo_adi: tablo, veri, silinme_tarihi: new Date().toISOString() });

    if (error) {
      console.warn("Çöp kutusuna atılamadı:", error.message);
      return false;
    }

    return true;
  };

  const handleSutSil = async (kayit: SutGiris) => {
    if (!kaydiSilebilirMi(kayit.ekleyen)) {
      alert("Bu süt kaydını sadece ekleyen kullanıcı veya admin silebilir.");
      return;
    }

    if (!confirm("Sil?")) return;

    const copBasarili = await coptKutusunaAt("sut_giris", kayit);
    if (!copBasarili) {
      alert("Kayıt çöp kutusuna alınamadığı için silme iptal edildi.");
      return;
    }

    const { error } = await supabase.from("sut_giris").delete().eq("id", kayit.id);
    if (error) {
      alert(`Silme hatası: ${helpers.veritabaniHatasiMesaji("sut_giris", error)}`);
      return;
    }

    await onRefreshSut();
    await onRefreshCop();
  };

  const renderNot = (not?: string | null) => {
    if (!not) return "";
    return not.length <= 15 ? (
      not
    ) : (
      <span
        onClick={(e) => {
          e.stopPropagation();
          setDetayNot(not);
        }}
        style={{
          cursor: "pointer",
          borderBottom: "1px dashed #94a3b8",
          color: "#3b82f6",
        }}
      >
        {not.substring(0, 15)}...
      </span>
    );
  };

  return (
    <>
      <div className="tab-fade-in main-content-area">
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", flex: 1 }}>
            <div style={{ border: `1px solid ${temaRengi}33`, background: `${temaRengi}10`, color: temaRengi, borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold" }}>
              SÜT: {helpers.fSayi(tSutKg)} KG
            </div>
            <div style={{ border: `1px solid ${temaRengi}33`, background: `${temaRengi}10`, color: temaRengi, borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold" }}>
              TUTAR: {helpers.fSayiNoDec(tSutTl)} ₺
            </div>
          </div>
          <button onClick={handleYeniSutModalAc} className="btn-anim m-btn blue-btn inline-mobile-btn" style={{ margin: 0, minWidth: "150px", width: "auto", fontSize: "13px", flex: "0 0 auto" }}>
            ➕ YENİ SÜT GİRİŞİ
          </button>
        </div>

        <div className="table-wrapper">
          <table className="tbl">
            <thead>
              <tr>
                <SutTh label="TARİH" sortKey="tarih" currentSort={sutSort} setSort={setSutSort} filterType="sut_tarih" setFilterModal={setActiveFilterModal} />
                <SutTh label="ÇİFTLİK" sortKey="ciftlik" currentSort={sutSort} setSort={setSutSort} filterType="sut_ciftlik" setFilterModal={setActiveFilterModal} />
                <SutTh label="KG" sortKey="kg" currentSort={sutSort} setSort={setSutSort} align="right" setFilterModal={setActiveFilterModal} />
                <SutTh label="FİYAT" sortKey="fiyat" currentSort={sutSort} setSort={setSutSort} align="right" setFilterModal={setActiveFilterModal} />
                <SutTh label="TUTAR" sortKey="toplam_tl" currentSort={sutSort} setSort={setSutSort} align="right" setFilterModal={setActiveFilterModal} />
                <th />
              </tr>
            </thead>
            <tbody>
              {fSutList.map((kayit) => {
                const silinebilir = kaydiSilebilirMi(kayit.ekleyen);
                const duzenlenebilir = kaydiDuzenleyebilirMi(kayit.ekleyen);
                const toplamTutar =
                  Number(kayit.toplam_tl || 0) || Number(kayit.kg || 0) * Number(kayit.fiyat || 0);
                return (
                  <tr key={kayit.id}>
                    <td>{kayit.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
                    <td style={{ fontWeight: "bold" }} className="truncate-text-td">
                      {sutCiftlikAdiGetir(kayit)}
                    </td>
                    <td style={{ textAlign: "right" }}>{helpers.fSayi(kayit.kg)}</td>
                    <td style={{ textAlign: "right" }}>{helpers.fSayi(kayit.fiyat)}</td>
                    <td style={{ textAlign: "right", color: temaRengi, fontWeight: "bold" }}>
                      {helpers.fSayiNoDec(toplamTutar)}
                    </td>
                    <td className="actions-cell" style={{ position: "relative" }}>
                      {renderNot(kayit.aciklama)}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(String(kayit.id || ""));
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "0 8px", color: "#64748b" }}
                      >
                        ⋮
                      </button>
                      {openDropdownId === String(kayit.id || "") && (
                        <div className="dropdown-menu">
                          <button title="Detay Gör" className="dropdown-item-icon" onClick={() => { setOpenDropdownId(null); handleSutGoruntule(kayit); }}>
                            🔍
                          </button>
                          {duzenlenebilir && (
                            <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdownId(null); handleSutDuzenle(kayit); }}>
                              ✏️
                            </button>
                          )}
                          {silinebilir && (
                            <button title="Sil" className="dropdown-item-icon" style={{ color: "#dc2626" }} onClick={async () => { setOpenDropdownId(null); await handleSutSil(kayit); }}>
                              🗑️
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {fSutList.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                    Süt kaydı bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeFilterModal && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          onClick={() => setActiveFilterModal(null)}
        >
          <div style={{ backgroundColor: "#fff", padding: "15px", borderRadius: "10px", width: "100%", maxWidth: "260px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0, marginBottom: "10px", borderBottom: "1px solid #eee", paddingBottom: "5px", color: "#1e293b" }}>
              {activeFilterModal === "sut_tarih" ? "Tarih Aralığı Seç" : "Filtrele"}
            </h4>

            {activeFilterModal === "sut_tarih" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "#64748b" }}>Başlangıç</label>
                  <input type="date" value={sutFiltre.baslangic} onChange={(e) => setSutFiltre((prev) => ({ ...prev, baslangic: e.target.value }))} className="m-inp date-click" style={{ width: "100%", marginTop: "4px" }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#64748b" }}>Bitiş</label>
                  <input type="date" value={sutFiltre.bitis} onChange={(e) => setSutFiltre((prev) => ({ ...prev, bitis: e.target.value }))} className="m-inp date-click" style={{ width: "100%", marginTop: "4px" }} />
                </div>
              </div>
            )}

            {activeFilterModal === "sut_ciftlik" && (
              <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" }}>
                {sutCiftlikFiltreSecenekleri.map((isim) => (
                  <label key={isim} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                    <input type="checkbox" checked={sutFiltre.ciftlikler.includes(isim)} onChange={() => handleCheckboxToggle(isim)} style={{ width: "18px", height: "18px" }} />
                    {isim}
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "15px" }}>
              <button
                onClick={() => {
                  if (activeFilterModal === "sut_ciftlik") {
                    setSutFiltre((prev) => ({ ...prev, ciftlikler: [] }));
                  } else {
                    setSutFiltre((prev) => ({ ...prev, baslangic: "", bitis: "" }));
                  }
                }}
                style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: "6px", fontWeight: "bold" }}
              >
                TEMİZLE
              </button>
              <button onClick={() => setActiveFilterModal(null)} style={{ flex: 1, padding: "10px", background: temaRengi, color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}>
                UYGULA
              </button>
            </div>
          </div>
        </div>
      )}

      {isSutModalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "10px" }}>
          <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "350px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: sutModalMode === "view" ? "#eff6ff" : editingSutId ? "#fef3c7" : "#f8fafc", borderRadius: "12px 12px 0 0" }}>
              <h3 style={{ margin: 0, color: sutModalMode === "view" ? "#2563eb" : editingSutId ? "#b45309" : temaRengi, fontSize: "15px" }}>
                {sutModalMode === "view" ? "🔍 Süt Detayı" : editingSutId ? "✏️ Süt Düzenle" : "🥛 Yeni Süt Girişi"}
              </h3>
              <button onClick={handleSutModalKapat} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>
                ✕
              </button>
            </div>
            <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input type="date" value={sutForm.tarih} onChange={(e) => setSutForm((prev) => ({ ...prev, tarih: e.target.value }))} disabled={sutModalMode === "view"} className="m-inp date-click" style={{ flex: 1, background: sutModalMode === "view" ? "#f8fafc" : undefined }} />
                <select value={sutForm.ciftlik} onChange={(e) => handleSutCiftlikSecimi(e.target.value)} disabled={sutModalMode === "view"} className="m-inp" style={{ flex: 2, fontWeight: "bold", background: sutModalMode === "view" ? "#f8fafc" : undefined }}>
                  <option value="">Çiftlik Seç...</option>
                  {aktifTedarikciler.map((tedarikci) => (
                    <option key={tedarikci.id} value={tedarikci.isim}>
                      {tedarikci.isim}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "11px", color: "#64748b" }}>Miktar (KG)</label>
                  <input type="number" value={sutForm.kg} onChange={(e) => setSutForm((prev) => ({ ...prev, kg: e.target.value }))} disabled={sutModalMode === "view"} className="m-inp" style={{ width: "100%", textAlign: "right", background: sutModalMode === "view" ? "#f8fafc" : undefined }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "11px", color: "#64748b" }}>Birim Fiyat</label>
                  <input type="number" step="0.01" value={sutForm.fiyat} onChange={(e) => setSutForm((prev) => ({ ...prev, fiyat: e.target.value }))} disabled={sutModalMode === "view"} className="m-inp" style={{ width: "100%", textAlign: "right", background: sutModalMode === "view" ? "#f8fafc" : undefined }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#64748b" }}>Açıklama / Not</label>
                <input placeholder="Opsiyonel..." value={sutForm.aciklama} onChange={(e) => setSutForm((prev) => ({ ...prev, aciklama: e.target.value }))} disabled={sutModalMode === "view"} className="m-inp" style={{ width: "100%", background: sutModalMode === "view" ? "#f8fafc" : undefined }} />
              </div>
            </div>
            <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <span style={{ color: "#64748b", fontSize: "13px" }}>Toplam Tutar:</span>
                <b style={{ color: temaRengi, fontSize: "18px" }}>
                  {helpers.fSayi((Number(sutForm.kg) || 0) * (Number(sutForm.fiyat) || 0))} ₺
                </b>
              </div>
              {sutModalMode === "view" ? (
                <button onClick={handleSutModalKapat} className="p-btn btn-anim" style={{ background: "#475569", width: "100%", height: "45px", fontSize: "15px" }}>
                  KAPAT
                </button>
              ) : (
                <button onClick={handleSutKaydet} className="p-btn btn-anim" style={{ background: editingSutId ? "#f59e0b" : temaRengi, width: "100%", height: "45px", fontSize: "15px" }}>
                  {editingSutId ? "GÜNCELLE" : "KAYDET"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {detayNot && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, padding: "20px" }} onClick={() => setDetayNot(null)}>
          <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "16px", width: "100%", maxWidth: "350px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 15px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>Açıklama / Not</h3>
            <p style={{ margin: "0 0 25px", color: "#475569", lineHeight: "1.6", wordWrap: "break-word" }}>{detayNot}</p>
            <button onClick={() => setDetayNot(null)} style={{ width: "100%", padding: "12px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>
              KAPAT
            </button>
          </div>
        </div>
      )}
    </>
  );
}
