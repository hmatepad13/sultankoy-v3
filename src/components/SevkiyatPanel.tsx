import { useCallback, useEffect, useMemo, useState } from "react";
import { DonemDisiTarihUyarisi } from "./DonemDisiTarihUyarisi";
import { supabase } from "../lib/supabase";
import type { AppConfirmOptions, SevkiyatKaydi } from "../types/app";
import { aktifDonemDisiKayitOnayMetni, getLocalDateString } from "../utils/date";
import { fSayi, fSayiNoDec, kullanicilarAyniMi, normalizeUsername } from "../utils/format";

type SevkiyatPanelProps = {
  aktifKullaniciEposta: string;
  aktifKullaniciId: string | null;
  aktifKullaniciKisa: string;
  aktifDonem: string;
  isAdmin: boolean;
  onRefreshCop: () => void | Promise<void>;
  onConfirm: (options: AppConfirmOptions) => Promise<boolean>;
};

type SevkiyatDbRow = {
  id: number;
  tarih: string;
  kullanici: string | null;
  yogurt3kg: number | string | null;
  yogurt5kg: number | string | null;
  kaymak: number | string | null;
  ekleyen?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

type BasitSupabaseHatasi = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

const SEVKIYAT_TABLE = "sevkiyatlar";
const SEVKIYAT_SQL_DOSYASI = "sql/add-sevkiyatlar-table.sql";

const sayiDegeri = (deger: unknown) => {
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (typeof deger === "string") {
    const normalize = deger.trim().replace(",", ".");
    if (normalize && !Number.isNaN(Number(normalize))) return Number(normalize);
  }
  return 0;
};

const ondalikMetniTemizle = (deger: string) => {
  const temiz = deger.replace(/[^0-9.,]/g, "").replace(/\./g, ",");
  const ilkVirgul = temiz.indexOf(",");
  if (ilkVirgul === -1) return temiz;
  return `${temiz.slice(0, ilkVirgul + 1)}${temiz.slice(ilkVirgul + 1).replace(/,/g, "")}`;
};

const varsayilanTarihGetir = (aktifDonem: string) => {
  const bugun = getLocalDateString();
  return bugun.startsWith(aktifDonem) ? bugun : `${aktifDonem}-01`;
};

const donemAraligiGetir = (aktifDonem: string) => {
  const [yilStr, ayStr] = String(aktifDonem || "").split("-");
  const yil = Number(yilStr);
  const ay = Number(ayStr);

  if (!Number.isInteger(yil) || !Number.isInteger(ay) || ay < 1 || ay > 12) {
    return { baslangic: `${aktifDonem}-01`, sonrakiBaslangic: `${aktifDonem}-32` };
  }

  const baslangic = new Date(Date.UTC(yil, ay - 1, 1));
  const sonrakiBaslangic = new Date(Date.UTC(yil, ay, 1));
  const formatDate = (tarih: Date) =>
    `${tarih.getUTCFullYear()}-${String(tarih.getUTCMonth() + 1).padStart(2, "0")}-${String(tarih.getUTCDate()).padStart(2, "0")}`;

  return {
    baslangic: formatDate(baslangic),
    sonrakiBaslangic: formatDate(sonrakiBaslangic),
  };
};

const sevkiyatSatiriCevir = (satir: SevkiyatDbRow): SevkiyatKaydi => ({
  id: satir.id,
  tarih: satir.tarih,
  kullanici: satir.kullanici || normalizeUsername(satir.ekleyen || "") || "bilinmiyor",
  yogurt3kg: sayiDegeri(satir.yogurt3kg),
  yogurt5kg: sayiDegeri(satir.yogurt5kg),
  kaymak: sayiDegeri(satir.kaymak),
  ekleyen: satir.ekleyen || undefined,
  createdBy: satir.created_by || null,
  createdAt: satir.created_at || undefined,
});

const sevkiyatTablosuEksikMi = (hata: BasitSupabaseHatasi) => {
  const mesaj = `${hata?.message || ""} ${hata?.details || ""} ${hata?.hint || ""}`.toLowerCase();
  return (
    hata?.code === "42P01" ||
    hata?.code === "PGRST205" ||
    (mesaj.includes("sevkiyatlar") &&
      (mesaj.includes("does not exist") || mesaj.includes("schema cache") || mesaj.includes("not find")))
  );
};

const sevkiyatKurulumMesaji = () =>
  `Sevkiyat tablosu bulunamadı. Önce ${SEVKIYAT_SQL_DOSYASI} dosyasını Supabase SQL Editor'da çalıştırın.`;

export function SevkiyatPanel({ aktifKullaniciEposta, aktifKullaniciId, aktifKullaniciKisa, aktifDonem, isAdmin, onRefreshCop, onConfirm }: SevkiyatPanelProps) {
  const [sevkiyatList, setSevkiyatList] = useState<SevkiyatKaydi[]>([]);
  const [sevkiyatFiltreKisi, setSevkiyatFiltreKisi] = useState<"benim" | "tumu">("benim");
  const [varsayilanFiltreUygulananKullanici, setVarsayilanFiltreUygulananKullanici] = useState<string | null>(null);
  const [sevkiyatForm, setSevkiyatForm] = useState({
    tarih: varsayilanTarihGetir(aktifDonem),
    yogurt3kg: "",
    yogurt5kg: "",
    kaymak: "",
  });
  const [editingSevkiyatId, setEditingSevkiyatId] = useState<number | null>(null);
  const [sevkiyatDetayKaydi, setSevkiyatDetayKaydi] = useState<SevkiyatKaydi | null>(null);
  const [openDropdown, setOpenDropdown] = useState<{ type: string; id: string | number } | null>(null);
  const [isYukleniyor, setIsYukleniyor] = useState(false);
  const [isKaydediliyor, setIsKaydediliyor] = useState(false);
  const [isExcelLoading, setIsExcelLoading] = useState(false);
  const [kurulumUyarisi, setKurulumUyarisi] = useState("");

  useEffect(() => {
    if (editingSevkiyatId) return;
    setSevkiyatForm((prev) => ({ ...prev, tarih: varsayilanTarihGetir(aktifDonem) }));
  }, [aktifDonem, editingSevkiyatId]);

  useEffect(() => {
    if (!aktifKullaniciKisa || varsayilanFiltreUygulananKullanici === aktifKullaniciKisa) return;
    setSevkiyatFiltreKisi(isAdmin ? "tumu" : "benim");
    setVarsayilanFiltreUygulananKullanici(aktifKullaniciKisa);
  }, [aktifKullaniciKisa, isAdmin, varsayilanFiltreUygulananKullanici]);

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
    const temiz = alan === "kaymak" ? ondalikMetniTemizle(value) : value.replace(/[^\d]/g, "");
    setSevkiyatForm((prev) => ({ ...prev, [alan]: temiz }));
  };

  const veritabaniHataMesaji = useCallback((hata: BasitSupabaseHatasi) => {
    if (sevkiyatTablosuEksikMi(hata)) return sevkiyatKurulumMesaji();
    const mesaj = String(hata?.message || "Bilinmeyen veritabanı hatası");
    if (mesaj.toLowerCase().includes("row-level security policy")) {
      return "Sevkiyat kaydı engellendi. Bu kullanıcı için yazma izni yok.";
    }
    return mesaj;
  }, []);

  const sevkiyatlariYukle = useCallback(async () => {
    setIsYukleniyor(true);

    const { baslangic, sonrakiBaslangic } = donemAraligiGetir(aktifDonem);
    const { data, error } = await supabase
      .from(SEVKIYAT_TABLE)
      .select("id,tarih,kullanici,yogurt3kg,yogurt5kg,kaymak,ekleyen,created_by,created_at")
      .gte("tarih", baslangic)
      .lt("tarih", sonrakiBaslangic)
      .order("tarih", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      if (sevkiyatTablosuEksikMi(error)) {
        setKurulumUyarisi(sevkiyatKurulumMesaji());
        setSevkiyatList([]);
      } else {
        alert(`Hata: ${veritabaniHataMesaji(error)}`);
      }
      setIsYukleniyor(false);
      return;
    }

    setKurulumUyarisi("");
    setSevkiyatList(((data || []) as SevkiyatDbRow[]).map(sevkiyatSatiriCevir));
    setIsYukleniyor(false);
  }, [aktifDonem, veritabaniHataMesaji]);

  useEffect(() => {
    void sevkiyatlariYukle();
  }, [sevkiyatlariYukle]);

  const sevkiyatKaydiSahibiMi = useCallback(
    (kayit?: Partial<SevkiyatKaydi> | null) => kullanicilarAyniMi(kayit?.ekleyen || kayit?.kullanici, aktifKullaniciKisa),
    [aktifKullaniciKisa],
  );

  const handleSevkiyatKaydet = async () => {
    const yeniKayit: Omit<SevkiyatKaydi, "id"> = {
      tarih: sevkiyatForm.tarih,
      kullanici: aktifKullaniciKisa,
      yogurt3kg: sayiDegeri(sevkiyatForm.yogurt3kg),
      yogurt5kg: sayiDegeri(sevkiyatForm.yogurt5kg),
      kaymak: sayiDegeri(sevkiyatForm.kaymak),
    };

    if (!sevkiyatForm.tarih) return alert("Tarih seçin.");
    if (yeniKayit.yogurt3kg + yeniKayit.yogurt5kg + yeniKayit.kaymak <= 0) {
      return alert("En az bir sevkiyat miktarı girin.");
    }

    const duzenlenenKayit = editingSevkiyatId
      ? sevkiyatList.find((kayit) => Number(kayit.id) === Number(editingSevkiyatId))
      : null;

    if (editingSevkiyatId && !sevkiyatKaydiSahibiMi(duzenlenenKayit)) {
      return alert("Bu sevkiyati sadece kaydı giren kullanıcı düzenleyebilir.");
    }

    const donemDisiOnayMesaji = aktifDonemDisiKayitOnayMetni(sevkiyatForm.tarih, aktifDonem);
    if (
      donemDisiOnayMesaji &&
      !(await onConfirm({
        title: "Dönem Dışı Kayıt",
        message: donemDisiOnayMesaji,
        confirmText: "Evet, Kaydet",
        cancelText: "Vazgeç",
        tone: "warning",
      }))
    ) return;

    setIsKaydediliyor(true);

    const payload = {
      tarih: yeniKayit.tarih,
      kullanici: yeniKayit.kullanici,
      yogurt3kg: yeniKayit.yogurt3kg,
      yogurt5kg: yeniKayit.yogurt5kg,
      kaymak: yeniKayit.kaymak,
    };

    const { error } = editingSevkiyatId
      ? await supabase.from(SEVKIYAT_TABLE).update(payload).eq("id", editingSevkiyatId)
      : await supabase.from(SEVKIYAT_TABLE).insert(payload);

    if (error) {
      const mesaj = veritabaniHataMesaji(error);
      if (sevkiyatTablosuEksikMi(error)) {
        setKurulumUyarisi(mesaj);
      }
      setIsKaydediliyor(false);
      return alert(`Hata: ${mesaj}`);
    }

    resetSevkiyatForm();
    await sevkiyatlariYukle();
    setIsKaydediliyor(false);
  };

  const handleSevkiyatDuzenle = (kayit: SevkiyatKaydi) => {
    if (!sevkiyatKaydiSahibiMi(kayit)) {
      alert("Bu sevkiyati sadece kaydı giren kullanıcı düzenleyebilir.");
      return;
    }

    setEditingSevkiyatId(Number(kayit.id));
    setSevkiyatForm({
      tarih: kayit.tarih,
      yogurt3kg: kayit.yogurt3kg ? String(kayit.yogurt3kg) : "",
      yogurt5kg: kayit.yogurt5kg ? String(kayit.yogurt5kg) : "",
      kaymak: kayit.kaymak ? String(kayit.kaymak).replace(".", ",") : "",
    });
  };

  const handleSevkiyatSil = async (id: string | number) => {
    const kayit = sevkiyatList.find((item) => Number(item.id) === Number(id));
    if (!sevkiyatKaydiSahibiMi(kayit)) {
      alert("Bu sevkiyati sadece kaydı giren kullanıcı silebilir.");
      return;
    }

    if (
      !(await onConfirm({
        title: "Sevkiyat Kaydını Sil",
        message: "Sevkiyat kaydı silinsin mi?",
        confirmText: "Evet, Sil",
        cancelText: "İptal",
        tone: "danger",
      }))
    ) return;

    if (!kayit) {
      alert("Silinecek sevkiyat kaydı bulunamadı.");
      return;
    }

    const copVerisi = {
      id: Number(kayit.id),
      tarih: kayit.tarih,
      kullanici: kayit.kullanici,
      yogurt3kg: sayiDegeri(kayit.yogurt3kg),
      yogurt5kg: sayiDegeri(kayit.yogurt5kg),
      kaymak: sayiDegeri(kayit.kaymak),
      ekleyen: kayit.ekleyen || kayit.kullanici || aktifKullaniciKisa,
      created_by: kayit.createdBy || null,
      created_at: kayit.createdAt || null,
    };

    const { error: copError } = await supabase.from("cop_kutusu").insert({
      tablo_adi: SEVKIYAT_TABLE,
      veri: copVerisi,
      silinme_tarihi: new Date().toISOString(),
      silen_user_id: aktifKullaniciId,
      silen_email: aktifKullaniciEposta || null,
    });
    if (copError) {
      const mesaj = veritabaniHataMesaji(copError);
      return alert(`Çöp kutusuna taşınamadı: ${mesaj}`);
    }

    const { error } = await supabase.from(SEVKIYAT_TABLE).delete().eq("id", Number(id));
    if (error) {
      const mesaj = veritabaniHataMesaji(error);
      if (sevkiyatTablosuEksikMi(error)) {
        setKurulumUyarisi(mesaj);
      }
      return alert(`Hata: ${mesaj}`);
    }

    if (editingSevkiyatId === Number(id)) {
      resetSevkiyatForm();
    }
    await sevkiyatlariYukle();
    await onRefreshCop();
  };

  const filtrelenmisSevkiyatlar = useMemo(
    () =>
      sevkiyatList
        .filter((kayit) => String(kayit.tarih || "").startsWith(aktifDonem))
        .filter((kayit) => sevkiyatFiltreKisi === "tumu" || normalizeUsername(kayit.kullanici) === aktifKullaniciKisa)
        .sort((a, b) => `${b.tarih}${b.createdAt || ""}`.localeCompare(`${a.tarih}${a.createdAt || ""}`)),
    [aktifDonem, aktifKullaniciKisa, sevkiyatFiltreKisi, sevkiyatList],
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

  const handleExcelIndir = async () => {
    setIsExcelLoading(true);
    try {
      const { excelDosyasiIndir } = await import("../lib/excelExport");
      excelDosyasiIndir(`sultankoy-sevkiyat-${aktifDonem}.xlsx`, [
        {
          name: "Ozet",
          rows: [
            {
              Donem: aktifDonem,
              "Kisi Filtresi": sevkiyatFiltreKisi,
              "Toplam 3 KG": sevkiyatToplamlari.yogurt3kg,
              "Toplam 5 KG": sevkiyatToplamlari.yogurt5kg,
              "Toplam Kaymak": sevkiyatToplamlari.kaymak,
            },
          ],
        },
        {
          name: "Sevkiyatlar",
          rows: filtrelenmisSevkiyatlar.map((kayit) => ({
            Tarih: kayit.tarih,
            Kisi: kayit.kullanici,
            "Yogurt 3 KG": sayiDegeri(kayit.yogurt3kg),
            "Yogurt 5 KG": sayiDegeri(kayit.yogurt5kg),
            Kaymak: sayiDegeri(kayit.kaymak),
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
    <div className="tab-fade-in main-content-area">
      <div className="card" style={{ borderLeft: "4px solid #ea580c", marginBottom: "8px", padding: "8px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, color: "#9a3412", fontSize: "14px", lineHeight: 1.1 }}>Sevkiyat</h3>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginLeft: "auto" }}>
            <button onClick={() => void handleExcelIndir()} disabled={isExcelLoading} className="p-btn btn-anim" style={{ background: "#0f766e", minWidth: "96px", height: "30px", padding: "0 10px", fontSize: "11px", opacity: isExcelLoading ? 0.7 : 1, cursor: isExcelLoading ? "wait" : "pointer" }}>
              {isExcelLoading ? "Hazır..." : "📥 EXCEL"}
            </button>
            <div style={{ minWidth: "58px", border: "1px solid #ea580c33", background: "#fff7ed", color: "#c2410c", borderRadius: "8px", padding: "3px 5px", textAlign: "center" }}>
              <div style={{ fontSize: "7px", fontWeight: "bold", lineHeight: 1.05 }}>TOP 3 KG</div>
              <div style={{ fontSize: "11px", fontWeight: "bold", marginTop: "2px", lineHeight: 1 }}>{fSayiNoDec(sevkiyatToplamlari.yogurt3kg)}</div>
            </div>
            <div style={{ minWidth: "58px", border: "1px solid #c2410c33", background: "#fff7ed", color: "#c2410c", borderRadius: "8px", padding: "3px 5px", textAlign: "center" }}>
              <div style={{ fontSize: "7px", fontWeight: "bold", lineHeight: 1.05 }}>TOP 5 KG</div>
              <div style={{ fontSize: "11px", fontWeight: "bold", marginTop: "2px", lineHeight: 1 }}>{fSayiNoDec(sevkiyatToplamlari.yogurt5kg)}</div>
            </div>
            <div style={{ minWidth: "66px", border: "1px solid #9a341233", background: "#fff7ed", color: "#9a3412", borderRadius: "8px", padding: "3px 5px", textAlign: "center" }}>
              <div style={{ fontSize: "7px", fontWeight: "bold", lineHeight: 1.05 }}>TOP KAYMAK</div>
              <div style={{ fontSize: "11px", fontWeight: "bold", marginTop: "2px", lineHeight: 1 }}>{fSayi(sevkiyatToplamlari.kaymak)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
          <input
            type="date"
            className="m-inp"
            value={sevkiyatForm.tarih}
            onChange={(e) => setSevkiyatForm((prev) => ({ ...prev, tarih: e.target.value }))}
            style={{ width: "136px", flex: "0 0 136px", height: "30px", minHeight: "30px", padding: "4px 8px", fontSize: "11px" }}
          />
          <div style={{ display: "flex", background: "#cbd5e1", borderRadius: "6px", overflow: "hidden", flex: "0 0 auto", width: "148px" }}>
            <button onClick={() => setSevkiyatFiltreKisi("benim")} style={{ flex: 1, padding: "5px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "bold", background: sevkiyatFiltreKisi === "benim" ? "#ea580c" : "transparent", color: sevkiyatFiltreKisi === "benim" ? "#fff" : "#475569" }}>Benim</button>
            <button onClick={() => setSevkiyatFiltreKisi("tumu")} style={{ flex: 1, padding: "5px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "bold", background: sevkiyatFiltreKisi === "tumu" ? "#ea580c" : "transparent", color: sevkiyatFiltreKisi === "tumu" ? "#fff" : "#475569" }}>Tümü</button>
          </div>
        </div>
        <DonemDisiTarihUyarisi tarih={sevkiyatForm.tarih} aktifDonem={aktifDonem} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr)) auto", gap: "6px", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
            <span style={{ fontSize: "10px", fontWeight: "bold", color: "#7c2d12", whiteSpace: "nowrap" }}>3 KG</span>
            <input
              type="text"
              inputMode="numeric"
              className="m-inp"
              style={{ width: "100%", height: "30px", minHeight: "30px", flex: "0 0 30px", padding: "4px 6px", fontSize: "11px", textAlign: "center", boxSizing: "border-box" }}
              value={sevkiyatForm.yogurt3kg}
              onChange={(e) => handleSevkiyatInputDegistir("yogurt3kg", e.target.value)}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
            <span style={{ fontSize: "10px", fontWeight: "bold", color: "#7c2d12", whiteSpace: "nowrap" }}>5 KG</span>
            <input
              type="text"
              inputMode="numeric"
              className="m-inp"
              style={{ width: "100%", height: "30px", minHeight: "30px", flex: "0 0 30px", padding: "4px 6px", fontSize: "11px", textAlign: "center", boxSizing: "border-box" }}
              value={sevkiyatForm.yogurt5kg}
              onChange={(e) => handleSevkiyatInputDegistir("yogurt5kg", e.target.value)}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
            <span style={{ fontSize: "10px", fontWeight: "bold", color: "#7c2d12", whiteSpace: "nowrap" }}>Kaymak</span>
            <input
              type="text"
              inputMode="decimal"
              className="m-inp"
              style={{ width: "100%", height: "30px", minHeight: "30px", flex: "0 0 30px", padding: "4px 6px", fontSize: "11px", textAlign: "center", boxSizing: "border-box" }}
              value={sevkiyatForm.kaymak}
              onChange={(e) => handleSevkiyatInputDegistir("kaymak", e.target.value)}
            />
          </label>
          <button onClick={() => void handleSevkiyatKaydet()} disabled={isKaydediliyor} className="p-btn btn-anim" style={{ background: "#ea580c", minWidth: "96px", height: "30px", padding: "0 10px", fontSize: "11px", opacity: isKaydediliyor ? 0.7 : 1, cursor: isKaydediliyor ? "wait" : "pointer", alignSelf: "end" }}>
            {isKaydediliyor ? "KAYDEDİLİYOR" : editingSevkiyatId ? "GÜNCELLE" : "KAYDET"}
          </button>
        </div>
      </div>

      {kurulumUyarisi && (
        <div style={{ marginBottom: "8px", border: "1px solid #fdba74", background: "#fff7ed", color: "#9a3412", borderRadius: "10px", padding: "8px 10px", fontSize: "12px", fontWeight: "bold" }}>
          {kurulumUyarisi}
        </div>
      )}

      <div className="table-wrapper table-wrapper-fixed">
        <table className="tbl" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: "34%", textAlign: "left", background: "#5b9bd5", color: "#fff" }}>TAR / KİŞİ</th>
              <th style={{ width: "18%", textAlign: "right", background: "#5b9bd5", color: "#fff" }}>3 KG</th>
              <th style={{ width: "18%", textAlign: "right", background: "#5b9bd5", color: "#fff" }}>5 KG</th>
              <th style={{ width: "22%", textAlign: "right", background: "#5b9bd5", color: "#fff" }}>KAYMAK KG</th>
              <th style={{ width: "8%", background: "#5b9bd5" }}></th>
            </tr>
          </thead>
          <tbody>
            {isYukleniyor && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "14px", color: "#64748b", fontWeight: "bold" }}>
                  Yükleniyor...
                </td>
              </tr>
            )}
            {!isYukleniyor && filtrelenmisSevkiyatlar.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "14px", color: "#94a3b8", fontWeight: "bold" }}>
                  Sevkiyat kaydı bulunmuyor.
                </td>
              </tr>
            )}
            {!isYukleniyor && filtrelenmisSevkiyatlar.map((kayit) => (
              <tr key={String(kayit.id)}>
                <td style={{ textAlign: "left" }}>
                  <div style={{ display: "grid", gap: "2px", minWidth: 0 }}>
                    <span style={{ fontWeight: "bold", color: "#0f172a", lineHeight: 1.15 }}>{kayit.tarih.split("-").reverse().slice(0, 2).join(".")}</span>
                    <span
                      title={kayit.kullanici}
                      style={{ fontSize: "10px", color: "#64748b", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {kayit.kullanici}
                    </span>
                  </div>
                </td>
                <td style={{ textAlign: "right", fontWeight: "bold", color: "#ea580c" }}>{fSayiNoDec(kayit.yogurt3kg)}</td>
                <td style={{ textAlign: "right", fontWeight: "bold", color: "#ea580c" }}>{fSayiNoDec(kayit.yogurt5kg)}</td>
                <td style={{ textAlign: "right", fontWeight: "bold", color: "#ea580c" }}>{fSayi(kayit.kaymak)}</td>
                <td className="actions-cell" style={{ position: "relative" }}>
                  <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: "sevkiyat", id: kayit.id }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", padding: "0 4px", color: "#64748b" }}>⋮</button>
                  {openDropdown?.type === "sevkiyat" && Number(openDropdown.id) === Number(kayit.id) && (
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
              <div><b>Kaymak:</b> {fSayi(sevkiyatDetayKaydi.kaymak)}</div>
            </div>
            <button onClick={() => setSevkiyatDetayKaydi(null)} style={{ width: "100%", marginTop: "14px", padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", color: "#475569", cursor: "pointer" }}>KAPAT</button>
          </div>
        </div>
      )}
    </div>
  );
}
