import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  const satirlar = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const sonuc = {};

  for (const satir of satirlar) {
    const temiz = satir.trim();
    if (!temiz || temiz.startsWith("#")) continue;

    const esittirIndex = temiz.indexOf("=");
    if (esittirIndex <= 0) continue;

    const anahtar = temiz.slice(0, esittirIndex).trim();
    let deger = temiz.slice(esittirIndex + 1).trim();

    if (
      (deger.startsWith("\"") && deger.endsWith("\"")) ||
      (deger.startsWith("'") && deger.endsWith("'"))
    ) {
      deger = deger.slice(1, -1);
    }

    sonuc[anahtar] = deger;
  }

  return sonuc;
};

const okuJson = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
};

export const adminEnvDosyaYolu = path.join(rootDir, ".env.admin.local");
export const adminEnvOrnekDosyaYolu = path.join(rootDir, ".env.admin.local.example");

export const loadAdminEnv = () => {
  const genelEnv = parseEnvFile(path.join(rootDir, ".env"));
  const adminEnv = parseEnvFile(adminEnvDosyaYolu);
  const vercelProject = okuJson(path.join(rootDir, ".vercel", "project.json"));

  return {
    rootDir,
    supabaseUrl: adminEnv.SUPABASE_URL || genelEnv.VITE_SUPABASE_URL || "",
    supabaseAnonKey: adminEnv.SUPABASE_ANON_KEY || genelEnv.VITE_SUPABASE_ANON_KEY || "",
    supabaseServiceRoleKey: adminEnv.SUPABASE_SERVICE_ROLE_KEY || "",
    supabaseDbUrl: adminEnv.SUPABASE_DB_URL || "",
    vercelToken: adminEnv.VERCEL_TOKEN || "",
    vercelProjectId: adminEnv.VERCEL_PROJECT_ID || vercelProject.projectId || "",
    vercelOrgId: adminEnv.VERCEL_ORG_ID || vercelProject.orgId || "",
    vercelProjectName: adminEnv.VERCEL_PROJECT_NAME || vercelProject.projectName || "",
  };
};

export const requireConfig = (config, key) => {
  const deger = config[key];
  if (!deger) {
    throw new Error(`${key} eksik. ${adminEnvDosyaYolu} içine ekleyin.`);
  }
  return deger;
};

export const maskValue = (deger) => {
  if (!deger) return "eksik";
  if (deger.length <= 10) return `${deger.slice(0, 3)}...`;
  return `${deger.slice(0, 5)}...${deger.slice(-4)}`;
};

export const nowIsoMinusDays = (days) => {
  const tarih = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return tarih.toISOString();
};

export const percentile = (sayilar, oran) => {
  if (!sayilar.length) return 0;
  const sirali = [...sayilar].sort((a, b) => a - b);
  const index = (sirali.length - 1) * oran;
  const alt = Math.floor(index);
  const ust = Math.ceil(index);
  if (alt === ust) return sirali[alt];
  const agirlik = index - alt;
  return sirali[alt] * (1 - agirlik) + sirali[ust] * agirlik;
};

export const formatMs = (deger) => `${Math.round(Number(deger) || 0).toLocaleString("tr-TR")} ms`;

export const getSupabaseHeaders = (config) => ({
  apikey: requireConfig(config, "supabaseServiceRoleKey"),
  Authorization: `Bearer ${requireConfig(config, "supabaseServiceRoleKey")}`,
  "Content-Type": "application/json",
});

export const supabaseRestFetch = async (config, query) => {
  const baseUrl = requireConfig(config, "supabaseUrl").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/rest/v1/${query}`, {
    headers: getSupabaseHeaders(config),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase istegi basarisiz (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : null;
};

export const vercelApiFetch = async (config, endpoint) => {
  const token = requireConfig(config, "vercelToken");
  const joiner = endpoint.includes("?") ? "&" : "?";
  const scope = config.vercelOrgId ? `${joiner}teamId=${encodeURIComponent(config.vercelOrgId)}` : "";
  const response = await fetch(`https://api.vercel.com${endpoint}${scope}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vercel istegi basarisiz (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : null;
};
