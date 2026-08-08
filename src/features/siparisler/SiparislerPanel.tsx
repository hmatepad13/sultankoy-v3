import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppConfirmOptions, Bayi } from "../../types/app";
import { MusteriEslemeModal } from "./components/MusteriEslemeModal";
import { MusteriListesiModal } from "./components/MusteriListesiModal";
import { SiparisDetayModal } from "./components/SiparisDetayModal";
import { TestModal } from "./components/TestModal";
import {
  eslesmeKaydet,
  eslesmeSil,
  istekSil,
  siparislerVerileriniGetir,
  taslakGuncelle,
  taslakSil,
  whatsappIslemIstegiOlustur,
} from "./siparislerService";
import type {
  EslesmeFormu,
  SiparislerVeriPaketi,
  WhatsAppMusteriEslesmesi,
  WhatsAppSiparisTaslagi,
  WhatsAppTaslakDurumu,
} from "./types";
import "./SiparislerPanel.css";

interface SiparislerPanelProps {
  bayiler: Bayi[];
  isAdmin: boolean;
  onConfirm: (options: AppConfirmOptions) => Promise<boolean>;
}

const BOS_VERI: SiparislerVeriPaketi = { istekler: [], eslesmeler: [], taslaklar: [], worker: null };

const durumEtiketi = (durum: string) => ({
  bekliyor: "Bekliyor",
  isleniyor: "Hazırlanıyor",
  tamamlandi: "Tamamlandı",
  hata: "Hata",
  test: "Test",
  hazir: "Hazır",
  kontrol: "Kontrol",
  yoksayildi: "Yok sayıldı",
}[durum] || durum);

const kisaSaat = (deger?: string | null) => deger
  ? new Date(deger).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
  : "-";

export function SiparislerPanel({ bayiler, isAdmin, onConfirm }: SiparislerPanelProps) {
  const [veri, setVeri] = useState<SiparislerVeriPaketi>(BOS_VERI);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemYapiliyor, setIslemYapiliyor] = useState(false);
  const [supabaseBagli, setSupabaseBagli] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [musteriListesiAcik, setMusteriListesiAcik] = useState(false);
  const [testModalAcik, setTestModalAcik] = useState(false);
  const [eslesmeModalAcik, setEslesmeModalAcik] = useState(false);
  const [aktifEslesme, setAktifEslesme] = useState<WhatsAppMusteriEslesmesi | null>(null);
  const [aktifTaslak, setAktifTaslak] = useState<WhatsAppSiparisTaslagi | null>(null);

  const aktifEslesmeSayisi = useMemo(() => veri.eslesmeler.filter((eslesme) => eslesme.aktif).length, [veri.eslesmeler]);
  const devamEdenIsVar = useMemo(
    () => veri.istekler.some((istek) => istek.durum === "bekliyor" || istek.durum === "isleniyor"),
    [veri.istekler],
  );
  const workerCanli = useMemo(() => {
    if (!veri.worker?.last_seen) return false;
    return Date.now() - new Date(veri.worker.last_seen).getTime() < 35_000;
  }, [veri.worker?.last_seen]);
  const whatsappBagli = workerCanli && Boolean(veri.worker?.whatsapp_bagli);

  const sonSiparisIstegi = useMemo(
    () => veri.istekler.find((istek) => istek.tur === "siparisleri_getir") || null,
    [veri.istekler],
  );
  const gunlukTaslaklar = useMemo(
    () => sonSiparisIstegi
      ? veri.taslaklar.filter((taslak) => taslak.istek_id === sonSiparisIstegi.id && taslak.durum !== "test" && taslak.durum !== "yoksayildi")
      : [],
    [sonSiparisIstegi, veri.taslaklar],
  );
  const gunlukOzet = useMemo(() => gunlukTaslaklar.reduce(
    (toplam, taslak) => ({
      yogurt5: toplam.yogurt5 + (taslak.yogurt_5kg || 0),
      yogurt3: toplam.yogurt3 + (taslak.yogurt_3kg || 0),
      kontrol: toplam.kontrol + (taslak.durum === "kontrol" ? 1 : 0),
    }),
    { yogurt5: 0, yogurt3: 0, kontrol: 0 },
  ), [gunlukTaslaklar]);
  const testIstekleri = useMemo(() => veri.istekler.filter((istek) => istek.tur === "test_mesajlari"), [veri.istekler]);

  const verileriYenile = useCallback(async (sessiz = false) => {
    if (!sessiz) setYukleniyor(true);
    try {
      const paket = await siparislerVerileriniGetir();
      setVeri(paket);
      setSupabaseBagli(true);
      setHata("");
    } catch (error) {
      setSupabaseBagli(false);
      setHata(error instanceof Error ? error.message : "Sipariş verileri alınamadı.");
    } finally {
      if (!sessiz) setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    void verileriYenile();
    const zamanlayici = window.setInterval(() => void verileriYenile(true), 10_000);
    return () => window.clearInterval(zamanlayici);
  }, [verileriYenile]);

  const istekOlustur = async (tur: "test_mesajlari" | "siparisleri_getir") => {
    setIslemYapiliyor(true);
    setHata("");
    setBilgi("");
    try {
      await whatsappIslemIstegiOlustur(tur);
      setBilgi(tur === "test_mesajlari" ? "Test başlatıldı." : "Günlük siparişler hazırlanıyor...");
      await verileriYenile(true);
    } catch (error) {
      setHata(error instanceof Error ? error.message : "İşlem isteği oluşturulamadı.");
    } finally {
      setIslemYapiliyor(false);
    }
  };

  const eslesmeFormunuKaydet = async (form: EslesmeFormu) => {
    await eslesmeKaydet(form, aktifEslesme?.id);
    await verileriYenile(true);
  };

  const eslesmeyiSil = async () => {
    if (!aktifEslesme) return;
    const onay = await onConfirm({
      title: "Müşteri bağlantısı silinsin mi?",
      message: "Yalnız WhatsApp bağlantısı silinir; müşteri ve finansal kayıtlar etkilenmez.",
      confirmText: "Evet, Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!onay) return;
    await eslesmeSil(aktifEslesme.id);
    await verileriYenile(true);
  };

  const taslagiKaydet = async (degerler: { yogurt_5kg: number | null; yogurt_3kg: number | null; durum: WhatsAppTaslakDurumu; aciklama: string }) => {
    if (!aktifTaslak) return;
    await taslakGuncelle(aktifTaslak.id, degerler);
    await verileriYenile(true);
  };

  const taslagiSil = async () => {
    if (!aktifTaslak) return;
    const onay = await onConfirm({
      title: "Sipariş taslağı silinsin mi?",
      message: "Yalnız bu taslak silinir; WhatsApp mesajı ve satış kayıtları etkilenmez.",
      confirmText: "Evet, Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!onay) return;
    await taslakSil(aktifTaslak.id);
    await verileriYenile(true);
  };

  const testKaydiniSil = async (id: string) => {
    const onay = await onConfirm({
      title: "Test kaydı silinsin mi?",
      message: "Bu test ve ona bağlı test sonuçları silinecek.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!onay) return;
    await istekSil(id);
    await verileriYenile(true);
  };

  const eslesmeEditorunuAc = (eslesme: WhatsAppMusteriEslesmesi | null) => {
    setAktifEslesme(eslesme);
    setMusteriListesiAcik(false);
    setEslesmeModalAcik(true);
  };

  if (!isAdmin) return <div className="wp-alert wp-alert-error">Siparişler bölümü yalnız yöneticilere açıktır.</div>;

  const siparisButonuKapali = islemYapiliyor || devamEdenIsVar || !whatsappBagli || aktifEslesmeSayisi === 0;

  return (
    <section className="wp-panel" aria-label="Günlük WhatsApp siparişleri">
      <header className="wp-compact-header">
        <div>
          <h2>Günlük Siparişler</h2>
          <p>WhatsApp’tan gelen yoğurt siparişleri</p>
        </div>
        <div className="wp-header-actions">
          <button className="wp-icon-button wp-icon-framed" onClick={() => void verileriYenile()} disabled={yukleniyor} aria-label="Siparişleri yenile">↻</button>
          <button className="wp-btn wp-btn-secondary" onClick={() => setMusteriListesiAcik(true)}>Müşteriler</button>
        </div>
      </header>

      <div className="wp-connection-bar">
        <span className={`wp-connection-item ${whatsappBagli ? "online" : "offline"}`}>
          <i className="wp-dot" /> WhatsApp: {whatsappBagli ? "Bağlı" : "Bağlı değil"}
        </span>
        <span className={`wp-connection-item ${workerCanli ? "online" : "offline"}`}>
          <i className="wp-dot" /> Oracle: {workerCanli ? "Bağlı" : "Bağlı değil"}
        </span>
        <span className={`wp-connection-item ${supabaseBagli ? "online" : "offline"}`}>
          <i className="wp-dot" /> Supabase: {supabaseBagli ? "Bağlı" : "Bağlı değil"}
        </span>
        <button className="wp-test-link" onClick={() => setTestModalAcik(true)}>Bağlantı testi</button>
      </div>

      {hata ? <div className="wp-alert wp-alert-error">{hata}</div> : null}
      {bilgi ? <div className="wp-alert wp-alert-info">{bilgi}</div> : null}

      <div className="wp-daily-action">
        <div>
          <strong>Son 24 saatin siparişlerini hazırla</strong>
          <span>{aktifEslesmeSayisi === 0 ? "Önce WhatsApp müşterisi ekleyin" : `${aktifEslesmeSayisi} müşteri kontrol edilecek`}</span>
        </div>
        <button className="wp-btn wp-btn-primary wp-btn-large" disabled={siparisButonuKapali} onClick={() => void istekOlustur("siparisleri_getir")}>
          {devamEdenIsVar ? "Hazırlanıyor..." : "Siparişleri Getir"}
        </button>
      </div>

      <div className="wp-summary-row" aria-label="Günlük sipariş özeti">
        <div><span>Müşteri</span><strong>{gunlukTaslaklar.length}</strong></div>
        <div><span>5 kg</span><strong>{gunlukOzet.yogurt5}</strong></div>
        <div><span>3 kg</span><strong>{gunlukOzet.yogurt3}</strong></div>
        <div className={gunlukOzet.kontrol > 0 ? "needs-check" : ""}><span>Kontrol</span><strong>{gunlukOzet.kontrol}</strong></div>
      </div>

      <div className="wp-orders-card">
        <div className="wp-orders-title">
          <div>
            <h3>Müşteri Siparişleri</h3>
            <span>{sonSiparisIstegi ? `Son kontrol ${kisaSaat(sonSiparisIstegi.completed_at || sonSiparisIstegi.created_at)}` : "Henüz sipariş kontrolü yapılmadı"}</span>
          </div>
          {sonSiparisIstegi ? <span className={`wp-badge ${sonSiparisIstegi.durum}`}>{durumEtiketi(sonSiparisIstegi.durum)}</span> : null}
        </div>

        <div className="wp-order-head" aria-hidden="true">
          <span>Müşteri</span><span>5 kg</span><span>3 kg</span><span>Durum</span>
        </div>
        <div className="wp-order-list">
          {yukleniyor ? (
            <div className="wp-empty">Yükleniyor...</div>
          ) : gunlukTaslaklar.length === 0 ? (
            <div className="wp-empty wp-empty-orders">
              <strong>Bugün için sipariş bulunmuyor.</strong>
              <span>Müşterileri ekledikten sonra “Siparişleri Getir” düğmesine basın.</span>
            </div>
          ) : gunlukTaslaklar.map((taslak) => (
            <button className="wp-order-row" key={taslak.id} onClick={() => setAktifTaslak(taslak)}>
              <span className="wp-order-customer">
                <strong>{taslak.bayi_adi_snapshot || taslak.chat_adi || taslak.chat_jid}</strong>
                <small>{taslak.ham_mesaj} · {kisaSaat(taslak.mesaj_zamani)}</small>
              </span>
              <strong className="wp-order-quantity">{taslak.yogurt_5kg ?? "-"}</strong>
              <strong className="wp-order-quantity">{taslak.yogurt_3kg ?? "-"}</strong>
              <span className={`wp-badge ${taslak.durum}`}>{durumEtiketi(taslak.durum)}</span>
            </button>
          ))}
        </div>
      </div>

      <MusteriListesiModal
        acik={musteriListesiAcik}
        bayiler={bayiler}
        eslesmeler={veri.eslesmeler}
        onClose={() => setMusteriListesiAcik(false)}
        onAdd={() => eslesmeEditorunuAc(null)}
        onEdit={eslesmeEditorunuAc}
      />
      <MusteriEslemeModal
        acik={eslesmeModalAcik}
        bayiler={bayiler}
        eslesme={aktifEslesme}
        onClose={() => { setEslesmeModalAcik(false); setMusteriListesiAcik(true); }}
        onSave={eslesmeFormunuKaydet}
        onDelete={aktifEslesme ? eslesmeyiSil : undefined}
      />
      <TestModal
        acik={testModalAcik}
        whatsappBagli={whatsappBagli}
        islemYapiliyor={islemYapiliyor || devamEdenIsVar}
        istekler={testIstekleri}
        onClose={() => setTestModalAcik(false)}
        onRun={() => istekOlustur("test_mesajlari")}
        onDelete={testKaydiniSil}
      />
      <SiparisDetayModal taslak={aktifTaslak} onClose={() => setAktifTaslak(null)} onSave={taslagiKaydet} onDelete={taslagiSil} />
    </section>
  );
}
