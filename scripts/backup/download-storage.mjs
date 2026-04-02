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

if (!backupDir) throw new Error("BACKUP_DIR missing");
if (!supabaseUrl) throw new Error("SUPABASE_URL missing");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
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

for (const bucket of bucketNames) {
  const bucketDir = path.join(backupDir, "storage", bucket);
  await fs.mkdir(bucketDir, { recursive: true });

  const files = await listFiles(bucket);
  let totalBytes = 0;

  for (const filePath of files) {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error) throw error;
    if (!data) continue;

    const buffer = Buffer.from(await data.arrayBuffer());
    totalBytes += buffer.byteLength;

    const outputPath = path.join(bucketDir, ...filePath.split("/"));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buffer);
  }

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
