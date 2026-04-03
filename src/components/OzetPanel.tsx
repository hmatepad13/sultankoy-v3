import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { TEMA_RENGI } from "../constants/app";
import type { PersonelOzeti, SortConfig } from "../types/app";

type MiniDetay = {
  baslik: string;
  renk: string;
  satirlar: Array<{ etiket: string; deger: string; vurgu?: boolean }>;
} | null;

type BayiBorcSatiri = {
  anahtar: string;
  isim: string;
  borc: number;
};

type EkstreMusteriSecenegi = {
  anahtar: string;
  isim: string;
};

type OzetFilterModal = "ozet_bayi" | null;

type OzetPanelProps = {
  aktifDonem: string;
  aktifDonemSatisEtiketi: string;
  tOzetReelSatis: number;
  tOzetFisTahsilatRaw: number;
  bayiNetDurum: number;
  tOzetDevredenBakiye: number;
  tGiderNormal: number;
  tHammaddeOdemeleri: number;
  tHammaddeBorcu: number;
  hammaddeOdemeDetaySatirlari: Array<{ etiket: string; deger: string; vurgu?: boolean }>;
  hammaddeBorcDetaySatirlari: Array<{ etiket: string; deger: string; vurgu?: boolean }>;
  bayiBorclari: BayiBorcSatiri[];
  ekstreMusterileri: EkstreMusteriSecenegi[];
  ozetBorcFiltre: { bayiler: string[] };
  setOzetBorcFiltre: (next: { bayiler: string[] }) => void;
  ozetBorcSort: SortConfig;
  setOzetBorcSort: (next: SortConfig) => void;
  personelOzetleri: PersonelOzeti[];
  onOpenMiniDetay: (detay: MiniDetay) => void;
  onOpenMusteriEkstre: (bayiAnahtar: string, musteriAdi: string) => void;
  helpers: {
    fSayiNoDec: (num: unknown) => string;
  };
};

const renderKompaktToplamlar = (
  kartlar: Array<{ etiket: string; deger: string; renk: string; onClick?: () => void }>,
  format?: CSSProperties,
  variant: "auto" | "three" | "two" = "auto",
  extraClassName = "",
) => (
  <div
    className={`compact-totals ${variant} ${extraClassName}`.trim()}
    style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px", ...format }}
  >
    {kartlar.map((kart) => (
      <div
        key={kart.etiket}
        onClick={kart.onClick}
        className="c-kutu"
        style={{
          border: `1px solid ${kart.renk}33`,
          background: `${kart.renk}10`,
          color: kart.renk,
          borderRadius: "999px",
          padding: "4px 8px",
          fontSize: "11px",
          fontWeight: "bold",
          cursor: kart.onClick ? "pointer" : "default",
          userSelect: "none",
          overflow: "hidden",
        }}
      >
        <span>{kart.etiket}</span>
        <b>{kart.deger}</b>
      </div>
    ))}
  </div>
);

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

function OzetTh({
  label,
  sortKey,
  currentSort,
  setSort,
  setFilterModal,
  align = "left",
  filterType = null,
}: {
  label: string;
  sortKey: string;
  currentSort: SortConfig;
  setSort: (next: SortConfig) => void;
  setFilterModal: (value: OzetFilterModal) => void;
  align?: "left" | "center" | "right";
  filterType?: OzetFilterModal;
}) {
  return (
    <th style={{ textAlign: align }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          justifyContent: align === "center" ? "center" : "space-between",
          gap: "2px",
          cursor: "pointer",
        }}
        onClick={() => handleSortClick(sortKey, currentSort, setSort)}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            justifyContent:
              align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
            flex: align === "center" ? "0 1 auto" : 1,
          }}
        >
          <span>{label}</span>
          {filterType && (
            <span
              onClick={(event) => {
                event.stopPropagation();
                setFilterModal(filterType);
              }}
              style={{
                fontSize: "8px",
                padding: "1px",
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
            paddingLeft: "2px",
            textAlign: "right",
          }}
        >
          {currentSort.key === sortKey ? (currentSort.direction === "asc" ? "▲" : "▼") : ""}
        </span>
      </div>
    </th>
  );
}

export function OzetPanel({
  aktifDonem,
  aktifDonemSatisEtiketi,
  tOzetReelSatis,
  tOzetFisTahsilatRaw,
  bayiNetDurum,
  tOzetDevredenBakiye,
  tGiderNormal,
  tHammaddeOdemeleri,
  tHammaddeBorcu,
  hammaddeOdemeDetaySatirlari,
  hammaddeBorcDetaySatirlari,
  bayiBorclari,
  ekstreMusterileri,
  ozetBorcFiltre,
  setOzetBorcFiltre,
  ozetBorcSort,
  setOzetBorcSort,
  personelOzetleri,
  onOpenMiniDetay,
  onOpenMusteriEkstre,
  helpers,
}: OzetPanelProps) {
  const [activeFilterModal, setActiveFilterModal] = useState<OzetFilterModal>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isExcelLoading, setIsExcelLoading] = useState(false);
  const [isEkstreModalOpen, setIsEkstreModalOpen] = useState(false);
  const [ekstreArama, setEkstreArama] = useState("");

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

  const ozetBorcFiltreSecenekleri = useMemo(
    () => [...new Set(bayiBorclari.map((item) => item.isim))].sort((a, b) => a.localeCompare(b, "tr")),
    [bayiBorclari],
  );

  const filtrelenmisBayiBorclari = useMemo(() => {
    const filtreliListe = bayiBorclari.filter(
      (item) => ozetBorcFiltre.bayiler.length === 0 || ozetBorcFiltre.bayiler.includes(item.isim),
    );

    return [...filtreliListe].sort((a, b) => {
      if (ozetBorcSort.key === "borc") {
        const fark = Number(a.borc) - Number(b.borc);
        return ozetBorcSort.direction === "asc" ? fark : -fark;
      }

      const sonuc = a.isim.localeCompare(b.isim, "tr");
      return ozetBorcSort.direction === "asc" ? sonuc : -sonuc;
    });
  }, [bayiBorclari, ozetBorcFiltre.bayiler, ozetBorcSort]);

  const filtrelenmisEkstreMusterileri = useMemo(() => {
    const arama = ekstreArama.trim().toLocaleLowerCase("tr-TR");
    if (!arama) return ekstreMusterileri;
    return ekstreMusterileri.filter((item) => item.isim.toLocaleLowerCase("tr-TR").includes(arama));
  }, [ekstreArama, ekstreMusterileri]);

  const handleExcelIndir = async () => {
    setIsExcelLoading(true);
    try {
      const { excelDosyasiIndir } = await import("../lib/excelExport");
      excelDosyasiIndir(`sultankoy-ozet-${aktifDonem}.xlsx`, [
        {
          name: "Ozet",
          rows: [
            {
              Donem: aktifDonem,
              "Donem Satisi": tOzetReelSatis,
              Tahsilat: tOzetFisTahsilatRaw,
              "Acik Hesap": bayiNetDurum,
              "Devreden Bakiye": tOzetDevredenBakiye,
              "Isletme Giderleri": tGiderNormal,
              "Hammadde Odemeleri": tHammaddeOdemeleri,
              "Hammadde Borcu": tHammaddeBorcu,
            },
          ],
        },
        {
          name: "Bayi Borclari",
          rows: filtrelenmisBayiBorclari.map((item) => ({
            Musteri: item.isim,
            Borc: item.borc,
          })),
        },
        {
          name: "Personel",
          rows: personelOzetleri.map((item) => ({
            Personel: item.isim,
            Satis: item.satis,
            Tahsilat: item.tahsilat,
            Gider: item.gider,
            "Kasaya Devir": item.kasayaDevir,
            Net: item.net,
            "Acik Bakiye": item.acikBakiye,
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
      <div className="tab-fade-in main-content-area" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <button onClick={() => void handleExcelIndir()} disabled={isExcelLoading} className="btn-anim m-btn" style={{ margin: 0, minWidth: "118px", width: "auto", fontSize: "12px", background: "#0f766e", opacity: isExcelLoading ? 0.75 : 1, cursor: isExcelLoading ? "wait" : "pointer" }}>{isExcelLoading ? "Hazırlanıyor..." : "📥 EXCEL"}</button>
        </div>
        {renderKompaktToplamlar(
          [
            { etiket: aktifDonemSatisEtiketi, deger: `${helpers.fSayiNoDec(tOzetReelSatis)} ₺`, renk: "#059669" },
            { etiket: "TAHSİLAT", deger: `${helpers.fSayiNoDec(tOzetFisTahsilatRaw)} ₺`, renk: "#2563eb" },
            { etiket: "AÇIK HESAP", deger: `${helpers.fSayiNoDec(bayiNetDurum)} ₺`, renk: "#f59e0b" },
          ],
          { marginBottom: "6px" },
          "three",
          "summary-c",
        )}

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
          <div
            className="c-kutu"
            style={{
              border: "1px solid #b4530933",
              background: "#b4530910",
              color: "#b45309",
              borderRadius: "18px",
              padding: "6px 10px",
              fontSize: "11px",
              fontWeight: "bold",
              flex: "1 1 130px",
              minWidth: "120px",
            }}
          >
            <div style={{ fontSize: "10px", opacity: 0.9, marginBottom: "2px" }}>DEVREDEN BAKİYE</div>
            <b style={{ fontSize: "14px" }}>{helpers.fSayiNoDec(tOzetDevredenBakiye)} ₺</b>
          </div>
          <div
            className="c-kutu"
            style={{
              border: "1px solid #dc262633",
              background: "#dc262610",
              color: "#dc2626",
              borderRadius: "18px",
              padding: "6px 10px",
              fontSize: "11px",
              fontWeight: "bold",
              flex: "1 1 130px",
              minWidth: "120px",
            }}
          >
            <div style={{ fontSize: "10px", opacity: 0.9, marginBottom: "2px" }}>İŞLETME GİDERLERİ</div>
            <b style={{ fontSize: "14px" }}>{helpers.fSayiNoDec(tGiderNormal)} ₺</b>
          </div>
          <div
            className="c-kutu"
            style={{
              border: "1px solid #8b5cf633",
              background: "#8b5cf610",
              color: "#334155",
              borderRadius: "18px",
              padding: "6px 10px",
              fontSize: "10px",
              fontWeight: "bold",
              flex: "1 1 150px",
              minWidth: "145px",
              cursor: "pointer",
            }}
            onClick={() =>
              onOpenMiniDetay({
                baslik: "Hammadde Ödemeleri",
                renk: "#7c3aed",
                satirlar: hammaddeOdemeDetaySatirlari,
              })
            }
          >
            <div style={{ color: "#7c3aed", fontSize: "10px", marginBottom: "2px" }}>HAMMADDE ÖDEMELERİ</div>
            <b style={{ fontSize: "14px" }}>{helpers.fSayiNoDec(tHammaddeOdemeleri)} ₺</b>
          </div>
          <div
            className="c-kutu"
            style={{
              border: "1px solid #0f766e33",
              background: "#0f766e10",
              color: "#334155",
              borderRadius: "18px",
              padding: "6px 10px",
              fontSize: "10px",
              fontWeight: "bold",
              flex: "1 1 150px",
              minWidth: "145px",
              cursor: "pointer",
            }}
            onClick={() =>
              onOpenMiniDetay({
                baslik: "Hammadde Borçları",
                renk: "#0f766e",
                satirlar: hammaddeBorcDetaySatirlari,
              })
            }
          >
            <div style={{ color: "#0f766e", fontSize: "10px", marginBottom: "2px" }}>HAMMADDE BORÇLARI</div>
            <b style={{ fontSize: "14px" }}>{helpers.fSayiNoDec(tHammaddeBorcu)} ₺</b>
          </div>
        </div>

        <div className="card" style={{ marginTop: "5px", order: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "5px", flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>
              Müşteri Borç Durumları
            </h4>
            <button
              onClick={() => {
                setEkstreArama("");
                setIsEkstreModalOpen(true);
              }}
              className="btn-anim"
              style={{
                border: "1px solid #0f766e33",
                background: "#0f766e10",
                color: "#0f766e",
                borderRadius: "999px",
                padding: "6px 10px",
                fontSize: "11px",
                fontWeight: "bold",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              🧾 EKSTRE ARA
            </button>
          </div>
          <div style={{ maxHeight: "300px", overflowY: "auto", paddingRight: "5px" }}>
            <table className="tbl" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <OzetTh
                    label="Bayi"
                    sortKey="isim"
                    currentSort={ozetBorcSort}
                    setSort={setOzetBorcSort}
                    filterType="ozet_bayi"
                    setFilterModal={setActiveFilterModal}
                  />
                  <OzetTh
                    label="Tutar"
                    sortKey="borc"
                    currentSort={ozetBorcSort}
                    setSort={setOzetBorcSort}
                    align="right"
                    setFilterModal={setActiveFilterModal}
                  />
                  <th style={{ width: "34px" }} />
                </tr>
              </thead>
              <tbody>
                {filtrelenmisBayiBorclari.map((borc) => (
                  <tr key={borc.anahtar}>
                    <td>
                      <b
                        style={{
                          fontSize: "12px",
                          display: "inline-block",
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          verticalAlign: "bottom",
                        }}
                      >
                        {borc.isim}
                      </b>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <b
                        style={{
                          fontSize: "12px",
                          color:
                            borc.borc > 0 ? "#dc2626" : borc.borc < 0 ? "#059669" : "#64748b",
                        }}
                      >
                        {helpers.fSayiNoDec(borc.borc)} ₺
                      </b>
                    </td>
                    <td className="actions-cell" style={{ position: "relative" }}>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenDropdownId(borc.anahtar);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "18px",
                          padding: "0 6px",
                          color: "#64748b",
                        }}
                      >
                        ⋮
                      </button>
                      {openDropdownId === borc.anahtar && (
                        <div className="dropdown-menu">
                          <button
                            title="Ekstre"
                            className="dropdown-item-icon"
                            onClick={() => {
                              setOpenDropdownId(null);
                              onOpenMusteriEkstre(borc.anahtar, borc.isim);
                            }}
                          >
                            🧾
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtrelenmisBayiBorclari.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ color: "#94a3b8", fontSize: "12px", textAlign: "center" }}>
                      Açık hesap bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isEkstreModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1200,
              padding: "16px",
            }}
            onClick={() => setIsEkstreModalOpen(false)}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "420px",
                background: "#fff",
                borderRadius: "16px",
                border: "1px solid #cbd5e1",
                boxShadow: "0 24px 40px rgba(15, 23, 42, 0.18)",
                overflow: "hidden",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "15px", fontWeight: "bold", color: "#0f172a" }}>Ekstre Ara</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  Borcu sıfırlanmış müşteriler dahil tüm hesaplardan seçim yapabilirsin.
                </div>
                <input
                  value={ekstreArama}
                  onChange={(event) => setEkstreArama(event.target.value)}
                  placeholder="Müşteri veya grup adı ara"
                  autoFocus
                  className="m-inp"
                  style={{ width: "100%", marginTop: "10px" }}
                />
              </div>
              <div style={{ maxHeight: "360px", overflowY: "auto", padding: "8px" }}>
                {filtrelenmisEkstreMusterileri.length > 0 ? (
                  filtrelenmisEkstreMusterileri.map((item) => (
                    <button
                      key={item.anahtar}
                      onClick={() => {
                        setIsEkstreModalOpen(false);
                        setEkstreArama("");
                        onOpenMusteriEkstre(item.anahtar, item.isim);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        borderRadius: "10px",
                        padding: "10px 12px",
                        marginBottom: "8px",
                        cursor: "pointer",
                        color: "#0f172a",
                        fontSize: "13px",
                        fontWeight: "bold",
                      }}
                    >
                      {item.isim}
                    </button>
                  ))
                ) : (
                  <div style={{ padding: "18px 8px", textAlign: "center", color: "#94a3b8", fontSize: "12px", fontWeight: "bold" }}>
                    Aramaya uygun müşteri bulunamadı.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px 14px", borderTop: "1px solid #e2e8f0" }}>
                <button
                  onClick={() => setIsEkstreModalOpen(false)}
                  className="btn-anim"
                  style={{
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#475569",
                    borderRadius: "10px",
                    padding: "8px 12px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: "5px", order: 1 }}>
          <h4 style={{ margin: "0 0 10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "5px" }}>
            Personel Özetleri
          </h4>
          <div style={{ maxHeight: "300px", overflowY: "auto", paddingRight: 0 }}>
            <table className="tbl tbl-personel" style={{ fontSize: "11px", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th>Personel</th>
                  <th style={{ textAlign: "right" }}>Satış</th>
                  <th style={{ textAlign: "right" }}>Tahs.</th>
                  <th style={{ textAlign: "right" }}>Gider</th>
                  <th style={{ textAlign: "right" }}>K. Devir</th>
                  <th style={{ textAlign: "right" }}>Net</th>
                  <th style={{ textAlign: "right" }}>Açık</th>
                </tr>
              </thead>
              <tbody>
                {personelOzetleri.map((personel, index) => (
                  <tr key={index}>
                    <td style={{ fontWeight: "bold" }}>{personel.isim}</td>
                    <td
                      style={{
                        textAlign: "right",
                        color: "#059669",
                        fontWeight: "bold",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        lineHeight: 1.05,
                      }}
                    >
                      {helpers.fSayiNoDec(personel.satis)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: "#2563eb",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        lineHeight: 1.05,
                      }}
                    >
                      {helpers.fSayiNoDec(personel.tahsilat)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: "#dc2626",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        lineHeight: 1.05,
                      }}
                    >
                      {helpers.fSayiNoDec(personel.gider)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: "#0f766e",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        lineHeight: 1.05,
                      }}
                    >
                      {helpers.fSayiNoDec(personel.kasayaDevir)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: "bold",
                        color: personel.net >= 0 ? "#16a34a" : "#dc2626",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        lineHeight: 1.05,
                      }}
                    >
                      {helpers.fSayiNoDec(personel.net)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: "bold",
                        color: personel.acikBakiye >= 0 ? "#f59e0b" : "#059669",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        lineHeight: 1.05,
                      }}
                    >
                      {helpers.fSayiNoDec(personel.acikBakiye)}
                    </td>
                  </tr>
                ))}
                {personelOzetleri.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8" }}>
                      Bu döneme ait personel hareketi bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {activeFilterModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 1400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setActiveFilterModal(null)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              padding: "15px",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "260px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h4
              style={{
                marginTop: 0,
                marginBottom: "10px",
                borderBottom: "1px solid #eee",
                paddingBottom: "5px",
                color: "#1e293b",
              }}
            >
              Filtrele
            </h4>

            <div
              style={{
                maxHeight: "250px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                padding: "4px 0",
              }}
            >
              {ozetBorcFiltreSecenekleri.map((isim) => (
                <label
                  key={isim}
                  style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}
                >
                  <input
                    type="checkbox"
                    checked={ozetBorcFiltre.bayiler.includes(isim)}
                    onChange={() =>
                      setOzetBorcFiltre({
                        ...ozetBorcFiltre,
                        bayiler: ozetBorcFiltre.bayiler.includes(isim)
                          ? ozetBorcFiltre.bayiler.filter((item) => item !== isim)
                          : [...ozetBorcFiltre.bayiler, isim],
                      })
                    }
                    style={{ width: "18px", height: "18px" }}
                  />
                  {isim}
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "15px" }}>
              <button
                onClick={() => setOzetBorcFiltre({ bayiler: [] })}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#f1f5f9",
                  color: "#64748b",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "bold",
                }}
              >
                TEMİZLE
              </button>
              <button
                onClick={() => setActiveFilterModal(null)}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: TEMA_RENGI,
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "bold",
                }}
              >
                UYGULA
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
