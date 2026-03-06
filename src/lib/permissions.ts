import { ADMIN_KULLANICILARI, VARSAYILAN_SEKME_YETKILERI } from "../constants/app";
import { supabase } from "./supabase";
import type { KullaniciSekmeYetkisi, SekmeYetkiMap } from "../types/app";
import { normalizeUsername, tamamlaSekmeYetkisi } from "../utils/format";

const STORAGE_KEY = "sultankoy-kullanici-sekme-yetkileri-v1";
const TABLE_NAME = "kullanici_yetkileri";

type PermissionSource = "supabase" | "local";

interface PermissionRow {
  username: string;
  tabs: Partial<SekmeYetkiMap> | null;
  updated_at?: string | null;
}

const localOku = (): KullaniciSekmeYetkisi[] => {
  try {
    const ham = localStorage.getItem(STORAGE_KEY);
    if (!ham) return [];
    const parsed = JSON.parse(ham) as KullaniciSekmeYetkisi[];
    return parsed.map((kayit) => ({
      username: normalizeUsername(kayit.username),
      tabs: tamamlaSekmeYetkisi(kayit.tabs),
      updatedAt: kayit.updatedAt,
    }));
  } catch {
    return [];
  }
};

const localYaz = (kayitlar: KullaniciSekmeYetkisi[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kayitlar));
};

const satirCevir = (satir: PermissionRow): KullaniciSekmeYetkisi => ({
  username: normalizeUsername(satir.username),
  tabs: tamamlaSekmeYetkisi(satir.tabs),
  updatedAt: satir.updated_at || undefined,
});

export const adminMi = (username: string) => ADMIN_KULLANICILARI.includes(normalizeUsername(username));

export const kullaniciYetkisiniBul = (
  username: string,
  kayitlar: KullaniciSekmeYetkisi[],
): SekmeYetkiMap => {
  if (adminMi(username)) {
    return { ...VARSAYILAN_SEKME_YETKILERI };
  }

  const kayit = kayitlar.find((item) => normalizeUsername(item.username) === normalizeUsername(username));
  return kayit ? tamamlaSekmeYetkisi(kayit.tabs) : { ...VARSAYILAN_SEKME_YETKILERI };
};

export const kullaniciYetkileriniYukle = async (): Promise<{
  kayitlar: KullaniciSekmeYetkisi[];
  kaynak: PermissionSource;
  uyari?: string;
}> => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("username,tabs,updated_at")
      .order("username");

    if (error) {
      throw error;
    }

    const kayitlar = ((data || []) as PermissionRow[]).map(satirCevir);
    localYaz(kayitlar);
    return { kayitlar, kaynak: "supabase" };
  } catch {
    return {
      kayitlar: localOku(),
      kaynak: "local",
      uyari: "Yetkiler Supabase tablosunda bulunamadı. Bu cihazdaki yerel kayıtlar kullanılıyor.",
    };
  }
};

export const kullaniciYetkileriniKaydet = async (
  kayitlar: KullaniciSekmeYetkisi[],
): Promise<{ kayitlar: KullaniciSekmeYetkisi[]; kaynak: PermissionSource; uyari?: string }> => {
  const normalizeEdilmis = kayitlar
    .map((item) => ({
      username: normalizeUsername(item.username),
      tabs: tamamlaSekmeYetkisi(item.tabs),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

  localYaz(normalizeEdilmis);

  try {
    const payload = normalizeEdilmis.map((item) => ({
      username: item.username,
      tabs: item.tabs,
      updated_at: item.updatedAt,
    }));

    const { error } = await supabase.from(TABLE_NAME).upsert(payload, { onConflict: "username" });

    if (error) {
      throw error;
    }

    return { kayitlar: normalizeEdilmis, kaynak: "supabase" };
  } catch {
    return {
      kayitlar: normalizeEdilmis,
      kaynak: "local",
      uyari: "Yetkiler veritabanına yazılamadı. Değişiklikler bu cihazda saklandı.",
    };
  }
};
