import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent, redact, reportError } from "@/lib/observability";

afterEach(() => vi.restoreAllMocks());

describe("registro estruturado", () => {
  it("omite segredos e dados pessoais em qualquer nível", () => {
    const out = redact({
      password: "x",
      nested: { authorization: "Bearer y", cpfEnc: "z", list: [{ apiKey: "k", ok: 1 }] },
      code: "123456",
      statusCode: 500,
      email: "maria.silva@exemplo.test",
      msg: "falha ao enviar para joana@exemplo.test",
    });
    expect(out).toEqual({
      password: "[omitido]",
      nested: { authorization: "[omitido]", cpfEnc: "[omitido]", list: [{ apiKey: "[omitido]", ok: 1 }] },
      code: "[omitido]",
      statusCode: 500,
      email: "m***@exemplo.test",
      msg: "falha ao enviar para j***@exemplo.test",
    });
  });

  it("escreve uma linha JSON por evento", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logEvent("info", "cron.teste", { total: 2 });
    const line = JSON.parse(String(spy.mock.calls[0][0]));
    expect(line).toMatchObject({ level: "info", event: "cron.teste", total: 2 });
    expect(line.at).toMatch(/^\d{4}-/);
  });

  it("erro inesperado leva o digest exibido na tela, sem a query string", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("quebrou"), { digest: "123abc" });
    reportError(error, { path: "/redefinir-senha" });
    const line = JSON.parse(String(spy.mock.calls[0][0]));
    expect(line).toMatchObject({ level: "error", event: "erro_inesperado", message: "quebrou", digest: "123abc", path: "/redefinir-senha" });
    expect(line.stack).toContain("Error: quebrou");
  });
});
