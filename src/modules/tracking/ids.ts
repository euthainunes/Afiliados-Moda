import { randomBytes } from "node:crypto";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encode(bytes: Buffer, alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Código curto do link /r/{code}: 10 caracteres base62 (~59 bits), impossível de adivinhar na prática.
export function newTrackingCode(): string {
  // Rejeição de bytes ≥ 248 evita viés de módulo (248 = 4 × 62).
  const chars: string[] = [];
  while (chars.length < 10) {
    for (const b of randomBytes(16)) if (b < 248 && chars.length < 10) chars.push(BASE62[b % 62]);
  }
  return chars.join("");
}

// ULID: 48 bits de tempo + 80 bits aleatórios, em base32 Crockford (26 caracteres, ordenável no tempo).
export function ulid(now = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  return time + encode(randomBytes(16), CROCKFORD, 16);
}
