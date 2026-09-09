import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const backupDir = process.env.BACKUP_DIR;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketNames = String(process.env.BACKUP_BUCKETS || "fis_gorselleri")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const DOWNLOAD_CONCURRENCY = 8;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const DOWNLOAD_RETRY_COUNT = 3;

if (!backupDir) throw new Error("BACKUP_DIR missing");
if (!supabaseUrl) throw new Error("SUPABASE_URL missing");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const fetchWithTimeout = async (input, init = {}) => {
  const timeoutSignal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
};

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
  global: { fetch: fetchWithTimeout },
});

const listFiles = async (bucket, prefix = "") => {
  const files = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) {
        files.push(...(await listFiles(bucket, fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    if (data.length < 100) break;
    offset += data.length;
  }

  return files;
};

const summary = [];

const parallelCalistir = async (items, worker) => {
  let sonrakiIndeks = 0;
  const calisanSayisi = Math.min(DOWNLOAD_CONCURRENCY, items.length);
  await Promise.all(
    Array.from({ length: calisanSayisi }, async () => {
      while (true) {
        const indeks = sonrakiIndeks;
        sonrakiIndeks += 1;
        if (indeks >= items.length) return;
        await worker(items[indeks]);
      }
    }),
  );
};

const dosyayiIndir = async (bucket, bucketDir, filePath) => {
  let sonHata;
  for (let deneme = 1; deneme <= DOWNLOAD_RETRY_COUNT; deneme += 1) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(filePath);
      if (error) throw error;
      if (!data) return 0;

      const buffer = Buffer.from(await data.arrayBuffer());
      const outputPath = path.join(bucketDir, ...filePath.split("/"));
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, buffer);
      return buffer.byteLength;
    } catch (error) {
      sonHata = error;
      if (deneme < DOWNLOAD_RETRY_COUNT) await sleep(deneme * 1_000);
    }
  }
  throw new Error(`${filePath} indirilemedi: ${sonHata instanceof Error ? sonHata.message : String(sonHata)}`);
};

for (const bucket of bucketNames) {
  const bucketDir = path.join(backupDir, "storage", bucket);
  await fs.mkdir(bucketDir, { recursive: true });

  const files = await listFiles(bucket);
  let totalBytes = 0;

  await parallelCalistir(files, async (filePath) => {
    totalBytes += await dosyayiIndir(bucket, bucketDir, filePath);
  });

  summary.push({
    bucket,
    fileCount: files.length,
    totalBytes,
  });
}

await fs.writeFile(
  path.join(backupDir, "storage", "summary.json"),
  JSON.stringify(summary, null, 2),
  "utf8",
);
