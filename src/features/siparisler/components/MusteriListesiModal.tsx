import { useMemo } from "react";
import type { Bayi } from "../../../types/app";
import type { WhatsAppMusteriEslesmesi } from "../types";

interface MusteriListesiModalProps {
  acik: boolean;
  bayiler: Bayi[];
  eslesmeler: WhatsAppMusteriEslesmesi[];
  onClose: () => void;
  onAdd: () => void;
  onEdit: (eslesme: WhatsAppMusteriEslesmesi) => void;
}

export function MusteriListesiModal({ acik, bayiler, eslesmeler, onClose, onAdd, onEdit }: MusteriListesiModalProps) {
  const bayiMap = useMemo(() => new Map(bayiler.map((bayi) => [bayi.id, bayi.isim])), [bayiler]);
  if (!acik) return null;

  return (
    <div className="wp-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="wp-modal wp-modal-wide" role="dialog" aria-modal="true" aria-labelledby="wp-musteriler-baslik" onMouseDown={(event) => event.stopPropagation()}>
        <div className="wp-modal-header">
          <div>
            <h3 id="wp-musteriler-baslik">WhatsApp Müşterileri</h3>
            <p>{eslesmeler.length} müşteri bağlantısı</p>
          </div>
          <button type="button" className="wp-icon-button" onClick={onClose} aria-label="Pencereyi kapat">✕</button>
        </div>
        <div className="wp-modal-body wp-customer-list">
          {eslesmeler.length === 0 ? (
            <div className="wp-empty">Henüz WhatsApp müşterisi eklenmedi.</div>
          ) : eslesmeler.map((eslesme) => (
            <button type="button" className="wp-customer-row" key={eslesme.id} onClick={() => onEdit(eslesme)}>
              <span>
                <strong>{bayiMap.get(eslesme.bayi_id) || "Silinmiş müşteri"}</strong>
                <small>{eslesme.telefon}{eslesme.etiket ? ` · ${eslesme.etiket}` : ""}</small>
              </span>
              <span className={`wp-badge ${eslesme.aktif ? "hazir" : ""}`}>{eslesme.aktif ? "Aktif" : "Pasif"}</span>
            </button>
          ))}
        </div>
        <div className="wp-modal-footer">
          <span />
          <div className="wp-footer-actions">
            <button type="button" className="wp-btn wp-btn-secondary" onClick={onClose}>Kapat</button>
            <button type="button" className="wp-btn wp-btn-primary" onClick={onAdd}>+ Müşteri Ekle</button>
          </div>
        </div>
      </div>
    </div>
  );
}
