import { createClient } from "@supabase/supabase-js";
import {
  formatMs,
  loadAdminEnv,
  requireConfig,
} from "./admin-env.mjs";

const config = loadAdminEnv();
const supabaseUrl = requireConfig(config, "supabaseUrl");
const anonKey = requireConfig(config, "supabaseAnonKey");
const serviceRoleKey = requireConfig(config, "supabaseServiceRoleKey");

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const aktifDonem = new Date().toISOString().slice(0, 7);
const [yilStr, ayStr] = aktifDonem.split("-");
const yil = Number(yilStr);
const ay = Number(ayStr);
const sonrakiAy = ay === 12 ? 1 : ay + 1;
const sonrakiYil = ay === 12 ? yil + 1 : yil;
const donemBaslangici = `${aktifDonem}-01`;
const donemBitisi = `${String(sonrakiYil).padStart(4, "0")}-${String(sonrakiAy).padStart(2, "0")}-01`;

const olcumlu = async (label, promiseFactory) => {
  const start = performance.now();
  const sonuc = await promiseFactory();
  const durationMs = Math.round(performance.now() - start);
  return {
    label,
    durationMs,
    ...sonuc,
  };
};

const startupFetch = async (client) => {
  const tabloSonuclari = [];
  const start = performance.now();

  const ayar = await Promise.all([
    olcumlu("bayiler", async () => {
      const { data, error } = await client.from("bayiler").select("*").order("isim");
      return { rowCount: data?.length || 0, error };
    }),
    olcumlu("urunler", async () => {
      const { data, error } = await client.from("urunler").select("*").order("isim");
      return { rowCount: data?.length || 0, error };
    }),
  ]);
  tabloSonuclari.push(...ayar);

  const satis = await Promise.all([
    olcumlu("satis_fisleri", async () => {
      const { data, error } = await client
        .from("satis_fisleri")
        .select("*")
        .gte("tarih", donemBaslangici)
        .lt("tarih", donemBitisi)
        .order("tarih", { ascending: true })
        .order("id", { ascending: true });
      return { rowCount: data?.length || 0, error };
    }),
    olcumlu("satis_giris", async () => {
      const { data, error } = await client
        .from("satis_giris")
        .select("*")
        .gte("tarih", donemBaslangici)
        .lt("tarih", donemBitisi)
        .order("tarih", { ascending: true })
        .order("id", { ascending: true });
      return { rowCount: data?.length || 0, error };
    }),
  ]);
  tabloSonuclari.push(...satis);

  tabloSonuclari.push(
    await olcumlu("giderler", async () => {
      const { data, error } = await client
        .from("giderler")
        .select("*")
        .gte("tarih", donemBaslangici)
        .lt("tarih", donemBitisi)
        .order("tarih", { ascending: true })
        .order("id", { ascending: true });
      return { rowCount: data?.length || 0, error };
    }),
  );

  const hata = tabloSonuclari.find((item) => item.error);
  if (hata?.error) {
    throw new Error(`${hata.label} sorgusu basarisiz: ${hata.error.message || "bilinmeyen hata"}`);
  }

  return {
    totalMs: Math.round(performance.now() - start),
    tables: tabloSonuclari.map((item) => ({
      table: item.label,
      durationMs: item.durationMs,
      rowCount: item.rowCount,
    })),
  };
};

const testId = Date.now().toString(36);
const email = `perf-bot-${testId}@sistem.local`;
const password = `Perf!${Math.random().toString(36).slice(2, 10)}9`;

let userId = null;

try {
  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Perf Bot" },
  });

  if (createError || !created.user) {
    throw new Error(createError?.message || "Test kullanicisi olusturulamadi.");
  }

  userId = created.user.id;

  await serviceClient.from("profiles").upsert(
    {
      id: userId,
      username: email,
      ad: "Perf Bot",
      role: "calisan",
    },
    { onConflict: "id" },
  );

  console.log(`Test kullanicisi: ${email}`);

  const turlar = [];

  for (let tur = 1; tur <= 3; tur += 1) {
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const loginStart = performance.now();
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    const loginMs = Math.round(performance.now() - loginStart);

    if (signInError) {
      throw new Error(`Giris basarisiz: ${signInError.message}`);
    }

    const fetchSonuc = await startupFetch(client);
    turlar.push({
      tur,
      loginMs,
      totalMs: fetchSonuc.totalMs,
      tables: fetchSonuc.tables,
    });

    await client.auth.signOut();
  }

  console.log("");
  console.log("Headless giris + acilis olcumleri:");
  for (const tur of turlar) {
    console.log(`- Tur ${tur.tur}: giris ${formatMs(tur.loginMs)}, fetch ${formatMs(tur.totalMs)}, toplam ${formatMs(tur.loginMs + tur.totalMs)}`);
  }

  const sonTur = turlar.at(-1);
  if (sonTur) {
    console.log("");
    console.log("Son tur tablo detaylari:");
    for (const row of [...sonTur.tables].sort((a, b) => b.durationMs - a.durationMs)) {
      console.log(`- ${row.table}: ${formatMs(row.durationMs)} | ${row.rowCount} kayit`);
    }
  }
} finally {
  if (userId) {
    await serviceClient.from("profiles").delete().eq("id", userId);
    await serviceClient.auth.admin.deleteUser(userId);
  }
}
