import { useEffect, useMemo, useState } from "react";
import { DonemDisiTarihUyarisi } from "./DonemDisiTarihUyarisi";
import { supabase } from "../lib/supabase";
import {
  adettenKg,
  bosUretimFormu,
  kgSatirTutari,
  miktarSatirTutari,
  sayiDegeri,
  sayiVeyaBos,
  sonUretimFiyatlariniBul,
  uretimAciklamasiniBirlestir,
  uretimCikanToplamAdet,
  uretimCikanToplamKg,
  uretimGirenToplamKg,
  uretimKaydiniNormalizeEt,
  uretimMaliyetToplami,
  uretimNotunuKisalt,
  uretimSatisToplami,
  type UretimTipi,
} from "../lib/uretim";
import type { AppConfirmOptions, SortConfig, Uretim } from "../types/app";
import { aktifDonemDisiKayitOnayMetni, getLocalDateString } from "../utils/date";
import { fSayiNoDec, normalizeUsername } from "../utils/format";

type UretimMiniDetay = {
  baslik: string;
  renk: string;
  satirlar: Array<{ etiket: string; deger: string; vurgu?: boolean }>;
};

type UretimPanelProps = {
  aktifDonem: string;
  aktifKullaniciEposta: string;
  aktifKullaniciId: string | null;
  aktifKullaniciKisa: string;
  isAdmin: boolean;
  uretimList: Uretim[];
  onRefreshUretim: () => void | Promise<void>;
  onRefreshCop: () => void | Promise<void>;
  onConfirm: (options: AppConfirmOptions) => Promise<boolean>;
  helpers: {
    fSayi: (num: unknown) => string;
    veritabaniHatasiMesaji: (tablo: string, hata: { message?: string } | null) => string;
  };
};

const varsayilanTarihGetir = (aktifDonem: string) => {
  const bugun = getLocalDateString();
  return bugun.startsWith(aktifDonem) ? bugun : `${aktifDonem}-01`;
};

const sortData = (data: Uretim[], sortConfig: SortConfig) => {
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

    const createdAtA = Date.parse(String((a as Uretim & { created_at?: string | null }).created_at || ""));
    const createdAtB = Date.parse(String((b as Uretim & { created_at?: string | null }).created_at || ""));
    if (!Number.isNaN(createdAtA) && !Number.isNaN(createdAtB) && createdAtA !== createdAtB) {
      return sortConfig.direction === "asc" ? createdAtA - createdAtB : createdAtB - createdAtA;
    }

    const idA = Number(a.id);
    const idB = Number(b.id);
    if (!Number.isNaN(idA) && !Number.isNaN(idB) && idA !== idB) {
      return sortConfig.direction === "asc" ? idA - idB : idB - idA;
    }

    return sortConfig.direction === "asc"
      ? String(a.id || "").localeCompare(String(b.id || ""))
      : String(b.id || "").localeCompare(String(a.id || ""));
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

function UretimTh({
  label,
  sortKey,
  currentSort,
  setSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  currentSort: SortConfig;
  setSort: (next: SortConfig) => void;
  align?: "left" | "center" | "right";
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

export function UretimPanel({
  aktifDonem,
  aktifKullaniciEposta,
  aktifKullaniciId,
  aktifKullaniciKisa,
  isAdmin,
  uretimList,
  onRefreshUretim,
  onRefreshCop,
  onConfirm,
  helpers,
}: UretimPanelProps) {
  const [isUretimModalOpen, setIsUretimModalOpen] = useState(false);
  const [uretimDetayData, setUretimDetayData] = useState<Uretim | null>(null);
  const [uretimMiniDetay, setUretimMiniDetay] = useState<UretimMiniDetay | null>(null);
  const [editingUretimId, setEditingUretimId] = useState<string | null>(null);
  const [uretimForm, setUretimForm] = useState<Uretim>(() =>
    bosUretimFormu(varsayilanTarihGetir(aktifDonem), "yogurt"),
  );
  const [uretimSort, setUretimSort] = useState<SortConfig>({ key: "tarih", direction: "desc" });
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isExcelLoading, setIsExcelLoading] = useState(false);

  useEffect(() => {
    if (isUretimModalOpen || editingUretimId) return;
    setUretimForm((prev) => ({ ...prev, tarih: varsayilanTarihGetir(aktifDonem) }));
  }, [aktifDonem, editingUretimId, isUretimModalOpen]);

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

  const uretimAksiyonYetkiliMi =
    normalizeUsername(aktifKullaniciKisa) === "admin" || normalizeUsername(aktifKullaniciKisa) === "yusuf";
  const kaydiSilebilirMi = (ekleyen?: string | null) =>
    isAdmin || (!!normalizeUsername(ekleyen) && normalizeUsername(ekleyen) === normalizeUsername(aktifKullaniciKisa));
  const kaydiDuzenleyebilirMi = (ekleyen?: string | null) => kaydiSilebilirMi(ekleyen);
  const tabloTamSayi = (deger: unknown) =>
    fSayiNoDec(typeof deger === "number" || typeof deger === "string" ? deger : 0);

  const periodUretim = useMemo(
    () => uretimList.filter((kayit) => kayit.tarih.startsWith(aktifDonem)),
    [aktifDonem, uretimList],
  );
  const uretimSonFiyatlar = useMemo(() => sonUretimFiyatlariniBul(uretimList), [uretimList]);
  const aktifUretimTipi: UretimTipi = uretimForm.uretim_tipi || "yogurt";
  const siraliUretimList = useMemo(() => sortData(periodUretim, uretimSort), [periodUretim, uretimSort]);
  const yogurtUretimListesi = useMemo(
    () => siraliUretimList.filter((kayit) => (kayit.uretim_tipi || "yogurt") !== "sut_kaymagi"),
    [siraliUretimList],
  );
  const sutKaymagiUretimListesi = useMemo(
    () => siraliUretimList.filter((kayit) => (kayit.uretim_tipi || "yogurt") === "sut_kaymagi"),
    [siraliUretimList],
  );
  const aktifUretimMaliyet = useMemo(() => uretimMaliyetToplami(uretimForm), [uretimForm]);
  const aktifUretimSatisToplami = useMemo(() => uretimSatisToplami(uretimForm), [uretimForm]);
  const aktifUretimKar = aktifUretimSatisToplami - aktifUretimMaliyet;
  const aktifUretimGirenKg = useMemo(() => uretimGirenToplamKg(uretimForm), [uretimForm]);
  const aktifUretimCikanKg = useMemo(() => uretimCikanToplamKg(uretimForm), [uretimForm]);

  const coptKutusunaAt = async (tablo: string, veri: Uretim) => {
    const { error } = await supabase
      .from("cop_kutusu")
      .insert({
        tablo_adi: tablo,
        veri,
        silinme_tarihi: new Date().toISOString(),
        silen_user_id: aktifKullaniciId,
        silen_email: aktifKullaniciEposta,
      });

    if (error) {
      console.warn("Çöp kutusuna atılamadı:", error.message);
      return false;
    }

    return true;
  };

  const yeniUretimFormunuAc = (tip: UretimTipi) => {
    setUretimForm(bosUretimFormu(varsayilanTarihGetir(aktifDonem), tip, uretimSonFiyatlar[tip]));
    setEditingUretimId(null);
    setIsUretimModalOpen(true);
  };

  const handleUretimSil = async (kayit: Uretim) => {
    if (!kaydiSilebilirMi(kayit.ekleyen)) {
      alert("Bu üretim kaydını sadece ekleyen kullanıcı veya admin silebilir.");
      return;
    }

    if (
      !(await onConfirm({
        title: "Üretim Kaydını Sil",
        message: "Bu üretim kaydı silinsin mi?",
        confirmText: "Evet, Sil",
        cancelText: "İptal",
        tone: "danger",
      }))
    ) return;

    const copBasarili = await coptKutusunaAt("uretim", kayit);
    if (!copBasarili) {
      alert("Kayıt çöp kutusuna alınamadığı için silme iptal edildi.");
      return;
    }

    const { error } = await supabase.from("uretim").delete().eq("id", kayit.id);
    if (error) {
      alert(`Silme hatası: ${helpers.veritabaniHatasiMesaji("uretim", error)}`);
      return;
    }

    await onRefreshUretim();
    await onRefreshCop();
  };

  const handleUretimKaydet = async () => {
    if (!uretimForm.tarih) return alert("Tarih zorunludur!");

    const duzenlenenKayit = uretimList.find((item) => item.id === editingUretimId);
    if (editingUretimId && !kaydiDuzenleyebilirMi(duzenlenenKayit?.ekleyen)) {
      return alert("Bu üretim kaydını sadece ekleyen kullanıcı veya admin düzenleyebilir.");
    }

    const donemDisiOnayMesaji = aktifDonemDisiKayitOnayMetni(uretimForm.tarih, aktifDonem);
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

    const maliyet = uretimMaliyetToplami(uretimForm);
    const satisDegeri = uretimSatisToplami(uretimForm);
    const hesaplananKar = satisDegeri - maliyet;
    const topKg = uretimGirenToplamKg(uretimForm);
    const cikanToplamKg = uretimCikanToplamKg(uretimForm);

    const payload = {
      tarih: uretimForm.tarih,
      cig_sut: sayiDegeri(uretimForm.cig_sut),
      sut_fiyat: sayiDegeri(uretimForm.sut_fiyat),
      sut_tozu: sayiDegeri(uretimForm.sut_tozu),
      sut_tozu_fiyat: sayiDegeri(uretimForm.sut_tozu_fiyat),
      tereyag: sayiDegeri(uretimForm.tereyag),
      tereyag_fiyat: sayiDegeri(uretimForm.tereyag_fiyat),
      katki_kg: sayiDegeri(uretimForm.katki_kg),
      katki_fiyat: sayiDegeri(uretimForm.katki_fiyat),
      su: sayiDegeri(uretimForm.su),
      kova_3_adet: sayiDegeri(uretimForm.kova_3_adet),
      kova_3_fiyat: sayiDegeri(uretimForm.kova_3_fiyat),
      kova_5_adet: sayiDegeri(uretimForm.kova_5_adet),
      kova_5_fiyat: sayiDegeri(uretimForm.kova_5_fiyat),
      cikti_3kg: sayiDegeri(uretimForm.cikti_3kg),
      satis_3_fiyat: sayiDegeri(uretimForm.satis_3_fiyat),
      cikti_5kg: sayiDegeri(uretimForm.cikti_5kg),
      satis_5_fiyat: sayiDegeri(uretimForm.satis_5_fiyat),
      toplam_kg: topKg,
      toplam_maliyet: maliyet,
      kar: hesaplananKar,
      aciklama: uretimAciklamasiniBirlestir(uretimForm.aciklama, {
        uretim_tipi: uretimForm.uretim_tipi || "yogurt",
        su_fiyat: sayiVeyaBos(uretimForm.su_fiyat),
        krema: sayiVeyaBos(uretimForm.krema),
        krema_fiyat: sayiVeyaBos(uretimForm.krema_fiyat),
        diger_adet: sayiVeyaBos(uretimForm.diger_adet),
        diger_kg: sayiVeyaBos(uretimForm.diger_kg),
        diger_fiyat: sayiVeyaBos(uretimForm.diger_fiyat),
        paket_02_adet: sayiVeyaBos(uretimForm.paket_02_adet),
        paket_02_fiyat: sayiVeyaBos(uretimForm.paket_02_fiyat),
        paket_2_adet: sayiVeyaBos(uretimForm.paket_2_adet),
        paket_2_fiyat: sayiVeyaBos(uretimForm.paket_2_fiyat),
        paket_3_adet: sayiVeyaBos(uretimForm.paket_3_adet),
        paket_3_fiyat: sayiVeyaBos(uretimForm.paket_3_fiyat),
        cikti_02kg: sayiVeyaBos(uretimForm.cikti_02kg),
        cikti_02kg_kg: sayiVeyaBos(uretimForm.cikti_02kg_kg),
        satis_02_fiyat: sayiVeyaBos(uretimForm.satis_02_fiyat),
        cikti_2kg: sayiVeyaBos(uretimForm.cikti_2kg),
        cikti_2kg_kg: sayiVeyaBos(uretimForm.cikti_2kg_kg),
        satis_2_fiyat: sayiVeyaBos(uretimForm.satis_2_fiyat),
        cikti_3kg_kg: sayiVeyaBos(uretimForm.cikti_3kg_kg),
        cikti_5kg_kg: sayiVeyaBos(uretimForm.cikti_5kg_kg),
        cikan_toplam_kg: cikanToplamKg,
      }),
      ekleyen: aktifKullaniciEposta,
    };

    let { error } = editingUretimId
      ? await supabase.from("uretim").update(payload).eq("id", editingUretimId)
      : await supabase.from("uretim").insert(payload);

    if (error?.message?.includes("'ekleyen'")) {
      const fallbackPayload = { ...payload } as Partial<typeof payload>;
      delete fallbackPayload.ekleyen;
      const retryResult = editingUretimId
        ? await supabase.from("uretim").update(fallbackPayload).eq("id", editingUretimId)
        : await supabase.from("uretim").insert(fallbackPayload);
      error = retryResult.error;
    }

    if (error) {
      alert(`Hata: ${helpers.veritabaniHatasiMesaji("uretim", error)}`);
      return;
    }

    const sonrakiTip = uretimForm.uretim_tipi || "yogurt";
    setUretimForm(bosUretimFormu(varsayilanTarihGetir(aktifDonem), sonrakiTip, uretimSonFiyatlar[sonrakiTip]));
    setEditingUretimId(null);
    setIsUretimModalOpen(false);
    await onRefreshUretim();
  };

  const renderKgSatiri = (
    etiket: string,
    kgField: keyof Uretim,
    fiyatField: keyof Uretim,
    renk = "#475569",
  ) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 52px 52px 58px", gap: "4px", alignItems: "center" }}>
      <span style={{ fontSize: "10px", fontWeight: "bold", color: renk, lineHeight: 1.15 }}>{etiket}</span>
      <input
        placeholder="KG"
        type="number"
        step="0.01"
        value={String(uretimForm[kgField] ?? "")}
        onChange={(e) => setUretimForm({ ...uretimForm, [kgField]: e.target.value })}
        className="m-inp small-inp"
        style={{ textAlign: "right", minWidth: 0 }}
      />
      <input
        placeholder="Fiyat"
        type="number"
        step="0.01"
        value={String(uretimForm[fiyatField] ?? "")}
        onChange={(e) => setUretimForm({ ...uretimForm, [fiyatField]: e.target.value })}
        className="m-inp small-inp"
        style={{ textAlign: "right", minWidth: 0 }}
      />
      <div style={{ textAlign: "right", fontWeight: "bold", fontSize: "10.5px", color: "#0f172a", minWidth: 0 }}>
        {helpers.fSayi(kgSatirTutari(uretimForm[kgField], uretimForm[fiyatField]))} ₺
      </div>
    </div>
  );

  const renderAdetFiyatSatiri = (
    etiket: string,
    adetField: keyof Uretim,
    fiyatField: keyof Uretim,
    renk = "#475569",
    mirrorField?: keyof Uretim,
    mirrorKgField?: keyof Uretim,
    mirrorKgMultiplier?: number,
  ) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 52px 52px 58px", gap: "4px", alignItems: "center" }}>
      <span style={{ fontSize: "10px", fontWeight: "bold", color: renk, lineHeight: 1.15 }}>{etiket}</span>
      <input
        placeholder="Adet"
        type="number"
        value={String(uretimForm[adetField] ?? "")}
        onChange={(e) => {
          const yeniDeger = e.target.value;
          const sonrakiForm = { ...uretimForm, [adetField]: yeniDeger } as Uretim;
          if (mirrorField) sonrakiForm[mirrorField] = yeniDeger as never;
          if (mirrorKgField && mirrorKgMultiplier) {
            sonrakiForm[mirrorKgField] = (
              yeniDeger === "" ? "" : String(sayiDegeri(yeniDeger) * mirrorKgMultiplier)
            ) as never;
          }
          setUretimForm(sonrakiForm);
        }}
        className="m-inp small-inp"
        style={{ textAlign: "right", minWidth: 0 }}
      />
      <input
        placeholder="Fiyat"
        type="number"
        step="0.01"
        value={String(uretimForm[fiyatField] ?? "")}
        onChange={(e) => setUretimForm({ ...uretimForm, [fiyatField]: e.target.value })}
        className="m-inp small-inp"
        style={{ textAlign: "right", minWidth: 0 }}
      />
      <div style={{ textAlign: "right", fontWeight: "bold", fontSize: "10.5px", color: "#0f172a", minWidth: 0 }}>
        {helpers.fSayi(sayiDegeri(uretimForm[adetField]) * sayiDegeri(uretimForm[fiyatField]))} ₺
      </div>
    </div>
  );

  const renderPaketCiktiSatiri = (
    etiket: string,
    adetField: keyof Uretim,
    kgField: keyof Uretim,
    fiyatField: keyof Uretim,
    birimKg: number,
  ) => {
    const adetDegeri = sayiDegeri(uretimForm[adetField]);
    const kgDegeri = sayiDegeri(uretimForm[kgField]) || adetDegeri * birimKg;
    const gorunenKg = String(uretimForm[kgField] ?? "") || (kgDegeri > 0 ? String(kgDegeri) : "");
    const tutar = adetDegeri * sayiDegeri(uretimForm[fiyatField]);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 42px 42px 52px 58px", gap: "4px", alignItems: "center" }}>
        <span style={{ fontSize: "10px", fontWeight: "bold", color: "#7c3aed", lineHeight: 1.15 }}>{etiket}</span>
        <input
          placeholder="Adet"
          type="number"
          value={String(uretimForm[adetField] ?? "")}
          onChange={(e) => setUretimForm({ ...uretimForm, [adetField]: e.target.value })}
          className="m-inp small-inp"
          style={{ textAlign: "right", borderColor: "#ddd6fe", minWidth: 0 }}
        />
        <input
          value={gorunenKg}
          placeholder="KG"
          type="number"
          step="0.01"
          onChange={(e) => setUretimForm({ ...uretimForm, [kgField]: e.target.value })}
          className="m-inp small-inp"
          style={{ textAlign: "right", background: "#f5f3ff", borderColor: "#ddd6fe", minWidth: 0 }}
        />
        <input
          placeholder="Fiyat"
          type="number"
          step="0.01"
          value={String(uretimForm[fiyatField] ?? "")}
          onChange={(e) => setUretimForm({ ...uretimForm, [fiyatField]: e.target.value })}
          className="m-inp small-inp"
          style={{ textAlign: "right", borderColor: "#ddd6fe", minWidth: 0 }}
        />
        <div style={{ textAlign: "right", fontWeight: "bold", fontSize: "10.5px", color: "#7c3aed", minWidth: 0 }}>
          {helpers.fSayi(tutar)} ₺
        </div>
      </div>
    );
  };

  const uretimToplamDetayiAc = (
    kayitlar: Uretim[],
    tip: UretimTipi,
    alan: "giren" | "cikan" | "maliyet",
    renk: string,
  ) => {
    if (alan === "giren") {
      const satirlar =
        tip === "sut_kaymagi"
          ? [
              { etiket: "Krema", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.krema), 0))} KG` },
              { etiket: "Süt", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cig_sut), 0))} KG` },
              { etiket: "Teremyağ", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.tereyag), 0))} KG` },
              { etiket: "Katkı", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.katki_kg), 0))} KG` },
              { etiket: "Şeker", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.diger_kg), 0))} KG` },
              { etiket: "Su", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.su), 0))} KG` },
              { etiket: "0,2 KG Boş Kase", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.paket_02_adet), 0))} Adet` },
              { etiket: "Toplam", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimGirenToplamKg(kayit), 0))} KG`, vurgu: true },
            ]
          : [
              { etiket: "Süt", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cig_sut), 0))} KG` },
              { etiket: "Süt Tozu", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.sut_tozu), 0))} KG` },
              { etiket: "Teremyağ", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.tereyag), 0))} KG` },
              { etiket: "Katkı", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.katki_kg), 0))} KG` },
              { etiket: "Toplam", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimGirenToplamKg(kayit), 0))} KG`, vurgu: true },
            ];
      setUretimMiniDetay({ baslik: "Giren Detayı", renk, satirlar });
      return;
    }

    if (alan === "cikan") {
      const satirlar =
        tip === "sut_kaymagi"
          ? [
              { etiket: "0,2 KG", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cikti_02kg), 0))} Adet / ${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + (sayiDegeri(kayit.cikti_02kg_kg) || adettenKg(kayit.cikti_02kg, 0.2)), 0))} KG` },
              { etiket: "2 KG", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cikti_2kg), 0))} Adet / ${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + (sayiDegeri(kayit.cikti_2kg_kg) || adettenKg(kayit.cikti_2kg, 2)), 0))} KG` },
              { etiket: "3 KG", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cikti_3kg), 0))} Adet / ${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + (sayiDegeri(kayit.cikti_3kg_kg) || adettenKg(kayit.cikti_3kg, 3)), 0))} KG` },
              { etiket: "Toplam", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamAdet(kayit), 0))} Adet / ${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamKg(kayit), 0))} KG`, vurgu: true },
            ]
          : [
              { etiket: "3 KG", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cikti_3kg), 0))} Adet / ${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + (sayiDegeri(kayit.cikti_3kg_kg) || adettenKg(kayit.cikti_3kg, 3)), 0))} KG` },
              { etiket: "5 KG", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.cikti_5kg), 0))} Adet / ${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + (sayiDegeri(kayit.cikti_5kg_kg) || adettenKg(kayit.cikti_5kg, 5)), 0))} KG` },
              { etiket: "Toplam", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamAdet(kayit), 0))} Adet / ${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamKg(kayit), 0))} KG`, vurgu: true },
            ];
      setUretimMiniDetay({ baslik: "Çıkan Detayı", renk, satirlar });
      return;
    }

    const satirlar =
      tip === "sut_kaymagi"
        ? [
            { etiket: "Krema", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.krema, kayit.krema_fiyat), 0))} ₺` },
            { etiket: "Süt", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.cig_sut, kayit.sut_fiyat), 0))} ₺` },
            { etiket: "Teremyağ", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.tereyag, kayit.tereyag_fiyat), 0))} ₺` },
            { etiket: "Katkı", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.katki_kg, kayit.katki_fiyat), 0))} ₺` },
            { etiket: "Şeker", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + miktarSatirTutari(kayit.diger_kg, kayit.diger_adet, kayit.diger_fiyat), 0))} ₺` },
            { etiket: "Su", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.su, kayit.su_fiyat), 0))} ₺` },
            { etiket: "0,2 KG Boş Kase", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.paket_02_adet) * sayiDegeri(kayit.paket_02_fiyat), 0))} ₺` },
            { etiket: "Toplam", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.toplam_maliyet), 0))} ₺`, vurgu: true },
          ]
        : [
            { etiket: "Süt", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.cig_sut, kayit.sut_fiyat), 0))} ₺` },
            { etiket: "Süt Tozu", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.sut_tozu, kayit.sut_tozu_fiyat), 0))} ₺` },
            { etiket: "Teremyağ", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.tereyag, kayit.tereyag_fiyat), 0))} ₺` },
            { etiket: "Katkı", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + kgSatirTutari(kayit.katki_kg, kayit.katki_fiyat), 0))} ₺` },
            { etiket: "Toplam", deger: `${helpers.fSayi(kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.toplam_maliyet), 0))} ₺`, vurgu: true },
          ];
    setUretimMiniDetay({ baslik: "Maliyet Detayı", renk, satirlar });
  };

  const renderUretimToplamlari = (kayitlar: Uretim[], renk: string, tip: UretimTipi) => {
    const toplamGiren = kayitlar.reduce((toplam, kayit) => toplam + uretimGirenToplamKg(kayit), 0);
    const toplamCikan = kayitlar.reduce((toplam, kayit) => toplam + uretimCikanToplamKg(kayit), 0);
    const toplamMaliyet = kayitlar.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.toplam_maliyet), 0);

    return (
      <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "nowrap" }}>
        <button type="button" onClick={() => uretimToplamDetayiAc(kayitlar, tip, "giren", renk)} style={{ flex: 1, border: `1px solid ${renk}33`, background: `${renk}10`, color: renk, borderRadius: "999px", padding: "5px 8px", textAlign: "center", fontSize: "10px", fontWeight: "bold", whiteSpace: "nowrap", minWidth: 0, cursor: "pointer" }}>
          GİREN {helpers.fSayi(toplamGiren)} KG
        </button>
        <button type="button" onClick={() => uretimToplamDetayiAc(kayitlar, tip, "cikan", renk)} style={{ flex: 1, border: "1px solid #2563eb33", background: "#2563eb10", color: "#2563eb", borderRadius: "999px", padding: "5px 8px", textAlign: "center", fontSize: "10px", fontWeight: "bold", whiteSpace: "nowrap", minWidth: 0, cursor: "pointer" }}>
          ÇIKAN {helpers.fSayi(toplamCikan)} KG
        </button>
        <button type="button" onClick={() => uretimToplamDetayiAc(kayitlar, tip, "maliyet", renk)} style={{ flex: 1, border: "1px solid #dc262633", background: "#dc262610", color: "#dc2626", borderRadius: "999px", padding: "5px 8px", textAlign: "center", fontSize: "10px", fontWeight: "bold", whiteSpace: "nowrap", minWidth: 0, cursor: "pointer" }}>
          MALİYET {helpers.fSayi(toplamMaliyet)} ₺
        </button>
      </div>
    );
  };

  const renderUretimTablosu = (
    baslik: string,
    kayitlar: Uretim[],
    renk: string,
    butonMetni: string,
    onYeniClick: () => void,
    tip: UretimTipi,
  ) => {
    const ilkPaketBaslik = tip === "sut_kaymagi" ? "2KG" : "3L";
    const ikinciPaketBaslik = tip === "sut_kaymagi" ? "3KG" : "5L";

    return (
      <div style={{ marginTop: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "8px", flexWrap: "nowrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ margin: 0, color: renk, fontSize: "14px" }}>{baslik}</h3>
          </div>
          {uretimAksiyonYetkiliMi && (
            <button onClick={onYeniClick} className="btn-anim m-btn inline-mobile-btn" style={{ background: renk, margin: 0, minWidth: "118px", width: "auto", padding: "8px 8px", fontSize: "10px", whiteSpace: "nowrap", flex: "0 0 auto" }}>
              {butonMetni}
            </button>
          )}
        </div>
        {renderUretimToplamlari(kayitlar, renk, tip)}

        <div className="table-wrapper">
          <table className="tbl tbl-uretim" style={{ borderTop: `3px solid ${renk}`, tableLayout: "fixed", fontSize: "11px" }}>
            <thead>
              <tr>
                <UretimTh label="TAR" sortKey="tarih" currentSort={uretimSort} setSort={setUretimSort} />
                <th style={{ textAlign: "right", width: "13%" }}>GİR</th>
                <th style={{ textAlign: "right", width: "12%" }}>ÇIK</th>
                <th style={{ textAlign: "right", width: "10%" }}>{ilkPaketBaslik}</th>
                <th style={{ textAlign: "right", width: "10%" }}>{ikinciPaketBaslik}</th>
                <th style={{ textAlign: "right", width: "16%" }}>MALİYET</th>
                <UretimTh label="KAR" sortKey="kar" currentSort={uretimSort} setSort={setUretimSort} align="right" />
                <UretimTh label="NOT" sortKey="aciklama" currentSort={uretimSort} setSort={setUretimSort} />
                <th style={{ width: "5%" }} />
              </tr>
            </thead>
            <tbody>
              {kayitlar.length > 0 ? (
                kayitlar.map((kayit) => {
                  const ilkPaketAdet = tip === "sut_kaymagi" ? sayiDegeri(kayit.cikti_2kg) : sayiDegeri(kayit.cikti_3kg);
                  const ikinciPaketAdet = tip === "sut_kaymagi" ? sayiDegeri(kayit.cikti_3kg) : sayiDegeri(kayit.cikti_5kg);
                  const cikanKg = uretimCikanToplamKg(kayit);
                  const silinebilir = uretimAksiyonYetkiliMi;
                  const duzenlenebilir = uretimAksiyonYetkiliMi;

                  return (
                    <tr key={kayit.id}>
                      <td>{kayit.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
                      <td style={{ textAlign: "right", fontWeight: "bold", color: "#1d4ed8" }}>{tabloTamSayi(uretimGirenToplamKg(kayit))}</td>
                      <td style={{ textAlign: "right", color: renk, fontWeight: "bold" }}>{tabloTamSayi(cikanKg)}</td>
                      <td style={{ textAlign: "right", color: renk, fontWeight: "bold" }}>{tabloTamSayi(ilkPaketAdet)}</td>
                      <td style={{ textAlign: "right", color: renk, fontWeight: "bold" }}>{tabloTamSayi(ikinciPaketAdet)}</td>
                      <td style={{ textAlign: "right", color: "#dc2626" }}>{tabloTamSayi(kayit.toplam_maliyet)}</td>
                      <td style={{ textAlign: "right", color: "#059669", fontWeight: "bold" }}>{tabloTamSayi(kayit.kar)}</td>
                      <td className="truncate-text-td" style={{ maxWidth: "68px" }} title={kayit.aciklama || "-"}>
                        {uretimNotunuKisalt(kayit.aciklama, 8)}
                      </td>
                      <td className="actions-cell" style={{ position: "relative" }}>
                        {uretimAksiyonYetkiliMi && (
                          <button onClick={(e) => { e.stopPropagation(); setOpenDropdownId(String(kayit.id)); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", padding: "0 8px", color: "#64748b" }}>⋮</button>
                        )}
                        {uretimAksiyonYetkiliMi && openDropdownId === String(kayit.id) && (
                          <div className="dropdown-menu">
                            <button title="Görüntüle" className="dropdown-item-icon" onClick={() => { setOpenDropdownId(null); setUretimDetayData(kayit); }}>🔍</button>
                            {duzenlenebilir && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdownId(null); setEditingUretimId(String(kayit.id)); setUretimForm(uretimKaydiniNormalizeEt(kayit)); setIsUretimModalOpen(true); }}>✏️</button>}
                            {silinebilir && <button title="Sil" className="dropdown-item-icon" style={{ color: "#dc2626" }} onClick={async () => { setOpenDropdownId(null); await handleUretimSil(kayit); }}>🗑️</button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "18px 10px", color: "#94a3b8", fontWeight: "bold" }}>
                    Bu tabloda henüz kayıt yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const handleExcelIndir = async () => {
    setIsExcelLoading(true);
    try {
      const { excelDosyasiIndir } = await import("../lib/excelExport");
      excelDosyasiIndir(`sultankoy-uretim-${aktifDonem}.xlsx`, [
        {
          name: "Ozet",
          rows: [
            {
              Donem: aktifDonem,
              "Yogurt Kayit": yogurtUretimListesi.length,
              "Yogurt Maliyet": yogurtUretimListesi.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.toplam_maliyet), 0),
              "Yogurt Kar": yogurtUretimListesi.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.kar), 0),
              "Kaymak Kayit": sutKaymagiUretimListesi.length,
              "Kaymak Maliyet": sutKaymagiUretimListesi.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.toplam_maliyet), 0),
              "Kaymak Kar": sutKaymagiUretimListesi.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.kar), 0),
            },
          ],
        },
        {
          name: "Yogurt",
          rows: yogurtUretimListesi.map((kayit) => ({
            Tarih: kayit.tarih,
            "Giren KG": uretimGirenToplamKg(kayit),
            "Cikan KG": uretimCikanToplamKg(kayit),
            "3 Luk": sayiDegeri(kayit.cikti_3kg),
            "5 Lik": sayiDegeri(kayit.cikti_5kg),
            Maliyet: sayiDegeri(kayit.toplam_maliyet),
            Kar: sayiDegeri(kayit.kar),
            Aciklama: kayit.aciklama || "",
            Kisi: normalizeUsername(kayit.ekleyen),
          })),
        },
        {
          name: "Sut Kaymagi",
          rows: sutKaymagiUretimListesi.map((kayit) => ({
            Tarih: kayit.tarih,
            "Giren KG": uretimGirenToplamKg(kayit),
            "Cikan KG": uretimCikanToplamKg(kayit),
            "2 KG": sayiDegeri(kayit.cikti_2kg),
            "3 KG": sayiDegeri(kayit.cikti_3kg),
            Maliyet: sayiDegeri(kayit.toplam_maliyet),
            Kar: sayiDegeri(kayit.kar),
            Aciklama: kayit.aciklama || "",
            Kisi: normalizeUsername(kayit.ekleyen),
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
          <button onClick={() => void handleExcelIndir()} disabled={isExcelLoading} className="btn-anim m-btn" style={{ margin: 0, minWidth: "118px", width: "auto", fontSize: "12px", background: "#0f766e", opacity: isExcelLoading ? 0.75 : 1, cursor: isExcelLoading ? "wait" : "pointer" }}>
            {isExcelLoading ? "Hazırlanıyor..." : "📥 EXCEL"}
          </button>
        </div>
        {renderUretimTablosu("Yoğurt Üretimleri", yogurtUretimListesi, "#8b5cf6", "➕ YENİ YOĞURT ÜRETİMİ", () => yeniUretimFormunuAc("yogurt"), "yogurt")}
        {renderUretimTablosu("Süt Kaymağı Üretimleri", sutKaymagiUretimListesi, "#0f766e", "➕ YENİ SÜT KAYMAĞI ÜRETİMİ", () => yeniUretimFormunuAc("sut_kaymagi"), "sut_kaymagi")}
      </div>
      {isUretimModalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "10px" }}>
          <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "460px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", maxHeight: "95vh" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", background: editingUretimId ? "#f3e8ff" : "#f8fafc", borderRadius: "12px 12px 0 0" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{ margin: 0, color: aktifUretimTipi === "sut_kaymagi" ? "#0f766e" : "#8b5cf6", fontSize: "13px", lineHeight: 1.15 }}>
                  {editingUretimId ? "✏️ Üretim Düzenle" : aktifUretimTipi === "sut_kaymagi" ? "🥛 Yeni Süt Kaymağı Üretimi" : "🏭 Yeni Yoğurt Üretimi"}
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                <input type="date" value={uretimForm.tarih} onChange={(e) => setUretimForm({ ...uretimForm, tarih: e.target.value })} className="m-inp small-inp date-click" style={{ width: "106px", minWidth: "106px", fontWeight: "bold", padding: "5px 6px" }} />
                <button onClick={() => setIsUretimModalOpen(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#94a3b8", padding: 0, lineHeight: 1, marginRight: "2px" }}>✕</button>
              </div>
            </div>
            <div style={{ padding: "8px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <DonemDisiTarihUyarisi tarih={uretimForm.tarih} aktifDonem={aktifDonem} />
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "6px", background: "#f8fafc", display: "grid", gap: "4px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 52px 52px 58px", gap: "4px", fontSize: "8px", color: "#94a3b8", fontWeight: "bold" }}>
                  <span>GİREN HAMMADDE</span>
                  <span style={{ textAlign: "right" }}>KG</span>
                  <span style={{ textAlign: "right" }}>FYT</span>
                  <span style={{ textAlign: "right" }}>TUT.</span>
                </div>
                {aktifUretimTipi === "sut_kaymagi" ? (
                  <>
                    {renderKgSatiri("Krema", "krema", "krema_fiyat", "#0f766e")}
                    {renderKgSatiri("Süt", "cig_sut", "sut_fiyat", "#0f766e")}
                    {renderKgSatiri("Teremyağ", "tereyag", "tereyag_fiyat", "#0f766e")}
                    {renderKgSatiri("Katkı", "katki_kg", "katki_fiyat", "#0f766e")}
                    {renderKgSatiri("Şeker", "diger_kg", "diger_fiyat", "#0f766e")}
                    {renderKgSatiri("Su", "su", "su_fiyat", "#0f766e")}
                    {renderAdetFiyatSatiri("0,2 KG Boş Kase", "paket_02_adet", "paket_02_fiyat", "#0f766e", "cikti_02kg", "cikti_02kg_kg", 0.2)}
                    {renderAdetFiyatSatiri("2 KG Boş Paket", "paket_2_adet", "paket_2_fiyat", "#0f766e", "cikti_2kg", "cikti_2kg_kg", 2)}
                    {renderAdetFiyatSatiri("3 KG Boş Paket", "paket_3_adet", "paket_3_fiyat", "#0f766e", "cikti_3kg", "cikti_3kg_kg", 3)}
                  </>
                ) : (
                  <>
                    {renderKgSatiri("Süt", "cig_sut", "sut_fiyat")}
                    {renderKgSatiri("Süt Tozu", "sut_tozu", "sut_tozu_fiyat")}
                    {renderKgSatiri("Teremyağ", "tereyag", "tereyag_fiyat")}
                    {renderKgSatiri("Katkı", "katki_kg", "katki_fiyat")}
                    {renderKgSatiri("Su", "su", "su_fiyat")}
                    {renderAdetFiyatSatiri("3'lük Boş Kova", "kova_3_adet", "kova_3_fiyat", "#475569", "cikti_3kg", "cikti_3kg_kg", 3)}
                    {renderAdetFiyatSatiri("5'lik Boş Kova", "kova_5_adet", "kova_5_fiyat", "#475569", "cikti_5kg", "cikti_5kg_kg", 5)}
                  </>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 52px 52px 58px", gap: "4px", alignItems: "end", borderTop: "1px dashed #cbd5e1", paddingTop: "6px" }}>
                  <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "bold" }}>TOPLAM</span>
                  <span style={{ textAlign: "right", fontSize: "10px", fontWeight: "bold", color: "#1d4ed8", lineHeight: 1.1 }}>{helpers.fSayi(aktifUretimGirenKg)}</span>
                  <span />
                  <span style={{ textAlign: "right", fontSize: "10px", fontWeight: "bold", color: "#dc2626", lineHeight: 1.1 }}>{helpers.fSayi(aktifUretimMaliyet)}</span>
                </div>
              </div>
              <div style={{ border: "1px solid #c4b5fd", borderRadius: "8px", padding: "6px", background: "#f5f3ff", display: "grid", gap: "4px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 42px 42px 52px 58px", gap: "4px", fontSize: "8px", color: "#8b5cf6", fontWeight: "bold" }}>
                  <span>ÇIKAN ÜRÜN</span>
                  <span style={{ textAlign: "right" }}>ADET</span>
                  <span style={{ textAlign: "right" }}>KG</span>
                  <span style={{ textAlign: "right" }}>FYT</span>
                  <span style={{ textAlign: "right" }}>TUT.</span>
                </div>
                {aktifUretimTipi === "sut_kaymagi" ? (
                  <>
                    {renderPaketCiktiSatiri("0,2 KG Süt Kaymağı", "cikti_02kg", "cikti_02kg_kg", "satis_02_fiyat", 0.2)}
                    {renderPaketCiktiSatiri("2 KG Kaymak", "cikti_2kg", "cikti_2kg_kg", "satis_2_fiyat", 2)}
                    {renderPaketCiktiSatiri("3 KG Kaymak", "cikti_3kg", "cikti_3kg_kg", "satis_3_fiyat", 3)}
                  </>
                ) : (
                  <>
                    {renderPaketCiktiSatiri("3 KG Yoğurt", "cikti_3kg", "cikti_3kg_kg", "satis_3_fiyat", 3)}
                    {renderPaketCiktiSatiri("5 KG Yoğurt", "cikti_5kg", "cikti_5kg_kg", "satis_5_fiyat", 5)}
                  </>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(70px,1fr) 42px 42px 52px 58px", gap: "4px", alignItems: "end", borderTop: "1px dashed #cbd5e1", paddingTop: "6px" }}>
                  <span style={{ fontSize: "9px", color: "#7c3aed", fontWeight: "bold" }}>TOPLAM</span>
                  <span />
                  <span style={{ textAlign: "right", fontSize: "10px", fontWeight: "bold", color: "#2563eb", lineHeight: 1.1 }}>{helpers.fSayi(aktifUretimCikanKg)}</span>
                  <span />
                  <span style={{ textAlign: "right", fontSize: "10px", fontWeight: "bold", color: "#2563eb", lineHeight: 1.1 }}>{helpers.fSayi(aktifUretimSatisToplami)}</span>
                </div>
              </div>
              <div><input placeholder="Açıklama / Not..." value={uretimForm.aciklama} onChange={(e) => setUretimForm({ ...uretimForm, aciklama: e.target.value })} className="m-inp small-inp" style={{ width: "100%" }} /></div>
            </div>
            <div style={{ padding: "6px 8px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
                <div style={{ flex: "1 1 120px", minWidth: "108px", borderRadius: "999px", background: aktifUretimKar >= 0 ? "#ecfdf5" : "#fef2f2", border: `1px solid ${aktifUretimKar >= 0 ? "#86efac" : "#fecaca"}`, padding: "5px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: "8px", fontWeight: "bold", color: "#64748b", lineHeight: 1.1 }}>TAHMİNİ KAR</div>
                  <div style={{ fontSize: "11px", fontWeight: "bold", marginTop: "2px", color: aktifUretimKar >= 0 ? "#059669" : "#dc2626", lineHeight: 1.1 }}>{helpers.fSayi(aktifUretimKar)} ₺</div>
                </div>
              </div>
              <button onClick={() => void handleUretimKaydet()} className="p-btn btn-anim" style={{ background: aktifUretimTipi === "sut_kaymagi" ? "#0f766e" : "#8b5cf6", width: "100%", height: "40px", fontSize: "14px" }}>{editingUretimId ? "GÜNCELLE" : "KAYDET"}</button>
            </div>
          </div>
        </div>
      )}
      {uretimDetayData && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: "10px" }}>
          <div style={{ backgroundColor: "#f8fafc", borderRadius: "10px", width: "95vw", maxWidth: "380px", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "15px", textAlign: "center", borderBottom: "1px dashed #cbd5e1", background: "#fff", overflowY: "auto" }}>
              <h3 style={{ margin: "0 0 5px", color: (uretimDetayData.uretim_tipi || "yogurt") === "sut_kaymagi" ? "#0f766e" : "#8b5cf6", fontSize: "16px" }}>
                {(uretimDetayData.uretim_tipi || "yogurt") === "sut_kaymagi" ? "🥛 Süt Kaymağı Detayı" : "🏭 Yoğurt Üretim Detayı"}
              </h3>
              <div style={{ fontSize: "12px", color: "#64748b" }}>Tarih: {uretimDetayData.tarih.split("-").reverse().join(".")}</div>
              <div style={{ textAlign: "left", marginTop: "15px" }}>
                <h4 style={{ fontSize: "12px", margin: "0 0 5px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Giren Hammaddeler</h4>
                {(uretimDetayData.uretim_tipi || "yogurt") === "sut_kaymagi" ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Krema ({helpers.fSayi(uretimDetayData.krema)} kg x {helpers.fSayi(uretimDetayData.krema_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.krema, uretimDetayData.krema_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Süt ({helpers.fSayi(uretimDetayData.cig_sut)} kg x {helpers.fSayi(uretimDetayData.sut_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.cig_sut, uretimDetayData.sut_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Teremyağ ({helpers.fSayi(uretimDetayData.tereyag)} kg x {helpers.fSayi(uretimDetayData.tereyag_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.tereyag, uretimDetayData.tereyag_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Katkı ({helpers.fSayi(uretimDetayData.katki_kg)} kg x {helpers.fSayi(uretimDetayData.katki_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.katki_kg, uretimDetayData.katki_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Şeker ({helpers.fSayi(uretimDetayData.diger_kg)} kg x {helpers.fSayi(uretimDetayData.diger_fiyat)})</span><b>{helpers.fSayi(miktarSatirTutari(uretimDetayData.diger_kg, uretimDetayData.diger_adet, uretimDetayData.diger_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Su ({helpers.fSayi(uretimDetayData.su)} kg x {helpers.fSayi(uretimDetayData.su_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.su, uretimDetayData.su_fiyat))} ₺</b></div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Süt ({helpers.fSayi(uretimDetayData.cig_sut)} kg x {helpers.fSayi(uretimDetayData.sut_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.cig_sut, uretimDetayData.sut_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Süt Tozu ({helpers.fSayi(uretimDetayData.sut_tozu)} kg x {helpers.fSayi(uretimDetayData.sut_tozu_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.sut_tozu, uretimDetayData.sut_tozu_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Teremyağ ({helpers.fSayi(uretimDetayData.tereyag)} kg x {helpers.fSayi(uretimDetayData.tereyag_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.tereyag, uretimDetayData.tereyag_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Katkı ({helpers.fSayi(uretimDetayData.katki_kg)} kg x {helpers.fSayi(uretimDetayData.katki_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.katki_kg, uretimDetayData.katki_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>Su ({helpers.fSayi(uretimDetayData.su)} kg x {helpers.fSayi(uretimDetayData.su_fiyat)})</span><b>{helpers.fSayi(kgSatirTutari(uretimDetayData.su, uretimDetayData.su_fiyat))} ₺</b></div>
                  </>
                )}
              </div>
              <div style={{ textAlign: "left", marginTop: "15px" }}>
                <h4 style={{ fontSize: "12px", margin: "0 0 5px", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Çıkan Ürünler</h4>
                {(uretimDetayData.uretim_tipi || "yogurt") === "sut_kaymagi" ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>0,2 KG Süt Kaymağı ({helpers.fSayi(uretimDetayData.cikti_02kg)} adet / {helpers.fSayi(sayiDegeri(uretimDetayData.cikti_02kg_kg) || adettenKg(uretimDetayData.cikti_02kg, 0.2))} kg)</span><b>{helpers.fSayi(sayiDegeri(uretimDetayData.cikti_02kg) * sayiDegeri(uretimDetayData.satis_02_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>2 KG Kaymak ({helpers.fSayi(uretimDetayData.cikti_2kg)} adet / {helpers.fSayi(sayiDegeri(uretimDetayData.cikti_2kg_kg) || adettenKg(uretimDetayData.cikti_2kg, 2))} kg)</span><b>{helpers.fSayi(sayiDegeri(uretimDetayData.cikti_2kg) * sayiDegeri(uretimDetayData.satis_2_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>3 KG Kaymak ({helpers.fSayi(uretimDetayData.cikti_3kg)} adet / {helpers.fSayi(sayiDegeri(uretimDetayData.cikti_3kg_kg) || adettenKg(uretimDetayData.cikti_3kg, 3))} kg)</span><b>{helpers.fSayi(sayiDegeri(uretimDetayData.cikti_3kg) * sayiDegeri(uretimDetayData.satis_3_fiyat))} ₺</b></div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>3 KG Yoğurt ({helpers.fSayi(uretimDetayData.cikti_3kg)} adet / {helpers.fSayi(sayiDegeri(uretimDetayData.cikti_3kg_kg) || adettenKg(uretimDetayData.cikti_3kg, 3))} kg)</span><b>{helpers.fSayi(sayiDegeri(uretimDetayData.cikti_3kg) * sayiDegeri(uretimDetayData.satis_3_fiyat))} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "3px 0" }}><span>5 KG Yoğurt ({helpers.fSayi(uretimDetayData.cikti_5kg)} adet / {helpers.fSayi(sayiDegeri(uretimDetayData.cikti_5kg_kg) || adettenKg(uretimDetayData.cikti_5kg, 5))} kg)</span><b>{helpers.fSayi(sayiDegeri(uretimDetayData.cikti_5kg) * sayiDegeri(uretimDetayData.satis_5_fiyat))} ₺</b></div>
                  </>
                )}
              </div>
              <div style={{ textAlign: "left", marginTop: "15px", borderTop: "2px solid #e2e8f0", paddingTop: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0" }}><span>Giren Toplam KG:</span><b>{helpers.fSayi(uretimGirenToplamKg(uretimDetayData))} KG</b></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0" }}><span>Çıkan Toplam KG:</span><b>{helpers.fSayi(uretimCikanToplamKg(uretimDetayData))} KG</b></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", padding: "3px 0", color: "#dc2626" }}><span>Toplam Maliyet:</span><b>{helpers.fSayi(uretimDetayData.toplam_maliyet)} ₺</b></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", padding: "3px 0", color: "#059669", fontWeight: "bold" }}><span>Tahmini Kar:</span><b>{helpers.fSayi(uretimDetayData.kar)} ₺</b></div>
              </div>
            </div>
            <div style={{ padding: "10px" }}><button onClick={() => setUretimDetayData(null)} style={{ width: "100%", padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", color: "#475569", cursor: "pointer" }}>KAPAT</button></div>
          </div>
        </div>
      )}
      {uretimMiniDetay && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1320, padding: "14px" }} onClick={() => setUretimMiniDetay(null)}>
          <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "320px", padding: "14px", boxShadow: "0 20px 45px rgba(15, 23, 42, 0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h4 style={{ margin: 0, color: uretimMiniDetay.renk, fontSize: "14px" }}>{uretimMiniDetay.baslik}</h4>
              <button onClick={() => setUretimMiniDetay(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "18px", padding: 0 }}>✕</button>
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              {uretimMiniDetay.satirlar.map((satir) => (
                <div key={`${uretimMiniDetay.baslik}-${satir.etiket}`} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: satir.vurgu ? "12px" : "11px", fontWeight: satir.vurgu ? "bold" : "normal", color: satir.vurgu ? uretimMiniDetay.renk : "#334155", paddingTop: satir.vurgu ? "6px" : 0, borderTop: satir.vurgu ? "1px dashed #cbd5e1" : "none" }}>
                  <span>{satir.etiket}</span>
                  <span>{satir.deger}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
