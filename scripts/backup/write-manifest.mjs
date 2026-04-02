import fs from "node:fs/promises";
import path from "node:path";

const backupDir = process.env.BACKUP_DIR;
const backupDate = process.env.BACKUP_DATE;
const commitSha = process.env.GITHUB_SHA || "";
const repository = process.env.GITHUB_REPOSITORY || "";

if (!backupDir || !backupDate) {
  throw new Error("BACKUP_DIR or BACKUP_DATE missing");
}

const fileSize = async (filePath) => {
  const stat = await fs.stat(filePath);
  return stat.size;
};

const storageSummaryPath = path.join(backupDir, "storage", "summary.json");
let storageSummary = [];
try {
  storageSummary = JSON.parse(await fs.readFile(storageSummaryPath, "utf8"));
} catch {
  storageSummary = [];
}

const manifest = {
  backupDate,
  repository,
  commitSha,
  generatedAt: new Date().toISOString(),
  files: {
    rolesSqlBytes: await fileSize(path.join(backupDir, "db", "roles.sql")),
    schemaSqlBytes: await fileSize(path.join(backupDir, "db", "schema.sql")),
    dataSqlBytes: await fileSize(path.join(backupDir, "db", "data.sql")),
    envEncryptedBytes: await fileSize(path.join(backupDir, "env", "vercel-production.env.enc")),
  },
  storage: storageSummary,
};

await fs.writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
