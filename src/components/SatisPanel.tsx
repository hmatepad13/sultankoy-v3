import { useEffect, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import type { Bayi, SatisFis, SortConfig } from "../types/app";

type SatisFiltreKisi = "benim" | "herkes";
type SatisFiltreTip = "tumu" | "satis" | "tahsilat" | "kasa_devir";
type AktifFilterModal = "fis_bayi" | "fis_tarih" | null;

type FisFiltreState = {
  bayiler: string[];
  baslangic: string;
  bitis: string;
};

type FisDuzenlenebilirFn = (fis?: Partial<SatisFis> | null) => boolean;
type FisSilinebilirFn = (fis?: Partial<SatisFis> | null) => boolean;
type FisKasayaDevirFn = (fis: Partial<SatisFis>) => boolean;
type FisTahsilatFn = (fis: Partial<SatisFis>) => boolean;
type SistemIslemiFn = (deger?: string | null) => boolean;
type SatisFisBayiAdiFn = (fis?: Partial<SatisFis> | null) => string;
type FisGorunenBayiFn = (fis: SatisFis) => string;

interface SatisPanelProps {
  satisFiltreTip: SatisFiltreTip;
  setSatisFiltreTip: Dispatch<SetStateAction<SatisFiltreTip>>;
  satisFiltreKisi: SatisFiltreKisi;
  setSatisFiltreKisi: Dispatch<SetStateAction<SatisFiltreKisi>>;
  fFisList: SatisFis[];
  satisFisToplamBorcMap: Record<string, number>;
  fisSort: SortConfig;
  setFisSort: Dispatch<SetStateAction<SortConfig>>;
  fisFiltre: FisFiltreState;
  setFisFiltre: Dispatch<SetStateAction<FisFiltreState>>;
  tFisToplam: number;
  tFisTahsilatRaw: number;
  tKullaniciGider: number;
  tKasayaDevir: number;
  tNetTahsilat: number;
  tFisKalan: number;
  bugun: string;
  dun: string;
  temaRengi: string;
  bayiler: Bayi[];
  actions: {
    onOpenNewFis: () => void;
    onOpenNewTahsilat: () => void;
    onOpenNewKasaDevir: () => void;
    onViewFisImage: (fis: SatisFis) => void;
    onViewFisDetail: (fis: SatisFis) => void;
    onViewKasaDevir: (fis: SatisFis) => void;
    onEditTahsilat: (fis: SatisFis) => void;
    onEditKasaDevir: (fis: SatisFis) => void;
    onEditFis: (fis: any) => void;
    onDeleteFis: (fis: any) => void;
  };
  visibility: {
    fisSilinebilirMi: FisSilinebilirFn;
    fisDuzenlenebilirMi: FisDuzenlenebilirFn;
    fisKasayaDevirMi: FisKasayaDevirFn;
    fisTahsilatMi: FisTahsilatFn;
    sistemIslemiMi: SistemIslemiFn;
    satisFisBayiAdiGetir: SatisFisBayiAdiFn;
    fisGorunenBayi: FisGorunenBayiFn;
  };
  helpers: {
    fSayiNoDec: (deger: number | string) => string;
  };
}

interface SatisThProps {
  label: string;
  sortKey: string;
  currentSort: SortConfig;
  setSort: Dispatch<SetStateAction<SortConfig>>;
  setActiveFilterModal: Dispatch<SetStateAction<AktifFilterModal>>;
  align?: "left" | "center" | "right";
  filterType?: AktifFilterModal;
  hideSortIndicator?: boolean;
  compact?: boolean;
  cellStyle?: CSSProperties;
  sortClickScope?: "all" | "label";
  filterHitExpand?: boolean;
}

const handleSortClick = (
  sortKey: string,
  currentSort: SortConfig,
  setSort: Dispatch<SetStateAction<SortConfig>>,
) => {
  setSort((prev) => ({
    key: sortKey,
    direction: currentSort.key === sortKey && prev.direction === "asc" ? "desc" : "asc",
  }));
};

const SatisTh = ({
  label,
  sortKey,
  currentSort,
  setSort,
  setActiveFilterModal,
  align = "left",
  filterType = null,
  hideSortIndicator = false,
  compact = false,
  cellStyle = {},
  sortClickScope = "all",
  filterHitExpand = false,
}: SatisThProps) => (
  <th style={{ textAlign: align, ...cellStyle }}>
    <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", width: "100%", justifyContent: align === "center" ? "center" : "space-between", gap: compact ? "2px" : "4px", cursor: sortClickScope === "all" ? "pointer" : "default" }} onClick={sortClickScope === "all" ? () => handleSortClick(sortKey, currentSort, setSort) : undefined}>
        <div style={{ display: "flex", alignItems: "center", gap: compact ? "2px" : "4px", justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start", flex: sortClickScope === "label" ? "0 0 auto" : align === "center" ? "0 1 auto" : 1, cursor: sortClickScope === "label" ? "pointer" : "inherit" }} onClick={sortClickScope === "label" ? () => handleSortClick(sortKey, currentSort, setSort) : undefined}>
          <span>{label}</span>
          {filterType && (
            <span onClick={(event) => { event.stopPropagation(); setActiveFilterModal(filterType); }} style={{ fontSize: compact ? "8px" : "10px", padding: filterHitExpand && compact ? "6px 8px 6px 1px" : compact ? "1px" : "2px", margin: filterHitExpand && compact ? "-6px -8px -6px 0" : undefined, background: "#e2e8f0", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
              🔽
            </span>
          )}
        </div>
        <span style={{ fontSize: "9px", color: "#94a3b8", paddingLeft: hideSortIndicator ? "0" : "2px", textAlign: "right", visibility: hideSortIndicator ? "hidden" : "visible", width: hideSortIndicator ? "0" : "auto", overflow: "hidden" }}>
          {currentSort.key === sortKey ? (currentSort.direction === "asc" ? "▲" : "▼") : ""}
        </span>
      </div>
    </div>
  </th>
);

export function SatisPanel({
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
  actions,
  visibility,
  helpers,
}: SatisPanelProps) {
  const [openDropdown, setOpenDropdown] = useState<null | { type: "satis"; id: string }>(null);
  const [activeFilterModal, setActiveFilterModal] = useState<AktifFilterModal>(null);

  useEffect(() => {
    if (!openDropdown) return;

    const handleDropdownDisTiklama = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest(".dropdown-menu") || target.closest(".actions-cell")) return;
      setOpenDropdown(null);
    };

    document.addEventListener("mousedown", handleDropdownDisTiklama);
    document.addEventListener("touchstart", handleDropdownDisTiklama, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleDropdownDisTiklama);
      document.removeEventListener("touchstart", handleDropdownDisTiklama);
    };
  }, [openDropdown]);

  const toggleFisBayiFilter = (bayiAdi: string) => {
    setFisFiltre((prev) => ({
      ...prev,
      bayiler: prev.bayiler.includes(bayiAdi)
        ? prev.bayiler.filter((item) => item !== bayiAdi)
        : [...prev.bayiler, bayiAdi],
    }));
  };

  return (
    <>
      <div className="tab-fade-in main-content-area">
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px", alignItems: "center" }}>
          <button onClick={actions.onOpenNewFis} className="btn-anim m-btn green-btn" style={{ margin: 0, flex: 2, fontSize: "13px" }}>➕ YENİ SATIŞ FİŞİ</button>
          <button onClick={actions.onOpenNewTahsilat} className="btn-anim m-btn blue-btn" style={{ margin: 0, flex: 1.2, fontSize: "13px", background: "#3b82f6" }}>💸 TAHSİLAT</button>
          <button onClick={actions.onOpenNewKasaDevir} className="btn-anim m-btn" style={{ margin: 0, flex: 1, fontSize: "13px", background: "#64748b", padding: "12px 0" }}>🏦 KASA DEVİR</button>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
          <div style={{ display: "flex", background: "#cbd5e1", borderRadius: "6px", overflow: "hidden", flex: 2 }}>
            <button onClick={() => setSatisFiltreTip("tumu")} style={{ flex: 1, padding: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", background: satisFiltreTip === "tumu" ? "#059669" : "transparent", color: satisFiltreTip === "tumu" ? "#fff" : "#475569" }}>Tümü</button>
            <button onClick={() => setSatisFiltreTip("satis")} style={{ flex: 1, padding: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", background: satisFiltreTip === "satis" ? "#059669" : "transparent", color: satisFiltreTip === "satis" ? "#fff" : "#475569" }}>Satış</button>
            <button onClick={() => setSatisFiltreTip("tahsilat")} style={{ flex: 1, padding: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", background: satisFiltreTip === "tahsilat" ? "#059669" : "transparent", color: satisFiltreTip === "tahsilat" ? "#fff" : "#475569" }}>Tahsilat</button>
            <button onClick={() => setSatisFiltreTip("kasa_devir")} style={{ flex: 1.2, padding: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", whiteSpace: "nowrap", background: satisFiltreTip === "kasa_devir" ? "#059669" : "transparent", color: satisFiltreTip === "kasa_devir" ? "#fff" : "#475569" }}>Kasa Devir</button>
          </div>
          <div style={{ display: "flex", background: "#cbd5e1", borderRadius: "6px", overflow: "hidden", flex: 1 }}>
            <button onClick={() => setSatisFiltreKisi("benim")} style={{ flex: 1, padding: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", background: satisFiltreKisi === "benim" ? "#2563eb" : "transparent", color: satisFiltreKisi === "benim" ? "#fff" : "#475569" }}>Benim</button>
            <button onClick={() => setSatisFiltreKisi("herkes")} style={{ flex: 1, padding: "6px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", background: satisFiltreKisi === "herkes" ? "#2563eb" : "transparent", color: satisFiltreKisi === "herkes" ? "#fff" : "#475569" }}>Herkes</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.45fr 1fr", gap: "6px", marginBottom: "10px", alignItems: "stretch" }}>
          <div style={{ minWidth: 0, border: "1px solid #05966933", background: "#05966910", color: "#059669", borderRadius: "12px", padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "center" }}><span style={{ fontSize: "9px", fontWeight: "bold", opacity: 0.85, whiteSpace: "nowrap" }}>TOPLAM SATIŞ</span><b style={{ fontSize: "14px", marginTop: "2px", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{helpers.fSayiNoDec(tFisToplam)} ₺</b></div>
          <div style={{ minWidth: 0, border: "1px solid #2563eb33", background: "#2563eb10", color: "#2563eb", borderRadius: "12px", padding: "6px 8px", display: "flex", flexDirection: "column", gap: "4px", justifyContent: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}><span style={{ fontSize: "9px", fontWeight: "bold", opacity: 0.9, whiteSpace: "nowrap" }}>TAHSİLAT</span><b style={{ fontSize: "14px", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05, textAlign: "right" }}>{helpers.fSayiNoDec(tFisTahsilatRaw)} ₺</b></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "5px" }}>
              <div style={{ borderRadius: "999px", background: "#ffffffb8", padding: "4px 6px", color: "#64748b", fontWeight: "bold", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: 1.1 }}><span style={{ fontSize: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>GİDER</span><span style={{ fontSize: "9px", whiteSpace: "nowrap" }}>{helpers.fSayiNoDec(tKullaniciGider)}</span></div>
              <div style={{ borderRadius: "999px", background: "#ffffffb8", padding: "4px 6px", color: "#475569", fontWeight: "bold", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: 1.1 }}><span style={{ fontSize: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>KASAYA</span><span style={{ fontSize: "9px", whiteSpace: "nowrap" }}>{helpers.fSayiNoDec(tKasayaDevir)}</span></div>
              <div style={{ borderRadius: "999px", background: "#ffffffd8", padding: "4px 6px", color: "#0f172a", fontWeight: "bold", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: 1.1 }}><span style={{ fontSize: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>NET</span><span style={{ fontSize: "9px", whiteSpace: "nowrap" }}>{helpers.fSayiNoDec(tNetTahsilat)}</span></div>
            </div>
          </div>
          <div style={{ minWidth: 0, border: "1px solid #dc262633", background: "#dc262610", color: "#dc2626", borderRadius: "12px", padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "center" }}><span style={{ fontSize: "9px", fontWeight: "bold", opacity: 0.85, whiteSpace: "nowrap" }}>AÇIK HESAP</span><b style={{ fontSize: "14px", marginTop: "2px", whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.05 }}>{helpers.fSayiNoDec(tFisKalan)} ₺</b></div>
        </div>

        <div className="table-wrapper">
          <table className="tbl tbl-satis" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <SatisTh label="TAR." sortKey="tarih" currentSort={fisSort} setSort={setFisSort} setActiveFilterModal={setActiveFilterModal} filterType="fis_tarih" hideSortIndicator={true} compact={true} sortClickScope="label" filterHitExpand={true} cellStyle={{ width: "68px" }} />
                <SatisTh label={satisFiltreTip === "kasa_devir" ? "AÇIKLAMA" : "BAYİ"} sortKey={satisFiltreTip === "kasa_devir" ? "aciklama" : "bayi"} currentSort={fisSort} setSort={setFisSort} setActiveFilterModal={setActiveFilterModal} filterType="fis_bayi" hideSortIndicator={true} compact={true} align={satisFiltreTip === "kasa_devir" ? "left" : "center"} sortClickScope="label" cellStyle={{ width: satisFiltreTip === "kasa_devir" ? "136px" : "112px", paddingLeft: satisFiltreTip === "kasa_devir" ? "10px" : "4px", paddingRight: satisFiltreTip === "kasa_devir" ? "4px" : "4px" }} />
                <SatisTh label="TUTAR" sortKey="toplam_tutar" currentSort={fisSort} setSort={setFisSort} setActiveFilterModal={setActiveFilterModal} align="right" />
                <SatisTh label="TAHS." sortKey="tahsilat" currentSort={fisSort} setSort={setFisSort} setActiveFilterModal={setActiveFilterModal} align="right" />
                <SatisTh label="BORÇ" sortKey="kalan_bakiye" currentSort={fisSort} setSort={setFisSort} setActiveFilterModal={setActiveFilterModal} align="right" />
                <SatisTh label="KİŞİ" sortKey="ekleyen" currentSort={fisSort} setSort={setFisSort} setActiveFilterModal={setActiveFilterModal} align="center" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fFisList.map((fis) => {
                const satirToplamBorc = fis.id ? satisFisToplamBorcMap[String(fis.id)] ?? 0 : 0;
                const silinebilir = visibility.fisSilinebilirMi(fis);
                const duzenlenebilir = visibility.fisDuzenlenebilirMi(fis);
                const kasaDevirMi = visibility.fisKasayaDevirMi(fis);
                const tahsilatMi = visibility.fisTahsilatMi(fis);
                const sistemFisMi = visibility.sistemIslemiMi(visibility.satisFisBayiAdiGetir(fis));
                const dropdownId = String(fis.id);

                return (
                  <tr key={dropdownId}>
                    <td style={{ textAlign: "center" }}>{fis.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
                    <td style={{ fontWeight: "bold", minWidth: 0, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: fis.toplam_tutar === 0 && fis.odeme_turu !== "KASAYA DEVİR" ? "#8b5cf6" : visibility.sistemIslemiMi(visibility.satisFisBayiAdiGetir(fis)) ? "#475569" : "inherit" }}>{visibility.fisGorunenBayi(fis)}</td>
                    <td style={{ textAlign: "right", color: "#059669", fontWeight: "bold" }}>{fis.toplam_tutar === 0 ? "-" : helpers.fSayiNoDec(fis.toplam_tutar)}</td>
                    <td style={{ textAlign: "right", color: fis.odeme_turu === "KASAYA DEVİR" ? "#dc2626" : "#2563eb", fontWeight: "bold" }}>{fis.odeme_turu === "KASAYA DEVİR" && fis.tahsilat > 0 ? "-" : ""}{helpers.fSayiNoDec(fis.tahsilat)}</td>
                    <td style={{ textAlign: "right", color: satirToplamBorc > 0 ? "#dc2626" : satirToplamBorc < 0 ? "#059669" : "#64748b", fontWeight: "bold" }} title="Bu fiş sonundaki toplam borç">{visibility.sistemIslemiMi(visibility.satisFisBayiAdiGetir(fis)) ? "-" : satirToplamBorc === 0 ? "-" : helpers.fSayiNoDec(satirToplamBorc)}</td>
                    <td style={{ textAlign: "center", color: "#64748b" }}>{fis.ekleyen ? fis.ekleyen.split("@")[0] : "-"}</td>
                    <td className="actions-cell" style={{ position: "relative" }}>
                      <button onClick={(event) => { event.stopPropagation(); setOpenDropdown({ type: "satis", id: dropdownId }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "0 8px", color: "#64748b" }}>⋮</button>
                      {openDropdown?.type === "satis" && openDropdown.id === dropdownId && (
                        <div className="dropdown-menu">
                          {fis.fis_gorseli && <button title="Fotoğrafı Gör" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); actions.onViewFisImage(fis); }}>📷</button>}
                          {(!sistemFisMi || kasaDevirMi) && <button title="Görüntüle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); if (kasaDevirMi) actions.onViewKasaDevir(fis); else actions.onViewFisDetail(fis); }}>🔍</button>}
                          {(!sistemFisMi || kasaDevirMi || tahsilatMi) && duzenlenebilir && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); if (kasaDevirMi) actions.onEditKasaDevir(fis); else if (tahsilatMi) actions.onEditTahsilat(fis); else actions.onEditFis(fis); }}>✏️</button>}
                          {silinebilir && <button title="Sil" className="dropdown-item-icon" style={{ color: "#dc2626" }} onClick={() => { setOpenDropdown(null); actions.onDeleteFis(fis); }}>🗑️</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {activeFilterModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setActiveFilterModal(null)}>
          <div style={{ backgroundColor: "#fff", padding: "15px", borderRadius: "10px", width: "100%", maxWidth: "260px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }} onClick={(event) => event.stopPropagation()}>
            <h4 style={{ marginTop: 0, marginBottom: "10px", borderBottom: "1px solid #eee", paddingBottom: "5px", color: "#1e293b" }}>{activeFilterModal.endsWith("_tarih") ? "Tarih Aralığı Seç" : "Filtrele"}</h4>
            {activeFilterModal.endsWith("_tarih") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <label style={{ fontSize: "12px", color: "#64748b" }}>Başlangıç</label>
                    {activeFilterModal === "fis_tarih" && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        {[{ etiket: "Bugün", tarih: bugun }, { etiket: "Dün", tarih: dun }].map((secenek) => {
                          const secili = fisFiltre.baslangic === secenek.tarih && fisFiltre.bitis === secenek.tarih;
                          return (
                            <button key={secenek.etiket} type="button" onClick={() => setFisFiltre((prev) => prev.baslangic === secenek.tarih && prev.bitis === secenek.tarih ? { ...prev, baslangic: "", bitis: "" } : { ...prev, baslangic: secenek.tarih, bitis: secenek.tarih })} className="btn-anim" style={{ border: "none", borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer", background: secili ? "#0f766e" : "#e2e8f0", color: secili ? "#fff" : "#475569" }}>
                              {secenek.etiket}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <input type="date" value={fisFiltre.baslangic} onChange={(event) => setFisFiltre((prev) => ({ ...prev, baslangic: event.target.value }))} className="m-inp date-click" style={{ width: "100%", marginTop: "4px" }} />
                </div>
                <div><label style={{ fontSize: "12px", color: "#64748b" }}>Bitiş</label><input type="date" value={fisFiltre.bitis} onChange={(event) => setFisFiltre((prev) => ({ ...prev, bitis: event.target.value }))} className="m-inp date-click" style={{ width: "100%", marginTop: "4px" }} /></div>
              </div>
            )}
            <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" }}>
              {activeFilterModal === "fis_bayi" && bayiler.map((bayi) => (
                <label key={bayi.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                  <input type="checkbox" checked={fisFiltre.bayiler.includes(bayi.isim)} onChange={() => toggleFisBayiFilter(bayi.isim)} style={{ width: "18px", height: "18px" }} /> {bayi.isim}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "15px" }}>
              <button onClick={() => { if (activeFilterModal === "fis_bayi") setFisFiltre((prev) => ({ ...prev, bayiler: [] })); if (activeFilterModal?.includes("_tarih")) setFisFiltre((prev) => ({ ...prev, baslangic: "", bitis: "" })); }} style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: "6px", fontWeight: "bold" }}>TEMİZLE</button>
              <button onClick={() => setActiveFilterModal(null)} style={{ flex: 1, padding: "10px", background: temaRengi, color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}>UYGULA</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
