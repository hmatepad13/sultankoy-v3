import { useMemo, useState } from "react";
import type { Bayi, SatisGiris, SortConfig, Urun } from "../types/app";

type AnalizFilterModal = "analiz_bayi" | "analiz_urun" | "analiz_tarih" | null;

type AnalizPanelProps = {
  aktifDonem: string;
  periodSatisList: SatisGiris[];
  bayiler: Bayi[];
  urunler: Urun[];
  helpers: {
    fSayi: (num: unknown) => string;
  };
};

const sortData = (data: SatisGiris[], sortConfig: SortConfig) => {
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

function AnalizTh({
  label,
  sortKey,
  currentSort,
  setSort,
  align = "left",
  width,
  filterType = null,
  setFilterModal,
}: {
  label: string;
  sortKey: string;
  currentSort: SortConfig;
  setSort: (next: SortConfig) => void;
  align?: "left" | "center" | "right";
  width?: string;
  filterType?: AnalizFilterModal;
  setFilterModal: (value: AnalizFilterModal) => void;
}) {
  return (
    <th style={{ textAlign: align, width, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: align === "center" ? "center" : "space-between",
          gap: "4px",
          cursor: "pointer",
          minWidth: 0,
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
            minWidth: 0,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          {filterType && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setFilterModal(filterType);
              }}
              style={{
                fontSize: "10px",
                padding: "2px",
                background: "#7c3aed",
                color: "#fff",
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
            color: "#d8b4fe",
            visibility: currentSort.key === sortKey ? "visible" : "hidden",
          }}
        >
          {currentSort.key === sortKey ? (currentSort.direction === "asc" ? "▲" : "▼") : "▼"}
        </span>
      </div>
    </th>
  );
}

export function AnalizPanel({ aktifDonem, periodSatisList, bayiler, urunler, helpers }: AnalizPanelProps) {
  const [analizFiltre, setAnalizFiltre] = useState<{
    bayiler: string[];
    urunler: string[];
    baslangic: string;
    bitis: string;
  }>({ bayiler: [], urunler: [], baslangic: "", bitis: "" });
  const [analizSort, setAnalizSort] = useState<SortConfig>({ key: "tarih", direction: "desc" });
  const [activeFilterModal, setActiveFilterModal] = useState<AnalizFilterModal>(null);
  const [isExcelLoading, setIsExcelLoading] = useState(false);

  const bayiMap = useMemo(() => new Map(bayiler.map((item) => [item.id, item.isim])), [bayiler]);
  const urunMap = useMemo(() => new Map(urunler.map((item) => [item.id, item.isim])), [urunler]);

  const satisSatiriBayiAdiGetir = (satir?: Partial<SatisGiris> | null) =>
    (satir?.bayi_id ? bayiMap.get(satir.bayi_id) : undefined) || satir?.bayi || "";
  const satisSatiriUrunAdiGetir = (satir?: Partial<SatisGiris> | null) =>
    (satir?.urun_id ? urunMap.get(satir.urun_id) : undefined) || satir?.urun || "";

  const fAnalizList = useMemo(
    () =>
      sortData(
        periodSatisList.filter(
          (satir) =>
            (analizFiltre.bayiler.length === 0 ||
              analizFiltre.bayiler.includes(satisSatiriBayiAdiGetir(satir))) &&
            (analizFiltre.urunler.length === 0 ||
              analizFiltre.urunler.includes(satisSatiriUrunAdiGetir(satir))) &&
            (!analizFiltre.baslangic || satir.tarih >= analizFiltre.baslangic) &&
            (!analizFiltre.bitis || satir.tarih <= analizFiltre.bitis),
        ),
        analizSort,
      ),
    [analizFiltre, analizSort, periodSatisList, bayiMap, urunMap],
  );

  const tAnalizAdet = useMemo(
    () => fAnalizList.reduce((toplam, satir) => toplam + Number(satir.adet || 0), 0),
    [fAnalizList],
  );
  const tAnalizKg = useMemo(
    () => fAnalizList.reduce((toplam, satir) => toplam + Number(satir.toplam_kg || 0), 0),
    [fAnalizList],
  );
  const tAnalizTutar = useMemo(
    () => fAnalizList.reduce((toplam, satir) => toplam + Number(satir.tutar || 0), 0),
    [fAnalizList],
  );

  const handleCheckboxToggle = (liste: "bayiler" | "urunler", deger: string) => {
    setAnalizFiltre((prev) => {
      const secili = prev[liste];
      return secili.includes(deger)
        ? { ...prev, [liste]: secili.filter((item) => item !== deger) }
        : { ...prev, [liste]: [...secili, deger] };
    });
  };

  const handleExcelIndir = async () => {
    setIsExcelLoading(true);
    try {
      const { excelDosyasiIndir } = await import("../lib/excelExport");
      excelDosyasiIndir(`sultankoy-analiz-${aktifDonem}.xlsx`, [
        {
          name: "Ozet",
          rows: [
            {
              Donem: aktifDonem,
              Adet: tAnalizAdet,
              KG: tAnalizKg,
              Tutar: tAnalizTutar,
            },
          ],
        },
        {
          name: "Analiz",
          rows: fAnalizList.map((satir) => ({
            Tarih: satir.tarih,
            Bayi: satisSatiriBayiAdiGetir(satir),
            Urun: satisSatiriUrunAdiGetir(satir),
            Adet: Number(satir.adet || 0),
            KG: Number(satir.toplam_kg || 0),
            Fiyat: Number(satir.fiyat || 0),
            Tutar: Number(satir.tutar || 0),
          })),
        },
      ]);
    } catch (error: any) {
      alert(`Excel indirilemedi: ${error?.message || "Bilinmeyen hata"}`);
    } finally {
      setIsExcelLoading(false);
    }
  };

  return (
    <>
      <div className="tab-fade-in main-content-area">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <button onClick={() => void handleExcelIndir()} disabled={isExcelLoading} className="btn-anim m-btn" style={{ margin: 0, minWidth: "118px", width: "auto", fontSize: "12px", background: "#0f766e", opacity: isExcelLoading ? 0.75 : 1, cursor: isExcelLoading ? "wait" : "pointer" }}>
            {isExcelLoading ? "Hazırlanıyor..." : "📥 EXCEL"}
          </button>
        </div>
        <div className="compact-totals auto" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px", marginTop: "5px" }}>
          {[
            { etiket: "TOP ADET", deger: helpers.fSayi(tAnalizAdet) },
            { etiket: "TOP KG", deger: helpers.fSayi(tAnalizKg) },
            { etiket: "TOP TUTAR", deger: `${helpers.fSayi(tAnalizTutar)} ₺` },
          ].map((kart) => (
            <div key={kart.etiket} className="c-kutu" style={{ border: "1px solid #8b5cf633", background: "#8b5cf610", color: "#8b5cf6", borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", overflow: "hidden" }}>
              <span>{kart.etiket}</span>
              <b>{kart.deger}</b>
            </div>
          ))}
        </div>

        <div className="table-wrapper" style={{ overflowX: "hidden" }}>
          <table className="tbl tbl-analiz" style={{ tableLayout: "fixed", width: "100%", minWidth: 0 }}>
            <thead>
              <tr>
                <AnalizTh label="TAR." width="13%" sortKey="tarih" currentSort={analizSort} setSort={setAnalizSort} filterType="analiz_tarih" setFilterModal={setActiveFilterModal} />
                <AnalizTh label="BAYİ" width="23%" sortKey="bayi" currentSort={analizSort} setSort={setAnalizSort} filterType="analiz_bayi" setFilterModal={setActiveFilterModal} />
                <AnalizTh label="ÜRÜN" width="21%" sortKey="urun" currentSort={analizSort} setSort={setAnalizSort} filterType="analiz_urun" setFilterModal={setActiveFilterModal} />
                <AnalizTh label="ADET" width="10%" sortKey="adet" currentSort={analizSort} setSort={setAnalizSort} align="right" setFilterModal={setActiveFilterModal} />
                <AnalizTh label="KG" width="10%" sortKey="toplam_kg" currentSort={analizSort} setSort={setAnalizSort} align="right" setFilterModal={setActiveFilterModal} />
                <AnalizTh label="FYT" width="11%" sortKey="fiyat" currentSort={analizSort} setSort={setAnalizSort} align="right" setFilterModal={setActiveFilterModal} />
                <AnalizTh label="TTR" width="12%" sortKey="tutar" currentSort={analizSort} setSort={setAnalizSort} align="right" setFilterModal={setActiveFilterModal} />
              </tr>
            </thead>
            <tbody>
              {fAnalizList.map((satir) => {
                const bayiAdi = satisSatiriBayiAdiGetir(satir);
                const urunAdi = satisSatiriUrunAdiGetir(satir);

                return (
                  <tr key={satir.id}>
                    <td>{satir.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
                    <td title={bayiAdi} style={{ fontWeight: "bold" }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {bayiAdi}
                      </span>
                    </td>
                    <td title={urunAdi}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {urunAdi}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{helpers.fSayi(satir.adet)}</td>
                    <td style={{ textAlign: "right" }}>{helpers.fSayi(satir.toplam_kg)}</td>
                    <td style={{ textAlign: "right" }}>{helpers.fSayi(Math.abs(Number(satir.fiyat)))}</td>
                    <td style={{ textAlign: "right", color: Number(satir.fiyat) < 0 ? "#dc2626" : "#8b5cf6", fontWeight: "bold" }}>
                      {Number(satir.fiyat) < 0 ? "-" : ""}
                      {helpers.fSayi(Math.abs(Number(satir.tutar)))}
                    </td>
                  </tr>
                );
              })}
              {fAnalizList.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                    Analiz kaydı bulunmuyor.
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
              {activeFilterModal === "analiz_tarih" ? "Tarih Aralığı Seç" : "Filtrele"}
            </h4>

            {activeFilterModal === "analiz_tarih" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "#64748b" }}>Başlangıç</label>
                  <input type="date" value={analizFiltre.baslangic} onChange={(e) => setAnalizFiltre((prev) => ({ ...prev, baslangic: e.target.value }))} className="m-inp date-click" style={{ width: "100%", marginTop: "4px" }} />
                </div>
                <div>
                  <label style={{ fontSize: "12px", color: "#64748b" }}>Bitiş</label>
                  <input type="date" value={analizFiltre.bitis} onChange={(e) => setAnalizFiltre((prev) => ({ ...prev, bitis: e.target.value }))} className="m-inp date-click" style={{ width: "100%", marginTop: "4px" }} />
                </div>
              </div>
            )}

            {activeFilterModal === "analiz_bayi" && (
              <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" }}>
                {bayiler.map((bayi) => (
                  <label key={bayi.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                    <input type="checkbox" checked={analizFiltre.bayiler.includes(bayi.isim)} onChange={() => handleCheckboxToggle("bayiler", bayi.isim)} style={{ width: "18px", height: "18px" }} />
                    {bayi.isim}
                  </label>
                ))}
              </div>
            )}

            {activeFilterModal === "analiz_urun" && (
              <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" }}>
                {urunler.map((urun) => (
                  <label key={urun.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                    <input type="checkbox" checked={analizFiltre.urunler.includes(urun.isim)} onChange={() => handleCheckboxToggle("urunler", urun.isim)} style={{ width: "18px", height: "18px" }} />
                    {urun.isim}
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "15px" }}>
              <button
                onClick={() => {
                  if (activeFilterModal === "analiz_bayi") {
                    setAnalizFiltre((prev) => ({ ...prev, bayiler: [] }));
                  } else if (activeFilterModal === "analiz_urun") {
                    setAnalizFiltre((prev) => ({ ...prev, urunler: [] }));
                  } else {
                    setAnalizFiltre((prev) => ({ ...prev, baslangic: "", bitis: "" }));
                  }
                }}
                style={{ flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: "6px", fontWeight: "bold" }}
              >
                TEMİZLE
              </button>
              <button onClick={() => setActiveFilterModal(null)} style={{ flex: 1, padding: "10px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}>
                UYGULA
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
