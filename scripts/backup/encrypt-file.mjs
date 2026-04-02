import fs from "node:fs/promises";
import crypto from "node:crypto";

const [, , inputPath, outputPath] = process.argv;
const passphrase = process.env.BACKUP_ENV_PASSPHRASE;

if (!inputPath || !outputPath) {
  throw new Error("Usage: node encrypt-file.mjs <input> <output>");
}

if (!passphrase) {
  throw new Error("BACKUP_ENV_PASSPHRASE missing");
}

const plaintext = await fs.readFile(inputPath);
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.scryptSync(passphrase, salt, 32);
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();

const payload = {
  algorithm: "aes-256-gcm",
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  tag: tag.toString("base64"),
  ciphertext: ciphertext.toString("base64"),
};

await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
