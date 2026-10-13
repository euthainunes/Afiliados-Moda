import { describe, expect, it } from "vitest";
import { CommercialError, parseTrackingParams, percentToBps, ruleInputSchema } from "@/modules/commercial/service";
import { toCsv } from "@/modules/reporting/metrics";

describe("percentuais em pontos-base", () => {
  it.each([
    ["25", 2500],
    ["20", 2000],
    ["5", 500],
    ["12,5", 1250],
    ["0.75", 75],
    ["100", 10000],
    ["0", 0],
  ])("%s%% → %i bps", (v, bps) => expect(percentToBps(v)).toBe(bps));

  it("rejeita valores fora do intervalo ou com casas demais", () => {
    for (const v of ["101", "-1", "1,234", "abc", "", "25%"]) expect(percentToBps(v)).toBeNull();
  });

  it("calcula a parcela da plataforma como diferença e impede usuária > comissão", () => {
    const base = { baseType: "item_net_paid", attributionWindowDays: "7", startEvent: "order_invoiced", waitDays: "30", validFrom: "2030-01-01" };
    const ok = ruleInputSchema.parse({ ...base, commission: "25", userShare: "20" });
    expect(ok.commission - ok.userShare).toBe(500);
    expect(ruleInputSchema.safeParse({ ...base, commission: "20", userShare: "25" }).success).toBe(false);
  });
});

describe("parâmetros de rastreamento", () => {
  it("interpreta linhas chave=valor com marcadores conhecidos", () => {
    expect(parseTrackingParams("utm_source=plataforma\n\nutmi_cp={click_id}\nutm_campaign={campaign}")).toEqual({
      utm_source: "plataforma",
      utmi_cp: "{click_id}",
      utm_campaign: "{campaign}",
    });
  });

  it("recusa linhas malformadas, marcadores desconhecidos e valores perigosos", () => {
    for (const bad of ["sem-igual", "=valor", "chave=", "x={usuario_email}", 'x=<script>', "x=a b", "chave inválida=1"]) {
      expect(() => parseTrackingParams(bad), bad).toThrow(CommercialError);
    }
  });
});

describe("CSV", () => {
  it("neutraliza fórmulas e escapa separadores", () => {
    const csv = toCsv([{ a: "=HYPERLINK(\"x\")", b: "texto; com separador", c: 3 }], [{ key: "a", label: "A" }, { key: "b", label: "B" }, { key: "c", label: "C" }]);
    const [, line] = csv.replace("﻿", "").split("\r\n");
    expect(line).toBe(`"'=HYPERLINK(""x"")";"texto; com separador";3`);
  });
});
