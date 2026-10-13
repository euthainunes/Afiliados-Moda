import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";
import { maskSensitive } from "@/modules/audit/service";
import { maskEmail } from "@/modules/identity/admin";
import { resetPasswordSchema, signUpSchema } from "@/modules/identity/validation";

const valid = {
  displayName: "Ana Fictícia",
  email: "  Ana@Exemplo.TEST ",
  password: "uma-senha-longa",
  acceptTerms: "on",
  isAdult: "on",
};

describe("validação de cadastro", () => {
  it("normaliza e-mail e aceita dados válidos", () => {
    const r = signUpSchema.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe("ana@exemplo.test");
  });

  it("exige aceite dos termos e maioridade", () => {
    const r = signUpSchema.safeParse({ ...valid, acceptTerms: undefined, isAdult: undefined });
    expect(r.success).toBe(false);
    const fields = r.error!.issues.map((i) => i.path[0]);
    expect(fields).toContain("acceptTerms");
    expect(fields).toContain("isAdult");
  });

  it("rejeita senha curta e e-mail inválido", () => {
    const r = signUpSchema.safeParse({ ...valid, password: "curta", email: "nao-e-email" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0]).sort()).toEqual(["email", "password"]);
  });

  it("exige confirmação idêntica da nova senha", () => {
    const r = resetPasswordSchema.safeParse({ token: "x".repeat(43), password: "senha-nova-123", confirmPassword: "outra-senha-123" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path).toEqual(["confirmPassword"]);
  });
});

describe("redirecionamento seguro", () => {
  it("aceita apenas caminhos internos", () => {
    expect(safeNext("/app/looks")).toBe("/app/looks");
    expect(safeNext("https://malicioso.example")).toBe("/app");
    expect(safeNext("//malicioso.example")).toBe("/app");
    expect(safeNext("/\\malicioso.example")).toBe("/app");
    expect(safeNext(undefined, "/admin")).toBe("/admin");
  });
});

describe("mascaramento de dados pessoais", () => {
  it("mascara e-mail para quem não pode ver dados pessoais", () => {
    expect(maskEmail("ana@exemplo.test")).toBe("a***@exemplo.test");
  });

  it("mascara campos sensíveis na auditoria, inclusive aninhados", () => {
    expect(maskSensitive({ status: "x", email: "a@b.test", nested: { pixKey: "123", ok: 1 }, list: [{ passwordHash: "h" }] })).toEqual({
      status: "x",
      email: "[mascarado]",
      nested: { pixKey: "[mascarado]", ok: 1 },
      list: [{ passwordHash: "[mascarado]" }],
    });
  });
});
