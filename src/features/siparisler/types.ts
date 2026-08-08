export type WhatsAppIslemTuru = "test_mesajlari" | "siparisleri_getir" | "qr_olustur";
export type WhatsAppIslemDurumu = "bekliyor" | "isleniyor" | "tamamlandi" | "hata";
export type WhatsAppTaslakDurumu = "test" | "hazir" | "kontrol" | "yoksayildi";

export interface WhatsAppIslemIstegi {
  id: string;
  tur: WhatsAppIslemTuru;
  durum: WhatsAppIslemDurumu;
  arama_metni?: string | null;
  baslangic: string;
  sonuc_sayisi: number;
  hata_mesaji?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface WhatsAppMusteriEslesmesi {
  id: string;
  bayi_id: string;
  telefon: string;
  chat_jid: string;
  etiket?: string | null;
  aktif: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppSiparisTaslagi {
  id: string;
  istek_id: string;
  mesaj_id: string;
  bayi_id?: string | null;
  bayi_adi_snapshot?: string | null;
  chat_jid: string;
  chat_adi?: string | null;
  gonderen_jid?: string | null;
  ham_mesaj: string;
  mesaj_zamani: string;
  yogurt_5kg?: number | null;
  yogurt_3kg?: number | null;
  guven?: number | null;
  durum: WhatsAppTaslakDurumu;
  aciklama?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppWorkerDurumu {
  id: string;
  last_seen: string;
  whatsapp_bagli: boolean;
  whatsapp_durum?: "bilinmiyor" | "bagli" | "yeniden_baglaniyor" | "servis_yok" | "oturum_yok" | "qr_hazirlaniyor" | "qr_bekleniyor" | "hata";
  whatsapp_detay?: string | null;
  groq_bagli?: boolean;
  groq_son_kontrol?: string | null;
  qr_kod?: string | null;
  qr_expires_at?: string | null;
  worker_surumu?: string | null;
  aktif_is_id?: string | null;
  son_hata?: string | null;
  updated_at: string;
}

export interface SiparislerVeriPaketi {
  istekler: WhatsAppIslemIstegi[];
  eslesmeler: WhatsAppMusteriEslesmesi[];
  taslaklar: WhatsAppSiparisTaslagi[];
  worker: WhatsAppWorkerDurumu | null;
}

export interface EslesmeFormu {
  bayi_id: string;
  telefon: string;
  chat_jid: string;
  etiket: string;
  aktif: boolean;
}
