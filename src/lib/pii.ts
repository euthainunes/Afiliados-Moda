import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

// Criptografia de campo (AES-256-GCM) para dados pessoais sensíveis, como CPF e chave PIX.
// Fora de produção, sem chave configurada, deriva uma chave de desenvolvimento do AUTH_SECRET.
function key(): Buffer {
  const configured = env().PII_ENCRYPTION_KEY;
  if (configured) {
    const k = Buffer.from(configured, "base64");
    if (k.length !== 32) throw new Error("PII_ENCRYPTION_KEY precisa ter 32 bytes em base64.");
    return k;
  }
  return Buffer.from(env().AUTH_SECRET.padEnd(32, "0").slice(0, 32));
}

export function encryptPii(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptPii(token: string): string {
  const [version, iv, tag, data] = token.split(".");
  if (version !== "v1") throw new Error("Formato de dado criptografado desconhecido.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

// Exibe apenas o final do dado ("***.456.789-**" vira "•••-89").
export function maskTail(value: string, visible = 4): string {
  const clean = value.replace(/\s/g, "");
  return `•••${clean.slice(-visible)}`;
}
