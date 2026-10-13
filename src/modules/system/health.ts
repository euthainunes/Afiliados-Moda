import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env, staffMfaRequired } from "@/lib/env";
import { assertCan, type Principal } from "@/modules/access/can";

export type HealthCheck = { name: string; ok: boolean; detail: string };

// Verificações de saúde: banco, migrações, integridade do livro-razão e configuração do ambiente.
export async function systemHealth(actor: Principal): Promise<{ checks: HealthCheck[]; environment: string }> {
  assertCan(actor, "settings.manage");
  const checks: HealthCheck[] = [];

  const started = performance.now();
  try {
    await db.execute(sql`select 1`);
    checks.push({ name: "Banco de dados", ok: true, detail: `respondeu em ${Math.round(performance.now() - started)} ms` });
  } catch (error) {
    checks.push({ name: "Banco de dados", ok: false, detail: error instanceof Error ? error.message : "falha" });
    return { checks, environment: env().APP_ENV };
  }

  const [{ n: migrations }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
  checks.push({ name: "Migrações aplicadas", ok: migrations > 0, detail: `${migrations} migração(ões)` });

  const [{ n: unbalanced }] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from (select transaction_id from ledger_entries group by transaction_id having sum(amount_cents) <> 0) t`);
  checks.push({ name: "Livro-razão balanceado", ok: unbalanced === 0, detail: unbalanced === 0 ? "todas as transações somam zero" : `${unbalanced} transação(ões) desbalanceada(s)` });

  const [{ n: failing }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from integrations where mode <> 'disabled' and consecutive_failures >= 2`);
  checks.push({ name: "Integrações", ok: failing === 0, detail: failing === 0 ? "sem falhas seguidas" : `${failing} integração(ões) com falhas seguidas` });

  const [{ n: openRecon }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from reconciliation_items where status = 'open'`);
  checks.push({ name: "Conciliação", ok: openRecon === 0, detail: openRecon === 0 ? "nenhuma divergência aberta" : `${openRecon} divergência(s) aberta(s)` });

  const [{ setting }] = await db.execute<{ setting: string | null }>(sql`select current_setting('app.environment', true) as setting`);
  const e = env();
  checks.push({
    name: "Proteção de demonstração no banco",
    ok: e.APP_ENV !== "production" || setting === "production",
    detail: setting === "production" ? "ativa (app.environment = production)" : e.APP_ENV === "production" ? "INATIVA: execute ALTER DATABASE ... SET app.environment = 'production'" : "não exigida fora de produção",
  });
  checks.push({ name: "E-mail", ok: e.APP_ENV !== "production" || e.MAIL_DRIVER === "resend", detail: `provedor: ${e.MAIL_DRIVER}` });
  checks.push({ name: "Criptografia de dados pessoais", ok: e.APP_ENV !== "production" || !!e.PII_ENCRYPTION_KEY, detail: e.PII_ENCRYPTION_KEY ? "chave dedicada configurada" : "usando chave derivada (somente desenvolvimento)" });
  const [{ n: staffWithoutMfa }] = await db.execute<{ n: number }>(sql`
    select count(distinct r.user_id)::int as n from user_roles r
    left join user_mfa m on m.user_id = r.user_id and m.enabled_at is not null
    where r.role in ('operator', 'admin') and m.user_id is null`);
  checks.push({
    name: "Verificação em duas etapas da equipe",
    ok: staffMfaRequired() || e.APP_ENV !== "production",
    detail: staffMfaRequired()
      ? `obrigatória; ${staffWithoutMfa} pessoa(s) da equipe sem cadastro (painel bloqueado para elas)`
      : `não obrigatória neste ambiente (REQUIRE_STAFF_MFA); ${staffWithoutMfa} pessoa(s) da equipe sem cadastro`,
  });
  checks.push({ name: "Agendador", ok: !!process.env.CRON_SECRET, detail: process.env.CRON_SECRET ? "segredo configurado" : "CRON_SECRET ausente: rotinas agendadas recusarão chamadas" });

  return { checks, environment: e.APP_ENV };
}
