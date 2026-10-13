// Catálogo de permissões e papéis (docs/02 §5). Fonte de verdade versionada: mudanças passam por revisão de código.
// Regra: negar por padrão. Dados da própria usuária são protegidos por checagem de propriedade, não por permissão.

export const PERMISSIONS = [
  "admin.access",
  "users.read",
  "users.read_pii",
  "users.suspend",
  "team.manage",
  "brands.manage",
  "integrations.manage",
  "campaigns.manage",
  "commission_rules.propose",
  "commission_rules.approve",
  "catalog.manage",
  "looks.moderate",
  "clicks.read",
  "orders.read",
  "events.reprocess",
  "ledger.read",
  "ledger.adjust.propose",
  "ledger.adjust.approve",
  "payouts.review",
  "payouts.approve",
  "payouts.mark_paid",
  "brand_payments.record",
  "reconciliation.manage",
  "reports.read",
  "reports.export",
  "audit.read",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["user", "operator", "admin", "brand_rep"] as const;
export type Role = (typeof ROLES)[number];

const OPERATOR: readonly Permission[] = [
  "admin.access",
  "users.read",
  "users.suspend",
  "catalog.manage",
  "looks.moderate",
  "clicks.read",
  "orders.read",
  "events.reprocess",
  "ledger.read",
  "ledger.adjust.propose",
  "payouts.review",
  "reports.read",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // A usuária só acessa os próprios dados (checagem de propriedade nos serviços).
  user: [],
  operator: OPERATOR,
  admin: PERMISSIONS,
  // Portal da marca é pós-MVP; o escopo por marca será adicionado com ele.
  brand_rep: [],
};

// Papéis que dão acesso ao painel interno e, portanto, exigem sessão mais curta (e MFA, na Fase 3b).
export const STAFF_ROLES: readonly Role[] = ["operator", "admin"];

// Ações em que quem propõe não pode ser quem aprova ("quatro olhos").
export const FOUR_EYES: Partial<Record<Permission, Permission>> = {
  "commission_rules.approve": "commission_rules.propose",
  "ledger.adjust.approve": "ledger.adjust.propose",
};
