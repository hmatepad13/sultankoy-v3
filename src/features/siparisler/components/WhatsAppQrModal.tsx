import type { WhatsAppWorkerDurumu } from "../types";

interface WhatsAppQrModalProps {
  acik: boolean;
  worker: WhatsAppWorkerDurumu | null;
  islemYapiliyor: boolean;
  onClose: () => void;
  onRequest: () => Promise<void>;
}

export function WhatsAppQrModal({ acik, worker, islemYapiliyor, onClose, onRequest }: WhatsAppQrModalProps) {
  if (!acik) return null;

  const qrGorunur = worker?.whatsapp_durum === "qr_bekleniyor"
    && Boolean(worker.qr_kod);
  const bagli = worker?.whatsapp_durum === "bagli" && worker.whatsapp_bagli;
  const hazirlaniyor = worker?.whatsapp_durum === "qr_hazirlaniyor" || islemYapiliyor;

  return (
    <div className="wp-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="wp-modal wp-qr-modal" role="dialog" aria-modal="true" aria-labelledby="wp-qr-baslik" onMouseDown={(event) => event.stopPropagation()}>
        <div className="wp-modal-header">
          <div>
            <h3 id="wp-qr-baslik">WhatsApp’ı Bağla</h3>
            <p>QR yalnız bu istekten sonra ve kısa süreli üretilir.</p>
          </div>
          <button type="button" className="wp-icon-button" onClick={onClose} aria-label="Pencereyi kapat">✕</button>
        </div>
        <div className="wp-modal-body wp-qr-body">
          {bagli ? (
            <div className="wp-qr-success"><i className="wp-dot" /> WhatsApp bağlandı.</div>
          ) : qrGorunur ? (
            <>
              <img className="wp-qr-image" src={worker?.qr_kod || ""} alt="Sultanköy WhatsApp bağlantı QR kodu" />
              <strong>WhatsApp → Bağlı cihazlar → Cihaz bağla</strong>
              <span>Bu ekran aynı WhatsApp telefonundaysa QR’ı bilgisayar veya ikinci cihazda açın.</span>
            </>
          ) : hazirlaniyor ? (
            <div className="wp-qr-waiting">QR hazırlanıyor…</div>
          ) : (
            <>
              <div className="wp-qr-waiting">{worker?.whatsapp_detay || "WhatsApp oturumu bağlı değil."}</div>
              <button type="button" className="wp-btn wp-btn-primary wp-btn-large" onClick={() => void onRequest()} disabled={islemYapiliyor}>
                QR Oluştur
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
