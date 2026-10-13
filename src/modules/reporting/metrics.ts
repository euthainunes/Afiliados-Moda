import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, campaigns, clicks, looks, products, profiles, users } from "@/lib/db/schema";
import { assertCan, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";

// Cada indicador tem definição, fonte e natureza (confirmado = contagem de eventos registrados;
// estimado = projeção). Nesta fase todos são confirmados; vendas e comissões entram na Fase 6.
export type Metric = { key: string; label: string; value: number; definition: string; source: string; nature: "confirmado" | "estimado" };

const validClick = and(eq(clicks.isBot, false), eq(clicks.isSelfClick, false));

export async function overviewMetrics(actor: Principal, now = new Date()): Promise<Metric[]> {
  assertCan(actor, "reports.read");
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const [[accounts], [active30], [publishedLooks], [listedProducts], [clicks7], [clicks30]] = await Promise.all([
    db.select({ n: count() }).from(users).where(sql`${users.status} <> 'deleted'`),
    db.select({ n: count() }).from(users).where(and(sql`${users.status} = 'active'`, gte(users.lastLoginAt, since30))),
    db.select({ n: count() }).from(looks).where(eq(looks.status, "published")),
    db.select({ n: count() }).from(products).where(eq(products.status, "listed")),
    db.select({ n: count() }).from(clicks).where(and(validClick, gte(clicks.occurredAt, since7))),
    db.select({ n: count() }).from(clicks).where(and(validClick, gte(clicks.occurredAt, since30))),
  ]);
  return [
    { key: "accounts", label: "Contas", value: accounts.n, definition: "Contas não excluídas.", source: "users", nature: "confirmado" },
    { key: "active30", label: "Ativas (30 dias)", value: active30.n, definition: "Contas ativas com login nos últimos 30 dias.", source: "users.last_login_at", nature: "confirmado" },
    { key: "looks", label: "Looks publicados", value: publishedLooks.n, definition: "Looks com status publicado (exclui removidos e despublicados).", source: "looks", nature: "confirmado" },
    { key: "products", label: "Produtos no catálogo", value: listedProducts.n, definition: "Produtos presentes no último feed de cada marca.", source: "products", nature: "confirmado" },
    { key: "clicks7", label: "Cliques (7 dias)", value: clicks7.n, definition: "Cliques de saída para lojas, sem robôs e sem cliques da própria autora.", source: "clicks", nature: "confirmado" },
    { key: "clicks30", label: "Cliques (30 dias)", value: clicks30.n, definition: "Mesmo critério, últimos 30 dias.", source: "clicks", nature: "confirmado" },
  ];
}

export type ClickReportRow = { brand: string; campaign: string | null; look: string; lookSlug: string | null; creator: string; clicks: number };

export async function clickReport(actor: Principal, { from, to }: { from: Date; to: Date }): Promise<ClickReportRow[]> {
  assertCan(actor, "reports.read");
  return db
    .select({
      brand: brands.name,
      campaign: campaigns.name,
      look: looks.title,
      lookSlug: looks.slug,
      creator: profiles.displayName,
      clicks: sql<number>`count(*)::int`,
    })
    .from(clicks)
    .innerJoin(brands, eq(brands.id, clicks.brandId))
    .innerJoin(looks, eq(looks.id, clicks.lookId))
    .innerJoin(profiles, eq(profiles.userId, clicks.userId))
    .leftJoin(campaigns, eq(campaigns.id, clicks.campaignId))
    .where(and(validClick, gte(clicks.occurredAt, from), lt(clicks.occurredAt, to)))
    .groupBy(brands.name, campaigns.name, looks.id, looks.title, looks.slug, profiles.displayName)
    .orderBy(sql`count(*) desc`)
    .limit(1000);
}

// CSV com proteção contra injeção de fórmulas em planilhas (=, +, -, @ no início da célula).
export function toCsv(rows: Record<string, string | number | null>[], columns: { key: string; label: string }[]): string {
  const cell = (v: string | number | null) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label)).join(";"), ...rows.map((r) => columns.map((c) => cell(r[c.key] ?? null)).join(";"))];
  return "﻿" + lines.join("\r\n");
}

export async function exportClickReport(actor: Principal, period: { from: Date; to: Date }): Promise<string> {
  assertCan(actor, "reports.export");
  const rows = await clickReport(actor, period);
  await recordAudit({
    actorId: actor.id,
    actorRoles: actor.roles,
    action: "report.exported",
    entityType: "report",
    entityId: "clicks",
    after: { from: period.from.toISOString(), to: period.to.toISOString(), rows: rows.length },
  });
  return toCsv(rows, [
    { key: "brand", label: "Marca" },
    { key: "campaign", label: "Campanha" },
    { key: "look", label: "Look" },
    { key: "lookSlug", label: "Slug" },
    { key: "creator", label: "Autora" },
    { key: "clicks", label: "Cliques válidos" },
  ]);
}
