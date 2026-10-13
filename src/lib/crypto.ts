import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// Token aleatório de 256 bits, seguro para URL (cookies, links de e-mail).
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// HMAC com o segredo da aplicação: pseudonimiza IPs e e-mails usados em chaves de rate limit e logs.
export function hmac(value: string): string {
  return createHmac("sha256", env().AUTH_SECRET).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
