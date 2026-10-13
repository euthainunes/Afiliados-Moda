import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// TOTP (RFC 6238 sobre RFC 4226): HMAC-SHA1, intervalos de 30 s, 6 dígitos — o padrão aceito por
// Google Authenticator, Microsoft Authenticator, 1Password, Authy etc.
export const TOTP = { periodSec: 30, digits: 6, window: 1 } as const;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Segredo base32 inválido.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// 160 bits, o tamanho recomendado pela RFC 4226 para HMAC-SHA1.
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function stepAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP.periodSec);
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP.digits;
  return code.toString().padStart(TOTP.digits, "0");
}

// Devolve o intervalo correspondente ao código (tolerância de ±1 intervalo para relógios dessincronizados)
// ou null. Códigos de intervalos já usados (<= afterStep) são recusados para impedir reutilização.
export function matchTotp(secret: string, code: string, { now = Date.now(), afterStep = 0 } = {}): number | null {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const current = stepAt(now);
  for (let delta = -TOTP.window; delta <= TOTP.window; delta++) {
    const step = current + delta;
    if (step <= afterStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(normalized))) return step;
  }
  return null;
}

export function otpauthUri({ secret, account, issuer }: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(TOTP.digits), period: String(TOTP.periodSec) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
