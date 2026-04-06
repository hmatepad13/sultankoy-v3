import {
  adminEnvDosyaYolu,
  loadAdminEnv,
  maskValue,
  supabaseRestFetch,
  vercelApiFetch,
} from "./admin-env.mjs";

const config = loadAdminEnv();

console.log(`Admin env: ${adminEnvDosyaYolu}`);
console.log(`Supabase URL: ${config.supabaseUrl || "eksik"}`);
console.log(`Service role key: ${maskValue(config.supabaseServiceRoleKey)}`);
console.log(`Vercel token: ${maskValue(config.vercelToken)}`);
console.log(`Vercel proje: ${config.vercelProjectName || "eksik"} (${config.vercelProjectId || "id yok"})`);
console.log("");

let basarisiz = false;

if (!config.supabaseServiceRoleKey) {
  basarisiz = true;
  console.log("Supabase: eksik. SUPABASE_SERVICE_ROLE_KEY girilmemis.");
} else {
  try {
    const kayitlar = await supabaseRestFetch(
      config,
      "client_logs?select=id,created_at&order=created_at.desc&limit=1",
    );
    const sonKayit = Array.isArray(kayitlar) ? kayitlar[0] : null;
    console.log(`Supabase: baglanti tamam. Son client log: ${sonKayit?.created_at || "kayit yok"}`);
  } catch (error) {
    basarisiz = true;
    console.log(`Supabase: hata. ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (!config.vercelToken) {
  basarisiz = true;
  console.log("Vercel: eksik. VERCEL_TOKEN girilmemis.");
} else {
  try {
    const proje = await vercelApiFetch(config, `/v9/projects/${config.vercelProjectId}`);
    const deployments = await vercelApiFetch(
      config,
      `/v6/deployments?projectId=${encodeURIComponent(config.vercelProjectId)}&target=production&limit=1`,
    );
    const sonDeploy = deployments?.deployments?.[0] || null;
    console.log(`Vercel: baglanti tamam. Proje: ${proje?.name || config.vercelProjectName}`);
    console.log(`Son production deploy: ${sonDeploy?.url || "bulunamadi"}`);
  } catch (error) {
    basarisiz = true;
    console.log(`Vercel: hata. ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (basarisiz) {
  console.log("");
  console.log("Eksik alanlari .env.admin.local icine doldurup komutu tekrar calistirin.");
  process.exitCode = 1;
} else {
  console.log("");
  console.log("Kalici admin erisimi hazir.");
}
