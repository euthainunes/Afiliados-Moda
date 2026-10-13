import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auditLogs, commissionRules, importRuns, userRoles } from "@/lib/db/schema";
import { AccessDeniedError } from "@/modules/access/can";
import { feedHealth, importAllFeeds } from "@/modules/catalog/scheduler";
import {
  approveRule,
  CommercialError,
  proposeRule,
  rejectRule,
  ruleInEffect,
  saveBrand,
  saveCampaign,
  saveFeed,
} from "@/modules/commercial/service";
import { grantRole, revokeRole, TeamError } from "@/modules/identity/team";
import { exportClickReport } from "@/modules/reporting/metrics";
import { createBrandWithFeed, createUser } from "../support/factories";

const day = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function campaignFor(admin: { principal: { id: string; roles: readonly ("user" | "admin" | "operator" | "brand_rep")[] } }) {
  const key = Math.random().toString(36).slice(2, 8);
  const brandId = await saveBrand(admin.principal, { name: `Marca ${key}`, slug: `marca-op-${key}`, status: "active", allowedDomains: `loja-${key}.example`, trackingParams: "" });
  const campaignId = await saveCampaign(admin.principal, brandId, { name: "Lançamento", slug: "lancamento", status: "active", startsAt: "2026-01-01" });
  return { brandId, campaignId };
}

const ruleInput = (validFrom: Date, over: Record<string, string> = {}) => ({
  baseType: "item_net_paid" as const,
  commission: "25",
  userShare: "20",
  attributionWindowDays: "7",
  startEvent: "order_invoiced" as const,
  waitDays: "30",
  requireBrandPaymentReceived: "on",
  validFrom: isoDate(validFrom),
  contractReference: "Contrato FICTÍCIO de teste",
  ...over,
});

describe("marcas, feeds e campanhas", () => {
  it("valida dados, impede identificador duplicado e audita alterações", async () => {
    const admin = await createUser({ roles: ["user", "admin"] });
    await expect(saveBrand(admin.principal, { name: "X", slug: "Inválido!", status: "active", allowedDomains: "", trackingParams: "" })).rejects.toThrow();
    const { brandId } = await campaignFor(admin);
    const brand = (await db.query.brands.findFirst({ where: (b, { eq }) => eq(b.id, brandId) }))!;
    await expect(saveBrand(admin.principal, { name: "Outra", slug: brand.slug, status: "active", allowedDomains: "outra.example", trackingParams: "" })).rejects.toThrow(CommercialError);
    await saveBrand(admin.principal, { name: brand.name, slug: brand.slug, status: "inactive", allowedDomains: "nova.example", trackingParams: "utmi_cp={click_id}" }, brandId);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, brandId), eq(auditLogs.action, "brand.updated")));
    expect(log.before).toMatchObject({ status: "active" });
    expect(log.after).toMatchObject({ status: "inactive", allowedDomains: ["nova.example"], trackingConfig: { params: { utmi_cp: "{click_id}" } } });
  });

  it("operadora não gerencia marcas; feed exige https", async () => {
    const op = await createUser({ roles: ["user", "operator"] });
    await expect(saveBrand(op.principal, { name: "Y", slug: "y-op", status: "active", allowedDomains: "y.example", trackingParams: "" })).rejects.toBeInstanceOf(AccessDeniedError);
    const admin = await createUser({ roles: ["user", "admin"] });
    const { brandId } = await campaignFor(admin);
    await expect(saveFeed(admin.principal, brandId, "http://loja.example/feed.xml")).rejects.toThrow(/https/);
    await expect(saveFeed(admin.principal, brandId, "file:../../etc/passwd.xml")).rejects.toThrow(CommercialError);
    await saveFeed(admin.principal, brandId, "https://loja.example/feed.xml");
  });

  it("campanha exige fim depois do início", async () => {
    const admin = await createUser({ roles: ["user", "admin"] });
    const { brandId } = await campaignFor(admin);
    await expect(saveCampaign(admin.principal, brandId, { name: "C", slug: "c", status: "draft", startsAt: "2026-05-10", endsAt: "2026-05-01" })).rejects.toThrow();
  });
});

describe("regras de comissão", () => {
  it("exige aprovação por outra administradora, referência de contrato e vigência não retroativa", async () => {
    const ana = await createUser({ roles: ["user", "admin"] });
    const bia = await createUser({ roles: ["user", "admin"] });
    const op = await createUser({ roles: ["user", "operator"] });
    const { campaignId } = await campaignFor(ana);
    const tomorrow = new Date(Date.now() + day);

    await expect(proposeRule(op.principal, campaignId, ruleInput(tomorrow))).rejects.toBeInstanceOf(AccessDeniedError);
    const noContract = await proposeRule(ana.principal, campaignId, ruleInput(tomorrow, { contractReference: "" }));
    await expect(approveRule(bia.principal, noContract)).rejects.toThrow(/contrato/);
    await rejectRule(bia.principal, noContract, "Falta contrato (teste)");

    const past = await proposeRule(ana.principal, campaignId, ruleInput(new Date(Date.now() - 3 * day)));
    await expect(approveRule(bia.principal, past)).rejects.toThrow(/retroativamente/);

    const ok = await proposeRule(ana.principal, campaignId, ruleInput(tomorrow));
    await expect(approveRule(ana.principal, ok)).rejects.toBeInstanceOf(AccessDeniedError); // quatro olhos
    await approveRule(bia.principal, ok);
    const rule = await db.query.commissionRules.findFirst({ where: eq(commissionRules.id, ok) });
    expect(rule).toMatchObject({ status: "approved", commissionBps: 2500, userShareBps: 2000, platformShareBps: 500, version: 3 });
    expect(await ruleInEffect(campaignId, new Date())).toBeNull(); // só vale a partir de amanhã
    expect((await ruleInEffect(campaignId, new Date(Date.now() + 2 * day)))?.id).toBe(ok);
  });

  it("nova versão encerra a anterior sem alterá-la; regra aprovada é imutável no banco", async () => {
    const ana = await createUser({ roles: ["user", "admin"] });
    const bia = await createUser({ roles: ["user", "admin"] });
    const { campaignId } = await campaignFor(ana);
    const v1 = await proposeRule(ana.principal, campaignId, ruleInput(new Date(Date.now() + day)));
    await approveRule(bia.principal, v1);
    const later = new Date(Date.now() + 40 * day);
    const v2 = await proposeRule(ana.principal, campaignId, ruleInput(later, { userShare: "15" }));
    await approveRule(bia.principal, v2);

    const [r1, r2] = await Promise.all([
      db.query.commissionRules.findFirst({ where: eq(commissionRules.id, v1) }),
      db.query.commissionRules.findFirst({ where: eq(commissionRules.id, v2) }),
    ]);
    expect(r1!.userShareBps).toBe(2000);
    expect(r1!.validTo?.getTime()).toBe(r2!.validFrom.getTime());
    expect((await ruleInEffect(campaignId, new Date(Date.now() + 10 * day)))?.id).toBe(v1);
    expect((await ruleInEffect(campaignId, new Date(Date.now() + 50 * day)))?.id).toBe(v2);

    // Tentativas de burlar a aplicação são barradas pelo próprio banco.
    await expect(db.update(commissionRules).set({ userShareBps: 2500, platformShareBps: 0 }).where(eq(commissionRules.id, v1))).rejects.toThrow();
    await expect(db.delete(commissionRules).where(eq(commissionRules.id, v1))).rejects.toThrow();
    await expect(db.update(commissionRules).set({ userShareBps: 3000 }).where(eq(commissionRules.id, v1))).rejects.toThrow(); // soma ≠ comissão
  });

  it("o banco impede duas regras aprovadas com vigências sobrepostas", async () => {
    const ana = await createUser({ roles: ["user", "admin"] });
    const { campaignId } = await campaignFor(ana);
    const base = { campaignId, baseType: "item_net_paid" as const, commissionBps: 2500, userShareBps: 2000, platformShareBps: 500, attributionWindowDays: 7, eligibilityPolicy: { startEvent: "order_invoiced" as const, waitDays: 30, requireBrandPaymentReceived: true }, contractReference: "x", proposedBy: ana.id, status: "approved" as const };
    await db.insert(commissionRules).values({ ...base, version: 1, validFrom: new Date(Date.now() + day) });
    await expect(db.insert(commissionRules).values({ ...base, version: 2, validFrom: new Date(Date.now() + 5 * day) })).rejects.toThrow();
  });
});

describe("equipe", () => {
  it("concede e retira papéis, sempre mantendo uma administradora", async () => {
    await db.delete(userRoles).where(eq(userRoles.role, "admin"));
    const ana = await createUser({ roles: ["user", "admin"] });
    const pessoa = await createUser();
    const op = await createUser({ roles: ["user", "operator"] });

    await expect(grantRole(op.principal, pessoa.email, "operator")).rejects.toBeInstanceOf(AccessDeniedError);
    await grantRole(ana.principal, pessoa.email, "operator");
    await expect(grantRole(ana.principal, pessoa.email, "operator")).rejects.toThrow(TeamError);
    await expect(grantRole(ana.principal, "ninguem@exemplo.test", "admin")).rejects.toThrow(TeamError);

    await expect(revokeRole(ana.principal, ana.id, "admin")).rejects.toThrow(/ao menos uma/);
    await grantRole(ana.principal, pessoa.email, "admin");
    await expect(revokeRole(ana.principal, ana.id, "admin")).rejects.toThrow(/outra administradora/);
    await revokeRole({ id: pessoa.id, roles: ["user", "admin"] }, ana.id, "admin");
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, ana.id));
    expect(logs.map((l) => l.action)).toContain("team.role_revoked");
  });
});

describe("importação agendada e saúde das integrações", () => {
  it("importa feeds ativos, pula os recentes e alerta após falhas seguidas", async () => {
    const t = await createBrandWithFeed([{ sku: "A", title: "Peça A" }]);
    const first = await importAllFeeds();
    expect(first.find((r) => r.feedId === t.feed.id)?.result.status).toBe("succeeded");
    const second = await importAllFeeds();
    expect(second.find((r) => r.feedId === t.feed.id)?.result.status).toBe("skipped");

    await db.insert(importRuns).values([
      { feedId: t.feed.id, status: "failed", startedAt: new Date(Date.now() + 1000), errorMessage: "teste" },
      { feedId: t.feed.id, status: "failed", startedAt: new Date(Date.now() + 2000), errorMessage: "teste" },
    ]);
    const health = (await feedHealth()).find((h) => h.feedId === t.feed.id)!;
    expect(health.consecutiveFailures).toBe(2);
    expect(health.alert).toMatch(/2 importações seguidas falharam/);
  });
});

describe("relatórios", () => {
  it("exportação exige permissão e fica na auditoria", async () => {
    const op = await createUser({ roles: ["user", "operator"] });
    const admin = await createUser({ roles: ["user", "admin"] });
    const period = { from: new Date(Date.now() - 30 * day), to: new Date(Date.now() + day) };
    await expect(exportClickReport(op.principal, period)).rejects.toBeInstanceOf(AccessDeniedError);
    const csv = await exportClickReport(admin.principal, period);
    expect(csv).toContain("Marca;Campanha;Look;Slug;Autora;Cliques válidos");
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.actorId, admin.id), eq(auditLogs.action, "report.exported")));
    expect(logs).toHaveLength(1);
  });
});

