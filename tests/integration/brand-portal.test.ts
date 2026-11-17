import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { userRoles } from "@/lib/db/schema";
import { resetEnvCache } from "@/lib/env";
import { AccessDeniedError, homeFor } from "@/modules/access/can";
import {
  BrandPortalError,
  brandsVisibleTo,
  grantBrandAccess,
  portalInvoices,
  portalOverview,
  portalSales,
  revokeBrandAccess,
} from "@/modules/brand-portal/service";
import { createSession, validateSessionToken } from "@/modules/identity/sessions";
import { createUser } from "../support/factories";
import { financeScenario } from "../support/finance";

async function rep() {
  const u = await createUser({ roles: [] });
  return u;
}

describe("portal da marca", () => {
  it("representante vê só a própria marca, sem dados de quem comprou nem a divisão interna", async () => {
    const s = await financeScenario();
    const other = await financeScenario();
    const clickId = await s.click({ daysAgo: 1 });
    await s.ingest(s.order(clickId));

    const r = await rep();
    await grantBrandAccess(s.admin.principal, s.t.brand.id, r.email);
    const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, r.id))).map((x) => x.role);
    expect(roles).toContain("brand_rep");
    const principal = { id: r.id, roles };
    expect(homeFor(roles)).toBe("/marca");

    expect((await brandsVisibleTo(principal)).map((b) => b.id)).toEqual([s.t.brand.id]);
    const o = await portalOverview(principal, s.t.brand.id);
    expect(o.clicks).toBeGreaterThanOrEqual(1);
    expect(o.sales).toBe(1);
    expect(o.commissionCents).toBeGreaterThan(0);

    const sales = await portalSales(principal, s.t.brand.id);
    expect(sales.rows).toHaveLength(1);
    // Nenhuma coluna com dados de compradora ou com a parte da criadora/plataforma.
    expect(Object.keys(sales.rows[0]).sort()).toEqual(
      ["baseCents", "commissionCents", "creator", "externalOrderId", "id", "invoiceId", "isDemo", "lookTitle", "registeredAt", "rejectionReason", "state"].sort(),
    );
    expect(await portalInvoices(principal, s.t.brand.id)).toEqual([]);

    // Outra marca: negado em todas as consultas.
    await expect(portalOverview(principal, other.t.brand.id)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(portalSales(principal, other.t.brand.id)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(portalInvoices(principal, other.t.brand.id)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("criadora e operadora não abrem o portal; administradora abre qualquer marca", async () => {
    const s = await financeScenario();
    await expect(portalOverview(s.creator.principal, s.t.brand.id)).rejects.toBeInstanceOf(AccessDeniedError);
    const op = await createUser({ roles: ["user", "operator"] });
    await expect(portalOverview(op.principal, s.t.brand.id)).rejects.toBeInstanceOf(AccessDeniedError);
    expect((await portalOverview(s.admin.principal, s.t.brand.id)).days).toBe(30);
  });

  it("só administradora concede; equipe interna não vira representante; remover encerra sessões e o papel", async () => {
    const s = await financeScenario();
    const op = await createUser({ roles: ["user", "operator"] });
    const r = await rep();
    await expect(grantBrandAccess(op.principal, s.t.brand.id, r.email)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(grantBrandAccess(s.admin.principal, s.t.brand.id, op.email)).rejects.toThrow(/equipe interna/);
    await expect(grantBrandAccess(s.admin.principal, s.t.brand.id, "ninguem@exemplo.test")).rejects.toBeInstanceOf(BrandPortalError);

    await grantBrandAccess(s.admin.principal, s.t.brand.id, r.email);
    await expect(grantBrandAccess(s.admin.principal, s.t.brand.id, r.email)).rejects.toThrow(/já tem acesso/);
    const session = await createSession(r.id);
    await revokeBrandAccess(s.admin.principal, s.t.brand.id, r.id);
    expect(await validateSessionToken(session.token)).toBeNull();
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, r.id));
    expect(roles.map((x) => x.role)).not.toContain("brand_rep");
  });

  it("onde a verificação em duas etapas é obrigatória, a representante sem ela perde o portal", async () => {
    process.env.REQUIRE_STAFF_MFA = "true";
    resetEnvCache();
    try {
      const s = await financeScenario();
      const r = await rep();
      await grantBrandAccess(s.admin.principal, s.t.brand.id, r.email);
      const session = await createSession(r.id);
      const v = (await validateSessionToken(session.token))!;
      expect(v.mfa.enrollmentRequired).toBe(true);
      expect(v.roles).not.toContain("brand_rep");
    } finally {
      delete process.env.REQUIRE_STAFF_MFA;
      resetEnvCache();
    }
  });
});
