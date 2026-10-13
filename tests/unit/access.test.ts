import { describe, expect, it } from "vitest";
import { AccessDeniedError, assertDifferentApprover, can, isStaff, owns, permissionsOf } from "@/modules/access/can";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/modules/access/permissions";

const user = { id: "u1", roles: ["user"] as const };
const operator = { id: "o1", roles: ["user", "operator"] as const };
const admin = { id: "a1", roles: ["user", "admin"] as const };

describe("RBAC", () => {
  it("nega tudo a visitante e a usuária comum", () => {
    for (const p of PERMISSIONS) {
      expect(can(null, p)).toBe(false);
      expect(can(user, p)).toBe(false);
    }
  });

  it("concede todas as permissões ao administrador", () => {
    for (const p of PERMISSIONS) expect(can(admin, p)).toBe(true);
  });

  it("operador não executa operações financeiras sensíveis nem gerencia equipe", () => {
    for (const p of [
      "payouts.approve",
      "payouts.mark_paid",
      "ledger.adjust.approve",
      "commission_rules.approve",
      "brand_payments.record",
      "integrations.manage",
      "team.manage",
      "users.read_pii",
      "audit.read",
      "reports.export",
    ] as const) {
      expect(can(operator, p), p).toBe(false);
    }
    expect(can(operator, "looks.moderate")).toBe(true);
    expect(can(operator, "ledger.adjust.propose")).toBe(true);
  });

  it("representante de marca não tem permissões administrativas no MVP", () => {
    expect(permissionsOf(["brand_rep"]).size).toBe(0);
  });

  it("só referencia permissões existentes", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) for (const p of perms) expect(PERMISSIONS).toContain(p);
  });

  it("identifica equipe interna e propriedade", () => {
    expect(isStaff(["user"])).toBe(false);
    expect(isStaff(["user", "operator"])).toBe(true);
    expect(owns(user, "u1")).toBe(true);
    expect(owns(user, "outra")).toBe(false);
    expect(owns(null, "u1")).toBe(false);
  });

  it("exige aprovador diferente de quem propôs", () => {
    expect(() => assertDifferentApprover("a1", "a1")).toThrow(AccessDeniedError);
    expect(() => assertDifferentApprover("a1", "a2")).not.toThrow();
  });
});
