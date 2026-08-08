import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppConfirmOptions, Bayi } from "../../types/app";
import { MusteriEslemeModal } from "./components/MusteriEslemeModal";
import { SiparisDetayModal } from "./components/SiparisDetayModal";
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
  isleniyor: "İşleniyor",
  tamamlandi: "Tamamlandı",
  hata: "Hata",
  test: "Test",
  hazir: "Hazır",
  kontrol: "Kontrol gerekli",
  yoksayildi: "Yok sayıldı",
}[durum] || durum);

const tarihSaat = (deger?: string | null) => deger ? new Date(deger).toLocaleString("tr-TR") : "-";

export function SiparislerPanel({ bayiler, isAdmin, onConfirm }: SiparislerPanelProps) {
  const [veri, setVeri] = useState<SiparislerVeriPaketi>(BOS_VERI);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemYapiliyor, setIslemYapiliyor] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [eslesmeModalAcik, setEslesmeModalAcik] = useState(false);
  const [aktifEslesme, setAktifEslesme] = useState<WhatsAppMusteriEslesmesi | null>(null);
  const [aktifTaslak, setAktifTaslak] = useState<WhatsAppSiparisTaslagi | null>(null);

  const bayiMap = useMemo(() => new Map(bayiler.map((bayi) => [bayi.id, bayi.isim])), [bayiler]);
  const aktifEslesmeSayisi = useMemo(() => veri.eslesmeler.filter((eslesme) => eslesme.aktif).length, [veri.eslesmeler]);
  const devamEdenIsVar = useMemo(() => veri.istekler.some((istek) => istek.durum === "bekliyor" || istek.durum === "isleniyor"), [veri.istekler]);
  const workerCanli = useMemo(() => {
    if (!veri.worker?.last_seen) return false;
    return Date.now() - new Date(veri.worker.last_seen).getTime() < 35_000;
  }, [veri.worker?.last_seen]);

  const verileriYenile = useCallback(async (sessiz = false) => {
    if (!sessiz) setYukleniyor(true);
    try {
      const paket = await siparislerVerileriniGetir();
      setVeri(paket);
      setHata("");
    } catch (error) {
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
      setBilgi(tur === "test_mesajlari" ? "Test mesajı arama isteği Oracle sunucusuna gönderildi." : "Sipariş tarama isteği Oracle sunucusuna gönderildi.");
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
      title: "Eşleştirme silinsin mi?",
      message: "Bu işlem yalnız WhatsApp müşteri eşleştirmesini siler; bayi ve finansal kayıtlar etkilenmez.",
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
      title: "Taslak silinsin mi?",
      message: "Yalnız bu sipariş taslağı silinecek; WhatsApp mesajı ve satış kayıtları etkilenmez.",
      confirmText: "Evet, Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!onay) return;
    await taslakSil(aktifTaslak.id);
    await verileriYenile(true);
  };

  const istekKaydiniSil = async (id: string) => {
    const onay = await onConfirm({
      title: "Tarama geçmişi silinsin mi?",
      message: "Bu tarama ve ona bağlı taslaklar silinecek. Satış ve cari kayıtlar etkilenmez.",
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!onay) return;
    await istekSil(id);
    await verileriYenile(true);
  };

  if (!isAdmin) return <div className="wp-alert wp-alert-error">Siparişler bölümü yalnız yöneticilere açıktır.</div>;

  return (
    <section className="wp-panel" aria-label="WhatsApp siparişleri">
      <div className="wp-header">
        <div>
          <h2>📦 WhatsApp Siparişleri</h2>
          <p>Mesajları taslak hâline getirir; satış, borç veya cari kayıt oluşturmaz.</p>
        </div>
        <div className="wp-header-actions">
          <button className="wp-btn wp-btn-secondary" onClick={() => void verileriYenile()} disabled={yukleniyor}>↻ Yenile</button>
          <button className="wp-btn wp-btn-primary" onClick={() => { setAktifEslesme(null); setEslesmeModalAcik(true); }}>+ Müşteri Eşleştir</button>
        </div>
      </div>

      {hata ? <div className="wp-alert wp-alert-error">{hata}</div> : null}
      {bilgi ? <div className="wp-alert wp-alert-info">{bilgi}</div> : null}

      <div className="wp-status-grid">
        <div className="wp-status-card"><span>Oracle worker</span><strong><i className={`wp-dot ${workerCanli ? "online" : ""}`} />{workerCanli ? "Çalışıyor" : "Yanıt yok"}</strong></div>
        <div className="wp-status-card"><span>WhatsApp oturumu</span><strong>{veri.worker?.whatsapp_bagli ? "Bağlı" : "Bağlı değil"}</strong></div>
        <div className="wp-status-card"><span>İzinli müşteriler</span><strong>{aktifEslesmeSayisi}</strong></div>
      </div>

      <div className="wp-card">
        <div className="wp-card-title"><h3>Sunucuyu Dene</h3><span className="wp-meta">Son 24 saat</span></div>
        <div className="wp-card-body">
          <div className="wp-action-row">
            <button className="wp-btn wp-btn-blue" disabled={islemYapiliyor || devamEdenIsVar || !workerCanli} onClick={() => void istekOlustur("test_mesajlari")}>“deneme sultankoy” Mesajını Getir</button>
            <button className="wp-btn wp-btn-primary" disabled={islemYapiliyor || devamEdenIsVar || !workerCanli || aktifEslesmeSayisi === 0} onClick={() => void istekOlustur("siparisleri_getir")}>İzinli Müşterilerin Siparişlerini Getir</button>
          </div>
          {!workerCanli ? <p className="wp-meta">Oracle worker çevrimdışı görünüyor; işlem düğmeleri sunucu cevap verene kadar kapalıdır.</p> : null}
        </div>
      </div>

      <div className="wp-card">
        <div className="wp-card-title"><h3>Müşteri Eşleştirmeleri</h3><span className="wp-meta">{veri.eslesmeler.length} kayıt</span></div>
        <div className="wp-card-body wp-list">
          {veri.eslesmeler.length === 0 ? <div className="wp-empty">Henüz WhatsApp müşterisi eşleştirilmedi.</div> : veri.eslesmeler.map((eslesme) => (
            <div className="wp-list-row" key={eslesme.id}>
              <button className="wp-row-main" onClick={() => { setAktifEslesme(eslesme); setEslesmeModalAcik(true); }}>
                <div className="wp-row-title">{bayiMap.get(eslesme.bayi_id) || "Silinmiş müşteri"}</div>
                <div className="wp-row-sub">{eslesme.telefon} · {eslesme.chat_jid}</div>
              </button>
              <div className="wp-row-sub">{eslesme.etiket || "-"}</div><div /><span className={`wp-badge ${eslesme.aktif ? "hazir" : ""}`}>{eslesme.aktif ? "Aktif" : "Pasif"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="wp-card">
        <div className="wp-card-title"><h3>Sipariş Taslakları</h3><span className="wp-meta">{veri.taslaklar.length} sonuç</span></div>
        <div className="wp-card-body wp-list">
          {yukleniyor ? <div className="wp-empty">Yükleniyor...</div> : veri.taslaklar.length === 0 ? <div className="wp-empty">Henüz mesaj sonucu yok.</div> : veri.taslaklar.map((taslak) => (
            <div className="wp-list-row" key={taslak.id}>
              <button className="wp-row-main" onClick={() => setAktifTaslak(taslak)}>
                <div className="wp-row-title">{taslak.bayi_adi_snapshot || taslak.chat_adi || taslak.chat_jid}</div>
                <div className="wp-row-sub">{taslak.ham_mesaj} · {tarihSaat(taslak.mesaj_zamani)}</div>
              </button>
              <div className="wp-quantity">5 kg: {taslak.yogurt_5kg ?? "-"}</div>
              <div className="wp-quantity">3 kg: {taslak.yogurt_3kg ?? "-"}</div>
              <span className={`wp-badge ${taslak.durum}`}>{durumEtiketi(taslak.durum)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="wp-card">
        <div className="wp-card-title"><h3>Tarama Geçmişi</h3><span className="wp-meta">Son {veri.istekler.length} işlem</span></div>
        <div className="wp-card-body wp-list">
          {veri.istekler.length === 0 ? <div className="wp-empty">Henüz tarama yapılmadı.</div> : veri.istekler.map((istek) => (
            <div className="wp-list-row" key={istek.id}>
              <div className="wp-row-main"><div className="wp-row-title">{istek.tur === "test_mesajlari" ? "Test mesajı" : "Sipariş taraması"}</div><div className="wp-row-sub">{tarihSaat(istek.created_at)} · {istek.sonuc_sayisi} sonuç{istek.hata_mesaji ? ` · ${istek.hata_mesaji}` : ""}</div></div>
              <div /><div /><button className={`wp-badge ${istek.durum}`} onClick={() => void istekKaydiniSil(istek.id)} title="Bu tarama geçmişini sil">{durumEtiketi(istek.durum)} · Sil</button>
            </div>
          ))}
        </div>
      </div>

      <MusteriEslemeModal
        acik={eslesmeModalAcik}
        bayiler={bayiler}
        eslesme={aktifEslesme}
        onClose={() => setEslesmeModalAcik(false)}
        onSave={eslesmeFormunuKaydet}
        onDelete={aktifEslesme ? eslesmeyiSil : undefined}
      />
      <SiparisDetayModal taslak={aktifTaslak} onClose={() => setAktifTaslak(null)} onSave={taslagiKaydet} onDelete={taslagiSil} />
    </section>
  );
}
