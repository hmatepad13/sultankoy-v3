import { supabase } from "../../lib/supabase";
import type {
  EslesmeFormu,
  SiparislerVeriPaketi,
  WhatsAppIslemIstegi,
  WhatsAppIslemTuru,
  WhatsAppMusteriEslesmesi,
  WhatsAppSiparisTaslagi,
  WhatsAppTaslakDurumu,
  WhatsAppWorkerDurumu,
} from "./types";

const hataFirlat = (error: { message?: string } | null) => {
  if (error) throw new Error(error.message || "WhatsApp sipariş işlemi başarısız oldu.");
};

export const telefonuNormalizeEt = (telefon: string) => {
  const rakamlar = telefon.replace(/\D/g, "");
  if (rakamlar.startsWith("90")) return rakamlar;
  if (rakamlar.startsWith("0")) return `9${rakamlar}`;
  if (rakamlar.length === 10) return `90${rakamlar}`;
  return rakamlar;
};

export const telefondanJidOlustur = (telefon: string) => {
  const normalizeTelefon = telefonuNormalizeEt(telefon);
  return normalizeTelefon ? `${normalizeTelefon}@s.whatsapp.net` : "";
};

export const siparislerVerileriniGetir = async (): Promise<SiparislerVeriPaketi> => {
  const [istekYaniti, eslesmeYaniti, taslakYaniti, workerYaniti] = await Promise.all([
    supabase
      .from("whatsapp_islem_istekleri")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("whatsapp_musteri_eslesmeleri")
      .select("*")
      .order("updated_at", { ascending: false }),
    supabase
      .from("whatsapp_siparis_taslaklari")
      .select("*")
      .order("mesaj_zamani", { ascending: false })
      .limit(150),
    supabase
      .from("whatsapp_worker_durumu")
      .select("*")
      .eq("id", "oracle-worker")
      .maybeSingle(),
  ]);

  hataFirlat(istekYaniti.error);
  hataFirlat(eslesmeYaniti.error);
  hataFirlat(taslakYaniti.error);
  hataFirlat(workerYaniti.error);

  return {
    istekler: (istekYaniti.data || []) as WhatsAppIslemIstegi[],
    eslesmeler: (eslesmeYaniti.data || []) as WhatsAppMusteriEslesmesi[],
    taslaklar: (taslakYaniti.data || []) as WhatsAppSiparisTaslagi[],
    worker: (workerYaniti.data as WhatsAppWorkerDurumu | null) || null,
  };
};

export const whatsappIslemIstegiOlustur = async (tur: WhatsAppIslemTuru) => {
  const baslangic = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const payload = {
    tur,
    baslangic,
    arama_metni: tur === "test_mesajlari" ? "deneme sultankoy" : null,
  };
  const { data, error } = await supabase
    .from("whatsapp_islem_istekleri")
    .insert(payload)
    .select("*")
    .single();
  hataFirlat(error);
  return data as WhatsAppIslemIstegi;
};

export const eslesmeKaydet = async (form: EslesmeFormu, id?: string) => {
  const telefon = telefonuNormalizeEt(form.telefon);
  const payload = {
    bayi_id: form.bayi_id,
    telefon,
    chat_jid: form.chat_jid.trim() || telefondanJidOlustur(telefon),
    etiket: form.etiket.trim() || null,
    aktif: form.aktif,
    updated_at: new Date().toISOString(),
  };
  const sorgu = id
    ? supabase.from("whatsapp_musteri_eslesmeleri").update(payload).eq("id", id)
    : supabase.from("whatsapp_musteri_eslesmeleri").insert(payload);
  const { error } = await sorgu;
  hataFirlat(error);
};

export const eslesmeSil = async (id: string) => {
  const { error } = await supabase.from("whatsapp_musteri_eslesmeleri").delete().eq("id", id);
  hataFirlat(error);
};

export const taslakGuncelle = async (
  id: string,
  degerler: { yogurt_5kg: number | null; yogurt_3kg: number | null; durum: WhatsAppTaslakDurumu; aciklama: string },
) => {
  const { error } = await supabase
    .from("whatsapp_siparis_taslaklari")
    .update({ ...degerler, updated_at: new Date().toISOString() })
    .eq("id", id);
  hataFirlat(error);
};

export const taslakSil = async (id: string) => {
  const { error } = await supabase.from("whatsapp_siparis_taslaklari").delete().eq("id", id);
  hataFirlat(error);
};

export const istekSil = async (id: string) => {
  const { error } = await supabase.from("whatsapp_islem_istekleri").delete().eq("id", id);
  hataFirlat(error);
};
