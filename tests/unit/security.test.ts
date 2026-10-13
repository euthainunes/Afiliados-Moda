import { describe, expect, it } from "vitest";
import { buildCsp } from "@/proxy";
import { base32Decode, base32Encode, matchTotp, otpauthUri, stepAt, totpAt } from "@/modules/identity/totp";

// Vetores oficiais da RFC 6238 (apêndice B, SHA-1), truncados para 6 dígitos.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("base32 ida e volta", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_SECRET).toString()).toBe("12345678901234567890");
    expect(() => base32Decode("1nválido")).toThrow();
  });

  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("t=%is gera %s", (t, code) => {
    expect(totpAt(RFC_SECRET, stepAt(t * 1000))).toBe(code);
  });

  it("aceita ±1 intervalo e recusa fora da janela", () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step), { now })).toBe(step);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), { now })).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), { now })).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), { now })).toBeNull();
    expect(matchTotp(RFC_SECRET, "12345", { now })).toBeNull();
    expect(matchTotp(RFC_SECRET, "abcdef", { now })).toBeNull();
  });

  it("recusa código de intervalo já usado (anti-replay)", () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    const code = totpAt(RFC_SECRET, step);
    expect(matchTotp(RFC_SECRET, code, { now, afterStep: step })).toBeNull();
    expect(matchTotp(RFC_SECRET, code, { now, afterStep: step - 1 })).toBe(step);
  });

  it("monta o URI otpauth para o QR code", () => {
    const uri = otpauthUri({ secret: RFC_SECRET, account: "ana@exemplo.test", issuer: "Afiliados Moda" });
    expect(uri).toMatch(/^otpauth:\/\/totp\/Afiliados%20Moda%3Aana%40exemplo\.test\?/);
    expect(uri).toContain(`secret=${RFC_SECRET}`);
    expect(uri).toContain("digits=6");
  });
});

describe("Content Security Policy", () => {
  it("exige o nonce para scripts e bloqueia o restante", () => {
    const csp = buildCsp("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("libera eval só em desenvolvimento e força https quando o site é https", () => {
    expect(buildCsp("n", { dev: true })).toContain("'unsafe-eval'");
    expect(buildCsp("n", { https: true })).toContain("upgrade-insecure-requests");
  });
});
