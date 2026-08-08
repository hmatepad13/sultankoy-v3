import { useEffect, useState, type FormEvent } from "react";
import type { WhatsAppSiparisTaslagi, WhatsAppTaslakDurumu } from "../types";

interface SiparisDetayModalProps {
  taslak: WhatsAppSiparisTaslagi | null;
  onClose: () => void;
  onSave: (degerler: { yogurt_5kg: number | null; yogurt_3kg: number | null; durum: WhatsAppTaslakDurumu; aciklama: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}

const sayiyaCevir = (deger: string) => deger.trim() === "" ? null : Math.max(0, Number.parseInt(deger, 10) || 0);

export function SiparisDetayModal({ taslak, onClose, onSave, onDelete }: SiparisDetayModalProps) {
  const [yogurt5, setYogurt5] = useState("");
  const [yogurt3, setYogurt3] = useState("");
  const [durum, setDurum] = useState<WhatsAppTaslakDurumu>("kontrol");
  const [aciklama, setAciklama] = useState("");
  const [isleniyor, setIsleniyor] = useState(false);
  const [hata, setHata] = useState("");

  useEffect(() => {
    if (!taslak) return;
    setYogurt5(taslak.yogurt_5kg == null ? "" : String(taslak.yogurt_5kg));
    setYogurt3(taslak.yogurt_3kg == null ? "" : String(taslak.yogurt_3kg));
    setDurum(taslak.durum);
    setAciklama(taslak.aciklama || "");
    setHata("");
  }, [taslak]);

  if (!taslak) return null;

  const kaydet = async (event: FormEvent) => {
    event.preventDefault();
    setIsleniyor(true);
    setHata("");
    try {
      await onSave({ yogurt_5kg: sayiyaCevir(yogurt5), yogurt_3kg: sayiyaCevir(yogurt3), durum, aciklama });
      onClose();
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Taslak kaydedilemedi.");
    } finally {
      setIsleniyor(false);
    }
  };

  const sil = async () => {
    setIsleniyor(true);
    setHata("");
    try {
      await onDelete();
      onClose();
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Taslak silinemedi.");
    } finally {
      setIsleniyor(false);
    }
  };

  return (
    <div className="wp-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="wp-modal" role="dialog" aria-modal="true" aria-labelledby="wp-taslak-baslik" onSubmit={kaydet} onMouseDown={(e) => e.stopPropagation()}>
        <div className="wp-modal-header">
          <div><h3 id="wp-taslak-baslik">Sipariş Taslağı</h3><p>{taslak.bayi_adi_snapshot || taslak.chat_adi || taslak.chat_jid}</p></div>
          <button type="button" className="wp-icon-button" onClick={onClose} aria-label="Pencereyi kapat">✕</button>
        </div>
        <div className="wp-modal-body">
          <div className="wp-message-box">{taslak.ham_mesaj}</div>
          <div className="wp-two-columns">
            <label className="wp-field"><span>5 kg yoğurt</span><input type="number" min="0" inputMode="numeric" value={yogurt5} onChange={(e) => setYogurt5(e.target.value)} /></label>
            <label className="wp-field"><span>3 kg yoğurt</span><input type="number" min="0" inputMode="numeric" value={yogurt3} onChange={(e) => setYogurt3(e.target.value)} /></label>
          </div>
          <label className="wp-field"><span>Durum</span><select value={durum} onChange={(e) => setDurum(e.target.value as WhatsAppTaslakDurumu)}><option value="test">Test</option><option value="hazir">Hazır</option><option value="kontrol">Kontrol gerekli</option><option value="yoksayildi">Yok sayıldı</option></select></label>
          <label className="wp-field"><span>Açıklama</span><textarea rows={3} value={aciklama} onChange={(e) => setAciklama(e.target.value)} /></label>
          <div className="wp-meta">Mesaj zamanı: {new Date(taslak.mesaj_zamani).toLocaleString("tr-TR")}</div>
          {hata ? <div className="wp-alert wp-alert-error">{hata}</div> : null}
        </div>
        <div className="wp-modal-footer">
          <button type="button" className="wp-btn wp-btn-danger" disabled={isleniyor} onClick={sil}>Sil</button>
          <div className="wp-footer-actions"><button type="button" className="wp-btn wp-btn-secondary" onClick={onClose}>İptal</button><button type="submit" className="wp-btn wp-btn-primary" disabled={isleniyor}>{isleniyor ? "Kaydediliyor..." : "Kaydet"}</button></div>
        </div>
      </form>
    </div>
  );
}
