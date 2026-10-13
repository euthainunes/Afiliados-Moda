import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auditLogs, integrations, integrationSyncLogs, ledgerTransactions, orders, payoutAccounts, users } from "@/lib/db/schema";
import { resetEnvCache } from "@/lib/env";
import { decryptPii } from "@/lib/pii";
import { AccessDeniedError } from "@/modules/access/can";
import { savePayoutAccount } from "@/modules/finance/operations";
import { createOrderIntegration, IntegrationAdminError, setIntegrationMode } from "@/modules/integrations/admin";
import { login } from "@/modules/identity/service";
import { syncOrderIntegration } from "@/modules/orders/sync";
import { deleteMyAccount, exportMyData, updateProfile } from "@/modules/privacy/service";
import { getSetting, updateSetting } from "@/modules/settings/service";
import { getTicket, openTicket, replyTicket } from "@/modules/support/service";
import { systemHealth } from "@/modules/system/health";
import { fictitiousCpf } from "@/demo/seed";
import { createUser, fakeIp, TEST_PASSWORD } from "../support/factories";
import { DAY, financeScenario } from "../support/finance";

afterEach(() => {
  delete process.env.APP_ENV;
  resetEnvCache();
});

describe("sincronização com a loja de demonstração", () => {
  it("é determinística e idempotente, com histórico de sincronização", async () => {
    const s = await financeScenario();
    for (let i = 0; i < 12; i++) await s.click({ daysAgo: 10 + i });
    const first = await syncOrderIntegration(s.integration.id, { since: new Date(Date.now() - 60 * DAY) });
    expect(first.status).toBe("succeeded");
    expect(first.counters.created).toBeGreaterThanOrEqual(2); // inclui os 2 pedidos sem atribuição
    const txBefore = (await db.select({ n: sql<number>`count(*)::int` }).from(ledgerTransactions))[0].n;
    const second = await syncOrderIntegration(s.integration.id, { since: new Date(Date.now() - 60 * DAY) });
    expect(second.counters).toMatchObject({ created: 0, updated: 0, failed: 0 });
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(ledgerTransactions))[0].n).toBe(txBefore);
    const logs = await db.select().from(integrationSyncLogs).where(eq(integrationSyncLogs.integrationId, s.integration.id));
    expect(logs.map((l) => l.status)).toEqual(["succeeded", "succeeded"]);
    const [orphan] = await db.select().from(orders).where(eq(orders.externalOrderId, "DEMO-SEM-CLIQUE"));
    expect(orphan.isDemo).toBe(true);
  });

  it("falha de configuração é registrada sem quebrar e conta falhas seguidas", async () => {
    const s = await financeScenario();
    await db.update(integrations).set({ provider: "vtex", mode: "live", secretEnv: ["VTEX_TESTE_INEXISTENTE_KEY", "VTEX_TESTE_INEXISTENTE_TOKEN"], config: { account: "loja", environment: "vtexcommercestable", clickIdField: "utmiCampaign" } }).where(eq(integrations.id, s.integration.id));
    const r = await syncOrderIntegration(s.integration.id);
    expect(r).toMatchObject({ status: "failed", error: expect.stringContaining("Segredo") });
    const [row] = await db.select().from(integrations).where(eq(integrations.id, s.integration.id));
    expect(row.consecutiveFailures).toBe(1);
  });
});

describe("administração de integrações", () => {
  it("não ativa modo real sem segredos nem demonstração em produção ou com marca real", async () => {
    const s = await financeScenario();
    const admin = await createUser({ roles: ["user", "admin"] });
    const op = await createUser({ roles: ["user", "operator"] });
    await expect(setIntegrationMode(op.principal, s.integration.id, "disabled")).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(setIntegrationMode(admin.principal, s.integration.id, "live")).rejects.toThrow(/demonstração não pode operar em modo real/);

    const [realBrand] = await db.execute<{ id: string }>(sql`insert into brands (name, slug, allowed_domains) values ('Marca Real Teste', ${"real-" + Math.random().toString(36).slice(2, 8)}, '{loja-real.example}') returning id`);
    await expect(createOrderIntegration(admin.principal, { brandId: realBrand.id, provider: "demo" })).rejects.toThrow(IntegrationAdminError);
    const vtex = await createOrderIntegration(admin.principal, { brandId: realBrand.id, provider: "vtex", account: "lojateste", clickIdField: "utmiCampaign" });
    expect(vtex.secretEnv[0]).toMatch(/^VTEX_REAL_.*_APP_KEY$/);
    await expect(setIntegrationMode(admin.principal, vtex.id, "live")).rejects.toThrow(/segredo/);

    process.env.APP_ENV = "production";
    process.env.MAIL_DRIVER = "resend";
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
    resetEnvCache();
    await expect(setIntegrationMode(admin.principal, s.integration.id, "demo")).rejects.toThrow(/produção/);
    process.env.MAIL_DRIVER = "memory";
    delete process.env.PII_ENCRYPTION_KEY;
  });
});

describe("privacidade (LGPD)", () => {
  it("exporta os dados da titular sem CPF ou chave PIX em claro e exclui com anonimização", async () => {
    const u = await createUser();
    const cpf = fictitiousCpf(4242);
    await savePayoutAccount(u.id, { holderName: "Pessoa Fictícia", cpf, pixKeyType: "cpf", pixKey: cpf });
    const [acc] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, u.id));
    expect(acc.cpfEnc).not.toContain(cpf);
    expect(decryptPii(acc.cpfEnc)).toBe(cpf);

    const data = await exportMyData(u.id);
    const text = JSON.stringify(data);
    expect(text).not.toContain(cpf);
    expect(data.conta?.email).toBe(u.email);

    await updateProfile(u.id, { displayName: "Nome Corrigido", username: "nome_corrigido_" + u.id.slice(0, 4), bio: "" });
    await expect(deleteMyAccount(u.id, TEST_PASSWORD, "talvez")).rejects.toThrow(/EXCLUIR/);
    await expect(deleteMyAccount(u.id, "senha-errada", "EXCLUIR")).rejects.toThrow(/Senha/);
    await deleteMyAccount(u.id, TEST_PASSWORD, "EXCLUIR");
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    expect(after).toMatchObject({ status: "deleted" });
    expect(after.email).toMatch(/@anonimizada\.invalid$/);
    expect(await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, u.id))).toHaveLength(0);
    expect((await login(u.email, TEST_PASSWORD, { ip: fakeIp() })).ok).toBe(false);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, u.id));
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["privacy.export", "privacy.account_deleted"]));
  });
});

describe("suporte, configurações e saúde", () => {
  it("atendimento só é visível para a dona e para a equipe", async () => {
    const ana = await createUser();
    const bia = await createUser();
    const op = await createUser({ roles: ["user", "operator"] });
    const t = await openTicket(ana.id, { category: "conta", subject: "Teste de acesso", body: "Mensagem fictícia de teste." });
    expect(await getTicket(bia.principal, t.id)).toBeNull();
    expect(await getTicket(op.principal, t.id)).not.toBeNull();
    await expect(replyTicket(bia.principal, t.id, "invasão")).rejects.toThrow();
    await replyTicket(op.principal, t.id, "Resposta da equipe (teste).");
    expect((await getTicket(ana.principal, t.id))?.ticket.status).toBe("answered");
  });

  it("configurações validam valores, exigem permissão e ficam na auditoria", async () => {
    const admin = await createUser({ roles: ["user", "admin"] });
    const op = await createUser({ roles: ["user", "operator"] });
    await expect(updateSetting(op.principal, "payout.min_cents", "5000")).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(updateSetting(admin.principal, "payout.min_cents", "1")).rejects.toThrow();
    await updateSetting(admin.principal, "payout.min_cents", "3000");
    expect(await getSetting("payout.min_cents")).toBe(3000);
    await updateSetting(admin.principal, "payout.min_cents", "2000");
  });

  it("verificação de saúde aponta banco, migrações e livro-razão", async () => {
    const admin = await createUser({ roles: ["user", "admin"] });
    const { checks } = await systemHealth(admin.principal);
    const by = Object.fromEntries(checks.map((c) => [c.name, c.ok]));
    expect(by["Banco de dados"]).toBe(true);
    expect(by["Migrações aplicadas"]).toBe(true);
    expect(by["Livro-razão balanceado"]).toBe(true);
  });
});
