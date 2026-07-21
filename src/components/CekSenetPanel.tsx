import { useCallback, useEffect, useRef, useState } from "react";
import { DonemDisiTarihUyarisi } from "./DonemDisiTarihUyarisi";
import type { AppConfirmOptions, CekSenetDurum, CekSenetKaydi, CekSenetTur } from "../types/app";
import { aktifDonemDisiKayitOnayMetni, getLocalDateString } from "../utils/date";
import { fSayi, kullanicilarAyniMi, normalizeUsername } from "../utils/format";
import { supabase } from "../lib/supabase";

type CekSenetPanelProps = {
  aktifKullaniciKisa: string;
  aktifDonem: string;
  onConfirm: (options: AppConfirmOptions) => Promise<boolean>;
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
const CEK_SENET_TABLOSU = "cek_senet_kayitlari";
const GORSEL_BUCKET = "fis_gorselleri";

type CekSenetDbSatiri = {
  id: string;
  tur: CekSenetTur;
  tarih: string;
  duzenleyen: string;
  tah_tarihi: string;
  miktar: number | string;
  banka: string;
  durum: CekSenetDurum;
  tahsil_edilme_tarihi?: string | null;
  on_yuz_foto?: string | null;
  arka_yuz_foto?: string | null;
  ekleyen: string;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const TUR_SECENEKLERI: Array<{ deger: CekSenetTur; etiket: string; renk: string; arkaPlan: string }> = [
  { deger: "verilen_cek", etiket: "Verilen Çek", renk: "#b45309", arkaPlan: "#fff7ed" },
  { deger: "alinan_cek", etiket: "Alınan Çek", renk: "#0369a1", arkaPlan: "#f0f9ff" },
  { deger: "verilen_senet", etiket: "Verilen Senet", renk: "#7c3aed", arkaPlan: "#f5f3ff" },
  { deger: "alinan_senet", etiket: "Alınan Senet", renk: "#0f766e", arkaPlan: "#ecfdf5" },
];

const DURUM_SECENEKLERI: Array<{ deger: CekSenetDurum; etiket: string; ikon: string; renk: string; arkaPlan: string }> = [
  { deger: "bekliyor", etiket: "Bekliyor", ikon: "🕒", renk: "#b45309", arkaPlan: "#fff7ed" },
  { deger: "tahsil_edildi", etiket: "Tahsil Edildi", ikon: "✅", renk: "#0f766e", arkaPlan: "#ecfdf5" },
  { deger: "iade", etiket: "İade", ikon: "↩️", renk: "#0369a1", arkaPlan: "#eff6ff" },
  { deger: "iptal", etiket: "İptal", ikon: "⛔", renk: "#6b7280", arkaPlan: "#f3f4f6" },
  { deger: "karsiliksiz", etiket: "Karşılıksız", ikon: "⚠️", renk: "#dc2626", arkaPlan: "#fef2f2" },
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

const durumBilgisiGetir = (durum: CekSenetDurum) =>
  DURUM_SECENEKLERI.find((item) => item.deger === durum) || DURUM_SECENEKLERI[0];

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
      durum: DURUM_SECENEKLERI.some((secenek) => secenek.deger === item?.durum) ? item.durum : "bekliyor",
      tahsilEdilmeTarihi: String(item?.tahsilEdilmeTarihi || ""),
      onYuzFoto: typeof item?.onYuzFoto === "string" ? item.onYuzFoto : "",
      arkaYuzFoto: typeof item?.arkaYuzFoto === "string" ? item.arkaYuzFoto : "",
      ekleyen: String(item?.ekleyen || ""),
      createdAt: String(item?.createdAt || ""),
    }));
  } catch {
    return [];
  }
};

const localStorageTemizle = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
};

const hataMesajiniGetir = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Bilinmeyen hata";

const dbSatiriniCevir = (satir: CekSenetDbSatiri): CekSenetKaydi => ({
  id: String(satir.id || ""),
  tur: satir.tur,
  tarih: String(satir.tarih || ""),
  duzenleyen: String(satir.duzenleyen || ""),
  tahTarihi: String(satir.tah_tarihi || ""),
  miktar: sayiDegeri(satir.miktar),
  banka: String(satir.banka || ""),
  durum: satir.durum || "bekliyor",
  tahsilEdilmeTarihi: String(satir.tahsil_edilme_tarihi || ""),
  onYuzFoto: String(satir.on_yuz_foto || ""),
  arkaYuzFoto: String(satir.arka_yuz_foto || ""),
  ekleyen: String(satir.ekleyen || ""),
  createdBy: satir.created_by || null,
  createdAt: String(satir.created_at || ""),
  updatedAt: String(satir.updated_at || ""),
});

const kaydiDbPayloadinaCevir = (kayit: CekSenetKaydi) => ({
  id: kayit.id,
  tur: kayit.tur,
  tarih: kayit.tarih,
  duzenleyen: kayit.duzenleyen,
  tah_tarihi: kayit.tahTarihi,
  miktar: sayiDegeri(kayit.miktar),
  banka: kayit.banka,
  durum: kayit.durum,
  tahsil_edilme_tarihi: kayit.tahsilEdilmeTarihi || null,
  on_yuz_foto: kayit.onYuzFoto || null,
  arka_yuz_foto: kayit.arkaYuzFoto || null,
  ekleyen: kayit.ekleyen || "",
});

const dataUrlMi = (deger?: string | null) => String(deger || "").startsWith("data:");

const yeniKayitIdOlustur = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const dosyaDataUrlGetir = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Fotoğraf okunamadı."));
    reader.readAsDataURL(file);
  });

export function CekSenetPanel({ aktifKullaniciKisa, aktifDonem, onConfirm }: CekSenetPanelProps) {
  const [kayitlar, setKayitlar] = useState<CekSenetKaydi[]>([]);
  const [formAcik, setFormAcik] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CekSenetForm>(() => bosFormGetir(aktifDonem));
  const [detayKaydi, setDetayKaydi] = useState<CekSenetKaydi | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [gorselOnizleme, setGorselOnizleme] = useState<{ src: string; baslik: string } | null>(null);
  const [isExcelLoading, setIsExcelLoading] = useState(false);
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);
  const [kayitIslemiSuruyor, setKayitIslemiSuruyor] = useState(false);
  const [veriHatasi, setVeriHatasi] = useState("");
  const [tasimaMesaji, setTasimaMesaji] = useState("");
  const [gorselUrlMap, setGorselUrlMap] = useState<Record<string, string>>({});
  const onYuzInputRef = useRef<HTMLInputElement | null>(null);
  const arkaYuzInputRef = useRef<HTMLInputElement | null>(null);

  const gorselUrliniGetir = useCallback(
    (kaynak?: string | null) => {
      const temiz = String(kaynak || "");
      if (!temiz) return "";
      if (dataUrlMi(temiz) || temiz.startsWith("blob:") || /^https?:\/\//i.test(temiz)) return temiz;
      return gorselUrlMap[temiz] || "";
    },
    [gorselUrlMap],
  );

  const gorselUrlLeriniYukle = useCallback(async (kayitListesi: CekSenetKaydi[]) => {
    const yollar = Array.from(
      new Set(
        kayitListesi
          .flatMap((kayit) => [kayit.onYuzFoto, kayit.arkaYuzFoto])
          .map((deger) => String(deger || ""))
          .filter((deger) => deger && !dataUrlMi(deger) && !deger.startsWith("blob:") && !/^https?:\/\//i.test(deger)),
      ),
    );
    if (yollar.length === 0) return;

    const sonuc = await Promise.all(
      yollar.map(async (yol) => {
        const { data, error } = await supabase.storage.from(GORSEL_BUCKET).createSignedUrl(yol, 60 * 60 * 6);
        return [yol, error ? "" : data?.signedUrl || ""] as const;
      }),
    );
    setGorselUrlMap((onceki) => ({
      ...onceki,
      ...Object.fromEntries(sonuc.filter(([, url]) => Boolean(url))),
    }));
  }, []);

  const gorseliStorageaYukle = useCallback(
    async (kaynak: string, kayitId: string, taraf: "on" | "arka") => {
      if (!dataUrlMi(kaynak)) return kaynak;

      const response = await fetch(kaynak);
      if (!response.ok) throw new Error("Fotoğraf hazırlanamadı.");
      const blob = await response.blob();
      const uzanti = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      const kullanici = normalizeUsername(aktifKullaniciKisa) || "kullanici";
      const guvenliEk = Math.random().toString(36).slice(2, 9);
      const yol = `cek-senet/${kullanici}/${kayitId}/${taraf}-${Date.now()}-${guvenliEk}.${uzanti}`;
      const { error } = await supabase.storage.from(GORSEL_BUCKET).upload(yol, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw error;
      return yol;
    },
    [aktifKullaniciKisa],
  );

  const storageGorselleriniSil = useCallback(async (yollar: Array<string | null | undefined>) => {
    const silinecekler = Array.from(
      new Set(
        yollar
          .map((deger) => String(deger || ""))
          .filter((deger) => deger && !dataUrlMi(deger) && !deger.startsWith("blob:") && !/^https?:\/\//i.test(deger)),
      ),
    );
    if (silinecekler.length === 0) return;
    const { error } = await supabase.storage.from(GORSEL_BUCKET).remove(silinecekler);
    if (error) console.warn("Çek-senet görseli silinemedi:", error.message);
  }, []);

  const supabaseKayitlariniGetir = useCallback(async () => {
    const { data, error } = await supabase
      .from(CEK_SENET_TABLOSU)
      .select("*")
      .order("tarih", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data || []) as CekSenetDbSatiri[]).map(dbSatiriniCevir);
  }, []);

  useEffect(() => {
    let aktif = true;

    const yukleVeYerelKayitlariTasi = async () => {
      setVeriYukleniyor(true);
      setVeriHatasi("");
      setTasimaMesaji("");
      const yerelKayitlar = localStorageOku();

      try {
        let uzakKayitlar = await supabaseKayitlariniGetir();
        const uzakIdler = new Set(uzakKayitlar.map((kayit) => kayit.id));
        let tasinanKayitSayisi = 0;

        for (const yerelKayit of yerelKayitlar) {
          const kayitId = yerelKayit.id || yeniKayitIdOlustur();
          if (uzakIdler.has(kayitId)) continue;

          const yuklenenYollar: string[] = [];
          try {
            const onYuzFoto = await gorseliStorageaYukle(yerelKayit.onYuzFoto || "", kayitId, "on");
            if (onYuzFoto && onYuzFoto !== yerelKayit.onYuzFoto) yuklenenYollar.push(onYuzFoto);
            const arkaYuzFoto = await gorseliStorageaYukle(yerelKayit.arkaYuzFoto || "", kayitId, "arka");
            if (arkaYuzFoto && arkaYuzFoto !== yerelKayit.arkaYuzFoto) yuklenenYollar.push(arkaYuzFoto);

            const tasinacakKayit: CekSenetKaydi = {
              ...yerelKayit,
              id: kayitId,
              onYuzFoto,
              arkaYuzFoto,
              ekleyen: yerelKayit.ekleyen || aktifKullaniciKisa,
            };
            const { error } = await supabase.from(CEK_SENET_TABLOSU).insert(kaydiDbPayloadinaCevir(tasinacakKayit));
            if (error) throw error;
            uzakIdler.add(kayitId);
            tasinanKayitSayisi += 1;
          } catch (error) {
            await storageGorselleriniSil(yuklenenYollar);
            throw error;
          }
        }

        if (yerelKayitlar.length > 0) {
          uzakKayitlar = await supabaseKayitlariniGetir();
          localStorageTemizle();
          if (tasinanKayitSayisi > 0) {
            setTasimaMesaji(`${tasinanKayitSayisi} yerel çek-senet kaydı Supabase'e taşındı.`);
          }
        }

        if (!aktif) return;
        setKayitlar(uzakKayitlar);
        await gorselUrlLeriniYukle(uzakKayitlar);
      } catch (error: unknown) {
        if (!aktif) return;
        setKayitlar(yerelKayitlar);
        setVeriHatasi(`Çek-senet kayıtları Supabase'den yüklenemedi: ${hataMesajiniGetir(error)}`);
      } finally {
        if (aktif) setVeriYukleniyor(false);
      }
    };

    void yukleVeYerelKayitlariTasi();
    return () => {
      aktif = false;
    };
  }, [aktifKullaniciKisa, gorselUrlLeriniYukle, gorseliStorageaYukle, storageGorselleriniSil, supabaseKayitlariniGetir]);

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
    (kayit?: Partial<CekSenetKaydi> | null) => kullanicilarAyniMi(kayit?.ekleyen, aktifKullaniciKisa),
    [aktifKullaniciKisa],
  );

  const donemKayitlari = [...kayitlar]
    .filter((kayit) => String(kayit.tarih || "").startsWith(aktifDonem))
    .sort((a, b) => `${b.tarih}${b.createdAt || ""}`.localeCompare(`${a.tarih}${a.createdAt || ""}`));

  const handleExcelIndir = async () => {
    setIsExcelLoading(true);
    try {
      const { excelDosyasiIndir } = await import("../lib/excelExport");
      excelDosyasiIndir(`sultankoy-cek-senet-${aktifDonem}.xlsx`, [
        {
          name: "Ozet",
          rows: [
            {
              Donem: aktifDonem,
              Kayit: donemKayitlari.length,
              Toplam: donemKayitlari.reduce((toplam, kayit) => toplam + sayiDegeri(kayit.miktar), 0),
            },
          ],
        },
        {
          name: "Cek Senet",
          rows: donemKayitlari.map((kayit) => ({
            Tarih: kayit.tarih,
            Tur: turBilgisiGetir(kayit.tur).etiket,
            Durum: durumBilgisiGetir(kayit.durum).etiket,
            Duzenleyen: kayit.duzenleyen,
            "Tahsil Tarihi": kayit.tahTarihi,
            Tutar: sayiDegeri(kayit.miktar),
            Banka: kayit.banka,
            Ekleyen: normalizeUsername(kayit.ekleyen),
          })),
        },
      ]);
    } catch (error: unknown) {
      alert(`Excel indirilemedi: ${hataMesajiniGetir(error)}`);
    } finally {
      setIsExcelLoading(false);
    }
  };

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

  const handleKaydet = async () => {
    if (kayitIslemiSuruyor) return;
    if (!form.tarih) return alert("Tarih seçin.");
    if (!form.duzenleyen.trim()) return alert("Düzenleyen girin.");
    if (!form.tahTarihi) return alert("Tahsilat tarihi seçin.");
    if (sayiDegeri(form.miktar) <= 0) return alert("Geçerli miktar girin.");
    if (!form.banka.trim()) return alert("Banka girin.");

    const oncekiKayit = editingId ? kayitlar.find((item) => item.id === editingId) : null;
    if (editingId && !kayitSahibiMi(oncekiKayit)) {
      return alert("Bu kaydı sadece ekleyen kullanıcı düzenleyebilir.");
    }

    const donemDisiOnayMesaji = aktifDonemDisiKayitOnayMetni(form.tarih, aktifDonem);
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

    setKayitIslemiSuruyor(true);
    const kayitId = editingId || yeniKayitIdOlustur();
    const yuklenenYollar: string[] = [];
    try {
      const onYuzFoto = await gorseliStorageaYukle(form.onYuzFoto || "", kayitId, "on");
      if (onYuzFoto && onYuzFoto !== form.onYuzFoto) yuklenenYollar.push(onYuzFoto);
      const arkaYuzFoto = await gorseliStorageaYukle(form.arkaYuzFoto || "", kayitId, "arka");
      if (arkaYuzFoto && arkaYuzFoto !== form.arkaYuzFoto) yuklenenYollar.push(arkaYuzFoto);

      const yeniKayit: CekSenetKaydi = {
        id: kayitId,
        tur: form.tur,
        tarih: form.tarih,
        duzenleyen: form.duzenleyen.trim(),
        tahTarihi: form.tahTarihi,
        miktar: sayiDegeri(form.miktar),
        banka: form.banka.trim(),
        durum: oncekiKayit?.durum || "bekliyor",
        tahsilEdilmeTarihi: oncekiKayit?.tahsilEdilmeTarihi || "",
        onYuzFoto,
        arkaYuzFoto,
        ekleyen: oncekiKayit?.ekleyen || aktifKullaniciKisa,
        createdAt: oncekiKayit?.createdAt,
      };

      const sorgu = editingId
        ? supabase.from(CEK_SENET_TABLOSU).update(kaydiDbPayloadinaCevir(yeniKayit)).eq("id", editingId)
        : supabase.from(CEK_SENET_TABLOSU).insert(kaydiDbPayloadinaCevir(yeniKayit));
      const { data, error } = await sorgu.select("*").single();
      if (error) throw error;

      const kaydedilen = dbSatiriniCevir(data as CekSenetDbSatiri);
      setKayitlar((onceki) =>
        editingId
          ? onceki.map((item) => (item.id === editingId ? kaydedilen : item))
          : [kaydedilen, ...onceki],
      );
      await gorselUrlLeriniYukle([kaydedilen]);
      await storageGorselleriniSil([
        oncekiKayit?.onYuzFoto && oncekiKayit.onYuzFoto !== onYuzFoto ? oncekiKayit.onYuzFoto : null,
        oncekiKayit?.arkaYuzFoto && oncekiKayit.arkaYuzFoto !== arkaYuzFoto ? oncekiKayit.arkaYuzFoto : null,
      ]);
      formKapat();
    } catch (error: unknown) {
      await storageGorselleriniSil(yuklenenYollar);
      alert(`Çek-senet kaydı kaydedilemedi: ${hataMesajiniGetir(error)}`);
    } finally {
      setKayitIslemiSuruyor(false);
    }
  };

  const handleSil = async (kayit: CekSenetKaydi) => {
    if (kayitIslemiSuruyor) return;
    if (!kayitSahibiMi(kayit)) {
      alert("Bu kaydı sadece ekleyen kullanıcı silebilir.");
      return;
    }
    if (
      !(await onConfirm({
        title: "Kaydı Sil",
        message: "Kayıt silinsin mi?",
        confirmText: "Evet, Sil",
        cancelText: "İptal",
        tone: "danger",
      }))
    ) return;

    setKayitIslemiSuruyor(true);
    try {
      const { error } = await supabase.from(CEK_SENET_TABLOSU).delete().eq("id", kayit.id);
      if (error) throw error;
      setKayitlar((onceki) => onceki.filter((item) => item.id !== kayit.id));
      await storageGorselleriniSil([kayit.onYuzFoto, kayit.arkaYuzFoto]);
      if (editingId === kayit.id) formKapat();
      if (detayKaydi?.id === kayit.id) setDetayKaydi(null);
    } catch (error: unknown) {
      alert(`Çek-senet kaydı silinemedi: ${hataMesajiniGetir(error)}`);
    } finally {
      setKayitIslemiSuruyor(false);
    }
  };

  const handleDurumDegistir = async (kayit: CekSenetKaydi, yeniDurum: CekSenetDurum) => {
    if (kayitIslemiSuruyor) return;
    if (!kayitSahibiMi(kayit)) {
      alert("Bu kaydı sadece ekleyen kullanıcı güncelleyebilir.");
      return;
    }

    setKayitIslemiSuruyor(true);
    try {
      const tahsilEdilmeTarihi = yeniDurum === "tahsil_edildi" ? getLocalDateString() : "";
      const { data, error } = await supabase
        .from(CEK_SENET_TABLOSU)
        .update({ durum: yeniDurum, tahsil_edilme_tarihi: tahsilEdilmeTarihi || null })
        .eq("id", kayit.id)
        .select("*")
        .single();
      if (error) throw error;
      const guncellenen = dbSatiriniCevir(data as CekSenetDbSatiri);
      setKayitlar((onceki) => onceki.map((item) => (item.id === kayit.id ? guncellenen : item)));
      setDetayKaydi((onceki) => (onceki?.id === kayit.id ? guncellenen : onceki));
    } catch (error: unknown) {
      alert(`Çek-senet durumu güncellenemedi: ${hataMesajiniGetir(error)}`);
    } finally {
      setKayitIslemiSuruyor(false);
    }
  };

  const renderFotoAlani = (
    baslik: string,
    alan: "onYuzFoto" | "arkaYuzFoto",
    inputRef: { current: HTMLInputElement | null },
  ) => {
    const kaynak = form[alan];
    const src = gorselUrliniGetir(kaynak);

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
          {kaynak && (
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

  const renderDetayFoto = (baslik: string, kaynak?: string) => {
    const src = gorselUrliniGetir(kaynak);
    return (
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
  };

  return (
    <div className="tab-fade-in main-content-area">
      <div className="card" style={{ borderLeft: "4px solid #0f766e", marginBottom: "8px", padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, color: "#0f766e", fontSize: "16px" }}>Çek-Senet</h3>
          <div style={{ display: "flex", gap: "8px", marginLeft: "auto", flexWrap: "wrap" }}>
            <button onClick={() => void handleExcelIndir()} disabled={isExcelLoading || veriYukleniyor} className="p-btn btn-anim" style={{ background: "#0369a1", minWidth: "112px", height: "34px", padding: "0 14px", fontSize: "12px", opacity: isExcelLoading || veriYukleniyor ? 0.7 : 1, cursor: isExcelLoading || veriYukleniyor ? "wait" : "pointer" }}>
              {isExcelLoading ? "Hazır..." : "📥 EXCEL"}
            </button>
            <button onClick={yeniKayitAc} disabled={veriYukleniyor || kayitIslemiSuruyor || Boolean(veriHatasi)} className="p-btn btn-anim" style={{ background: "#0f766e", minWidth: "118px", height: "34px", padding: "0 14px", fontSize: "12px", opacity: veriYukleniyor || kayitIslemiSuruyor || veriHatasi ? 0.65 : 1 }}>
              + EKLE
            </button>
          </div>
        </div>
      </div>

      {tasimaMesaji && (
        <div style={{ marginBottom: "8px", padding: "9px 11px", borderRadius: "9px", background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", fontSize: "12px", fontWeight: "bold" }}>
          {tasimaMesaji}
        </div>
      )}
      {veriHatasi && (
        <div style={{ marginBottom: "8px", padding: "9px 11px", borderRadius: "9px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: "12px", fontWeight: "bold" }}>
          {veriHatasi}
        </div>
      )}

      <div className="table-wrapper table-wrapper-fixed">
        <table className="tbl tbl-cek-senet" style={{ tableLayout: "fixed", width: "100%", minWidth: 0 }}>
          <thead>
            <tr>
              <th style={{ width: "10%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>TAR.</th>
              <th style={{ width: "15%", textAlign: "left", background: "#5b9bd5", color: "#fff" }}>TÜR</th>
              <th style={{ width: "13%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>DUR.</th>
              <th style={{ width: "16%", textAlign: "left", background: "#5b9bd5", color: "#fff" }}>DÜZ.</th>
              <th style={{ width: "12%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>TAH.</th>
              <th style={{ width: "12%", textAlign: "right", background: "#5b9bd5", color: "#fff" }}>TUT.</th>
              <th style={{ width: "10%", textAlign: "left", background: "#5b9bd5", color: "#fff" }}>BNK.</th>
              <th style={{ width: "7%", textAlign: "center", background: "#5b9bd5", color: "#fff" }}>EKL.</th>
              <th style={{ width: "5%", background: "#5b9bd5" }}></th>
            </tr>
          </thead>
          <tbody>
            {veriYukleniyor && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "14px", color: "#64748b", fontWeight: "bold" }}>
                  Supabase kayıtları yükleniyor...
                </td>
              </tr>
            )}
            {!veriYukleniyor && donemKayitlari.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "14px", color: "#94a3b8", fontWeight: "bold" }}>
                  Kayıt bulunmuyor.
                </td>
              </tr>
            )}
            {donemKayitlari.map((kayit) => {
              const tur = turBilgisiGetir(kayit.tur);
              const durum = durumBilgisiGetir(kayit.durum);
              return (
                <tr key={kayit.id}>
                  <td style={{ textAlign: "center" }}>{kisaTarih(kayit.tarih)}</td>
                  <td>
                    <span
                      title={tur.etiket}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        maxWidth: "100%",
                        borderRadius: "999px",
                        padding: "3px 5px",
                        background: tur.arkaPlan,
                        color: tur.renk,
                        fontWeight: "bold",
                        fontSize: "9px",
                        lineHeight: 1.15,
                      }}
                    >
                      <span style={{ display: "block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tur.etiket}
                      </span>
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span
                      title={durum.etiket}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        maxWidth: "100%",
                        borderRadius: "999px",
                        padding: "3px 5px",
                        background: durum.arkaPlan,
                        color: durum.renk,
                        fontWeight: "bold",
                        fontSize: "9px",
                        lineHeight: 1.15,
                      }}
                    >
                      <span style={{ display: "block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {durum.etiket}
                      </span>
                    </span>
                  </td>
                  <td title={kayit.duzenleyen}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "bold" }}>
                      {kayit.duzenleyen}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>{kisaTarih(kayit.tahTarihi)}</td>
                  <td style={{ textAlign: "right", fontWeight: "bold", color: "#0f766e" }}>{fSayi(kayit.miktar)}</td>
                  <td title={kayit.banka}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {kayit.banka}
                    </span>
                  </td>
                  <td style={{ textAlign: "center", color: "#64748b" }}>{normalizeUsername(kayit.ekleyen) || "-"}</td>
                  <td className="actions-cell" style={{ position: "relative" }}>
                    <button onClick={(e) => { e.stopPropagation(); setOpenDropdownId(kayit.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", padding: "0 4px", color: "#64748b" }}>⋮</button>
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
                                src: gorselUrliniGetir(kayit.onYuzFoto || kayit.arkaYuzFoto || ""),
                                baslik: kayit.onYuzFoto ? "Ön Yüz" : "Arka Yüz",
                              });
                            }}
                          >
                            🖼️
                          </button>
                        )}
                        {kayitSahibiMi(kayit) &&
                          DURUM_SECENEKLERI.filter((secenek) => secenek.deger !== kayit.durum).map((secenek) => (
                            <button
                              key={secenek.deger}
                              title={secenek.etiket}
                              className="dropdown-item-icon"
                              onClick={() => {
                                setOpenDropdownId(null);
                                void handleDurumDegistir(kayit, secenek.deger);
                              }}
                            >
                              {secenek.ikon}
                            </button>
                          ))}
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
              <DonemDisiTarihUyarisi tarih={form.tarih} aktifDonem={aktifDonem} />

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
              <button onClick={() => void handleKaydet()} disabled={kayitIslemiSuruyor} type="button" style={{ flex: 1, background: "#0f766e", border: "none", color: "#fff", borderRadius: "8px", padding: "10px", fontWeight: "bold", cursor: kayitIslemiSuruyor ? "wait" : "pointer", opacity: kayitIslemiSuruyor ? 0.7 : 1 }}>
                {kayitIslemiSuruyor ? "KAYDEDİLİYOR..." : editingId ? "GÜNCELLE" : "KAYDET"}
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
              <div><b>Durum:</b> {durumBilgisiGetir(detayKaydi.durum).etiket}</div>
              <div><b>Düzenleyen:</b> {detayKaydi.duzenleyen}</div>
              <div><b>Tahsilat Tarihi:</b> {String(detayKaydi.tahTarihi || "").split("-").reverse().join(".")}</div>
              {detayKaydi.tahsilEdilmeTarihi ? <div><b>Tahsil Edildiği Tarih:</b> {String(detayKaydi.tahsilEdilmeTarihi).split("-").reverse().join(".")}</div> : null}
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
