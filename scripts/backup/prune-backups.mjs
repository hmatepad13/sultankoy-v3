import fs from "node:fs/promises";
import path from "node:path";

const [, , repoDir, keepDaysArg] = process.argv;
const keepDays = Number(keepDaysArg || 7);

if (!repoDir) {
  throw new Error("Usage: node prune-backups.mjs <repoDir> [keepDays]");
}

const entries = await fs.readdir(repoDir, { withFileTypes: true });
const datedDirs = entries
  .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort()
  .reverse();

const toDelete = datedDirs.slice(Math.max(keepDays, 0));

for (const dirName of toDelete) {
  await fs.rm(path.join(repoDir, dirName), { recursive: true, force: true });
}
