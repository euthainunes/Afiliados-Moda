import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendEmailProvider } from "@/integrations/email/providers";
import { IntegrationConfigError } from "@/integrations/errors";

// Contrato do adaptador de e-mail real, com a API simulada (nenhum e-mail é enviado de verdade).
const mail = { to: "pessoa@exemplo.test", subject: "Assunto", text: "Corpo" };

afterEach(() => vi.unstubAllGlobals());

describe("ResendEmailProvider", () => {
  it("exige a chave de API", () => {
    expect(() => new ResendEmailProvider(undefined, "x@exemplo.test")).toThrow(IntegrationConfigError);
  });

  it("envia no formato da API e devolve o id", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "msg_ficticio" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ResendEmailProvider("re_chave_ficticia", "Plataforma <nao-responda@exemplo.test>").send(mail);
    expect(result).toEqual({ id: "msg_ficticio" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_chave_ficticia");
    expect(JSON.parse(String(init.body))).toEqual({ from: "Plataforma <nao-responda@exemplo.test>", to: ["pessoa@exemplo.test"], subject: "Assunto", text: "Corpo" });
  });

  it("tenta de novo em erro temporário e não repete erro definitivo", async () => {
    const flaky = vi
      .fn()
      .mockResolvedValueOnce(new Response("erro", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "msg_2" }), { status: 200 }));
    vi.stubGlobal("fetch", flaky);
    expect(await new ResendEmailProvider("re_x", "a@exemplo.test").send(mail)).toEqual({ id: "msg_2" });
    expect(flaky).toHaveBeenCalledTimes(2);

    const invalid = vi.fn(async () => new Response("domínio não verificado", { status: 422 }));
    vi.stubGlobal("fetch", invalid);
    await expect(new ResendEmailProvider("re_x", "a@exemplo.test").send(mail)).rejects.toThrow(/HTTP 422/);
    expect(invalid).toHaveBeenCalledTimes(1);
  });
});
