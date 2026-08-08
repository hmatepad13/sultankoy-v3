import type { WhatsAppIslemIstegi } from "../types";

interface TestModalProps {
  acik: boolean;
  whatsappBagli: boolean;
  islemYapiliyor: boolean;
  istekler: WhatsAppIslemIstegi[];
  onClose: () => void;
  onRun: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const testDurumu = (durum: WhatsAppIslemIstegi["durum"]) => ({
  bekliyor: "Bekliyor",
  isleniyor: "Çalışıyor",
  tamamlandi: "Tamamlandı",
  hata: "Hata",
}[durum]);

export function TestModal({ acik, whatsappBagli, islemYapiliyor, istekler, onClose, onRun, onDelete }: TestModalProps) {
  if (!acik) return null;

  return (
    <div className="wp-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="wp-modal" role="dialog" aria-modal="true" aria-labelledby="wp-test-baslik" onMouseDown={(event) => event.stopPropagation()}>
        <div className="wp-modal-header">
          <div>
            <h3 id="wp-test-baslik">Bağlantı Testi</h3>
            <p>Son 24 saatteki “deneme sultankoy” mesajını arar.</p>
          </div>
          <button type="button" className="wp-icon-button" onClick={onClose} aria-label="Pencereyi kapat">✕</button>
        </div>
        <div className="wp-modal-body">
          <button type="button" className="wp-btn wp-btn-blue wp-btn-large" disabled={!whatsappBagli || islemYapiliyor} onClick={() => void onRun()}>
            {islemYapiliyor ? "Test çalışıyor..." : "Test Mesajını Ara"}
          </button>
          <div className="wp-test-history">
            {istekler.length === 0 ? <div className="wp-empty">Henüz test yapılmadı.</div> : istekler.map((istek) => (
              <div className="wp-test-row" key={istek.id}>
                <span>
                  <strong>{testDurumu(istek.durum)} · {istek.sonuc_sayisi} sonuç</strong>
                  <small>{new Date(istek.created_at).toLocaleString("tr-TR")}</small>
                </span>
                <button type="button" className="wp-test-delete" onClick={() => void onDelete(istek.id)}>Sil</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
