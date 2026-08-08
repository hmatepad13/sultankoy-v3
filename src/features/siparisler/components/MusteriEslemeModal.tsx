import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Bayi } from "../../../types/app";
import type { EslesmeFormu, WhatsAppMusteriEslesmesi } from "../types";
import { telefondanJidOlustur } from "../siparislerService";

interface MusteriEslemeModalProps {
  acik: boolean;
  bayiler: Bayi[];
  eslesme: WhatsAppMusteriEslesmesi | null;
  onClose: () => void;
  onSave: (form: EslesmeFormu) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const BOS_FORM: EslesmeFormu = { bayi_id: "", telefon: "", chat_jid: "", etiket: "", aktif: true };

export function MusteriEslemeModal({ acik, bayiler, eslesme, onClose, onSave, onDelete }: MusteriEslemeModalProps) {
  const [form, setForm] = useState<EslesmeFormu>(BOS_FORM);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");
  const siraliBayiler = useMemo(() => [...bayiler].sort((a, b) => a.isim.localeCompare(b.isim, "tr")), [bayiler]);

  useEffect(() => {
    if (!acik) return;
    setForm(
      eslesme
        ? {
            bayi_id: eslesme.bayi_id,
            telefon: eslesme.telefon,
            chat_jid: eslesme.chat_jid,
            etiket: eslesme.etiket || "",
            aktif: eslesme.aktif,
          }
        : BOS_FORM,
    );
    setHata("");
  }, [acik, eslesme]);

  if (!acik) return null;

  const kaydet = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.bayi_id || !form.telefon.trim()) {
      setHata("Müşteri ve telefon zorunludur.");
      return;
    }
    setKaydediliyor(true);
    setHata("");
    try {
      await onSave(form);
      onClose();
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Eşleştirme kaydedilemedi.");
    } finally {
      setKaydediliyor(false);
    }
  };

  const sil = async () => {
    if (!onDelete) return;
    setKaydediliyor(true);
    setHata("");
    try {
      await onDelete();
      onClose();
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Eşleştirme silinemedi.");
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <div className="wp-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="wp-modal" role="dialog" aria-modal="true" aria-labelledby="wp-eslesme-baslik" onSubmit={kaydet} onMouseDown={(e) => e.stopPropagation()}>
        <div className="wp-modal-header">
          <div>
            <h3 id="wp-eslesme-baslik">{eslesme ? "Müşteri Eşleştirmesini Düzenle" : "WhatsApp Müşterisi Ekle"}</h3>
            <p>Yalnız bu listede aktif olan sohbetler sipariş taramasına girer.</p>
          </div>
          <button type="button" className="wp-icon-button" onClick={onClose} aria-label="Pencereyi kapat">✕</button>
        </div>

        <div className="wp-modal-body">
          <label className="wp-field">
            <span>Sultanköy müşterisi</span>
            <select value={form.bayi_id} onChange={(e) => setForm((onceki) => ({ ...onceki, bayi_id: e.target.value }))} required>
              <option value="">Müşteri seçin</option>
              {siraliBayiler.filter((bayi) => bayi.aktif !== false).map((bayi) => <option key={bayi.id} value={bayi.id}>{bayi.isim}</option>)}
            </select>
          </label>

          <label className="wp-field">
            <span>Telefon</span>
            <input
              value={form.telefon}
              inputMode="tel"
              placeholder="05xx xxx xx xx"
              onChange={(e) => {
                const telefon = e.target.value;
                setForm((onceki) => ({
                  ...onceki,
                  telefon,
                  chat_jid: onceki.chat_jid === telefondanJidOlustur(onceki.telefon) || !onceki.chat_jid
                    ? telefondanJidOlustur(telefon)
                    : onceki.chat_jid,
                }));
              }}
              required
            />
          </label>

          <label className="wp-field">
            <span>WhatsApp sohbet kimliği (JID)</span>
            <input value={form.chat_jid} placeholder="905xxxxxxxxx@s.whatsapp.net" onChange={(e) => setForm((onceki) => ({ ...onceki, chat_jid: e.target.value }))} />
          </label>

          <label className="wp-field">
            <span>Etiket / not</span>
            <input value={form.etiket} placeholder="İsteğe bağlı" onChange={(e) => setForm((onceki) => ({ ...onceki, etiket: e.target.value }))} />
          </label>

          <label className="wp-check-row">
            <input type="checkbox" checked={form.aktif} onChange={(e) => setForm((onceki) => ({ ...onceki, aktif: e.target.checked }))} />
            <span>Sipariş taramasına dahil et</span>
          </label>

          {hata ? <div className="wp-alert wp-alert-error">{hata}</div> : null}
        </div>

        <div className="wp-modal-footer">
          {onDelete ? <button type="button" className="wp-btn wp-btn-danger" disabled={kaydediliyor} onClick={sil}>Sil</button> : <span />}
          <div className="wp-footer-actions">
            <button type="button" className="wp-btn wp-btn-secondary" onClick={onClose}>İptal</button>
            <button type="submit" className="wp-btn wp-btn-primary" disabled={kaydediliyor}>{kaydediliyor ? "Kaydediliyor..." : "Kaydet"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
