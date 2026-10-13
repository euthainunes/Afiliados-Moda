import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { AccessDeniedError } from "@/modules/access/can";
import { listAuditLogs } from "@/modules/audit/queries";
import { recordAudit } from "@/modules/audit/service";
import { listUsers, setUserStatus } from "@/modules/identity/admin";
import { login } from "@/modules/identity/service";
import { validateSessionToken } from "@/modules/identity/sessions";
import { createUser, fakeIp, getUser, TEST_PASSWORD } from "../support/factories";

describe("autorização no servidor", () => {
  it("usuária comum não lista contas nem lê auditoria", async () => {
    const u = await createUser();
    await expect(listUsers(u.principal, {})).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(listAuditLogs(u.principal, {})).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(setUserStatus(u.principal, u.id, "suspended", "teste fictício")).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("operadora vê e-mails mascarados e não lê auditoria", async () => {
    const op = await createUser({ roles: ["user", "operator"] });
    const target = await createUser();
    const { items } = await listUsers(op.principal, { pageSize: 200 });
    const row = items.find((i) => i.id === target.id)!;
    expect(row.email).toMatch(/^.\*\*\*@exemplo\.test$/);
    await expect(listAuditLogs(op.principal, {})).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("administradora vê e-mail completo", async () => {
    const admin = await createUser({ roles: ["user", "admin"] });
    const target = await createUser();
    const { items } = await listUsers(admin.principal, { pageSize: 200 });
    expect(items.find((i) => i.id === target.id)!.email).toBe(target.email);
  });
});

describe("suspensão de contas", () => {
  it("operadora suspende usuária com motivo, encerra sessões e gera auditoria", async () => {
    const op = await createUser({ roles: ["user", "operator"] });
    const target = await createUser();
    const s = await login(target.email, TEST_PASSWORD, { ip: fakeIp() });
    if (!s.ok) throw new Error("login falhou");

    await expect(setUserStatus(op.principal, target.id, "suspended", "abc")).rejects.toThrow(/motivo/);
    await setUserStatus(op.principal, target.id, "suspended", "Uso indevido (teste fictício)");

    expect((await getUser(target.id))?.status).toBe("suspended");
    expect(await validateSessionToken(s.token)).toBeNull();
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, target.id));
    expect(logs.find((l) => l.action === "user.suspended")).toMatchObject({
      actorId: op.id,
      before: { status: "active" },
      after: { status: "suspended", reason: "Uso indevido (teste fictício)" },
    });
  });

  it("operadora não suspende membros da equipe; ninguém suspende a si mesma", async () => {
    const op = await createUser({ roles: ["user", "operator"] });
    const admin = await createUser({ roles: ["user", "admin"] });
    await expect(setUserStatus(op.principal, admin.id, "suspended", "tentativa indevida")).rejects.toThrow(/administradores/);
    await expect(setUserStatus(admin.principal, admin.id, "suspended", "tentativa indevida")).rejects.toThrow(/própria conta/);
  });
});

describe("trilha de auditoria", () => {
  it("é somente inclusão: UPDATE e DELETE são bloqueados pelo banco", async () => {
    const admin = await createUser({ roles: ["user", "admin"] });
    await recordAudit({ actorId: admin.id, action: "teste.ficticio", entityType: "teste" });
    await expect(db.update(auditLogs).set({ action: "adulterado" }).where(eq(auditLogs.actorId, admin.id))).rejects.toThrow();
    await expect(db.delete(auditLogs).where(eq(auditLogs.actorId, admin.id))).rejects.toThrow();
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.actorId, admin.id));
    expect(rows.map((r) => r.action)).toEqual(["teste.ficticio"]);
  });
});
