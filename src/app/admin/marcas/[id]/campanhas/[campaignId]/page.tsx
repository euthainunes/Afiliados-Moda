import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { dateFmt, dateTimeFmt, toDateInput } from "@/lib/dates";
import { can } from "@/modules/access/can";
import { BASE_LABELS, bpsToPercent, getBrand, listRules, START_LABELS } from "@/modules/commercial/service";
import { CampaignForm, RuleForm } from "../../../forms";
import { ReviewForms } from "./review-forms";

export const metadata: Metadata = { title: "Campanha" };

const RULE_STATUS = { draft: ["Aguardando aprovação", "warning"], approved: ["Aprovada", "success"], rejected: ["Rejeitada", "danger"] } as const;

export default async function CampaignPage({ params }: { params: Promise<{ id: string; campaignId: string }> }) {
  const { id, campaignId } = await params;
  const session = await requirePermission("brands.manage", `/admin/marcas/${id}/campanhas/${campaignId}`);
  const principal = toPrincipal(session);
  const brandData = await getBrand(principal, id);
  const campaign = brandData?.campaigns.find((c) => c.id === campaignId);
  if (!brandData || !campaign) notFound();
  const rules = await listRules(principal, campaignId);
  const peopleIds = [...new Set(rules.flatMap((r) => [r.proposedBy, r.reviewedBy].filter((x): x is string => !!x)))];
  const people = peopleIds.length
    ? new Map((await db.select({ id: profiles.userId, name: profiles.displayName }).from(profiles).where(inArray(profiles.userId, peopleIds))).map((p) => [p.id, p.name]))
    : new Map<string, string>();
  const now = new Date();
  const inEffect = rules.find((r) => r.status === "approved" && r.validFrom <= now && (!r.validTo || r.validTo > now));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/admin/marcas/${id}`} className="text-sm text-muted hover:underline">← {brandData.brand.name}</Link>
        <PageTitle description={`Identificador: ${campaign.slug}`}>{campaign.name}</PageTitle>
      </div>

      {can(principal, "campaigns.manage") && (
        <Card aria-labelledby="dados-campanha">
          <h2 id="dados-campanha" className="mb-4 text-lg font-semibold">Dados da campanha</h2>
          <CampaignForm
            brandId={id}
            defaults={{ campaignId, name: campaign.name, slug: campaign.slug, status: campaign.status, startsAt: toDateInput(campaign.startsAt), endsAt: toDateInput(campaign.endsAt) }}
          />
        </Card>
      )}

      <Card aria-labelledby="regras">
        <h2 id="regras" className="text-lg font-semibold">Regras de comissão</h2>
        <p className="mt-1 text-sm text-muted">
          Cada mudança cria uma nova versão. Versões aprovadas não podem ser alteradas e nunca valem para vendas anteriores à sua vigência.
          Os percentuais da Suntime (25% / 20 p.p. / 5 p.p.) dependem de confirmação contratual da base de cálculo.
        </p>
        {!inEffect && (
          <div className="mt-4">
            <Alert tone="warning">Nenhuma regra aprovada em vigor hoje: vendas desta campanha não terão comissão calculada.</Alert>
          </div>
        )}
        <ul className="mt-4 flex flex-col gap-4">
          {rules.map((r) => {
            const [label, tone] = RULE_STATUS[r.status];
            return (
              <li key={r.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">Versão {r.version} {r.id === inEffect?.id && <Badge tone="success">em vigor</Badge>}</p>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
                  <dt className="text-muted">Base de cálculo</dt>
                  <dd>{BASE_LABELS[r.baseType]}</dd>
                  <dt className="text-muted">Comissão / usuária / plataforma</dt>
                  <dd className="tabular-nums">
                    {bpsToPercent(r.commissionBps)}% / {bpsToPercent(r.userShareBps)} p.p. / {bpsToPercent(r.platformShareBps)} p.p.
                  </dd>
                  <dt className="text-muted">Janela de atribuição</dt>
                  <dd>{r.attributionWindowDays} dias (último clique)</dd>
                  <dt className="text-muted">Elegibilidade</dt>
                  <dd>
                    {r.eligibilityPolicy.waitDays} dias após: {START_LABELS[r.eligibilityPolicy.startEvent].toLowerCase()}
                    {r.eligibilityPolicy.requireBrandPaymentReceived && "; somente após o pagamento da marca"}
                  </dd>
                  <dt className="text-muted">Vigência</dt>
                  <dd>{dateFmt.format(r.validFrom)} {r.validTo ? `até ${dateFmt.format(r.validTo)}` : "sem data de fim"}</dd>
                  <dt className="text-muted">Contrato</dt>
                  <dd>{r.contractReference ?? <span className="text-warning">não informado</span>}</dd>
                  {r.notes && (<><dt className="text-muted">Observações</dt><dd>{r.notes}</dd></>)}
                  <dt className="text-muted">Proposta por</dt>
                  <dd>{people.get(r.proposedBy) ?? "—"} em {dateTimeFmt.format(r.createdAt)}</dd>
                  {r.reviewedBy && (
                    <>
                      <dt className="text-muted">Revisada por</dt>
                      <dd>{people.get(r.reviewedBy) ?? "—"} em {r.reviewedAt ? dateTimeFmt.format(r.reviewedAt) : "—"}{r.reviewNote ? ` · ${r.reviewNote}` : ""}</dd>
                    </>
                  )}
                </dl>
                {r.status === "draft" && can(principal, "commission_rules.approve") && (
                  r.proposedBy === session.user.id ? (
                    <p className="mt-4 border-t border-line pt-4 text-sm text-muted">Você propôs esta regra; outra administradora precisa revisá-la.</p>
                  ) : (
                    <ReviewForms brandId={id} campaignId={campaignId} ruleId={r.id} />
                  )
                )}
              </li>
            );
          })}
        </ul>
        {can(principal, "commission_rules.propose") && (
          <section aria-labelledby="nova-versao" className="mt-6 rounded-lg border border-line p-4">
            <h3 id="nova-versao" className="mb-4 font-semibold">Propor nova versão</h3>
            <RuleForm brandId={id} campaignId={campaignId} baseLabels={BASE_LABELS} startLabels={START_LABELS} />
          </section>
        )}
      </Card>
    </div>
  );
}
