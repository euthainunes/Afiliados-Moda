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
  // Portal da marca (somente leitura). O escopo é a marca vinculada (brand_members), conferido nos serviços.
  "brand_portal.access",
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
  // Representante de marca: só o portal, restrito às marcas vinculadas.
  brand_rep: ["brand_portal.access"],
};

// Papéis que dão acesso ao painel interno e, portanto, exigem sessão mais curta (e MFA, na Fase 3b).
export const STAFF_ROLES: readonly Role[] = ["operator", "admin"];

// Papéis que veem dados comerciais e por isso seguem a obrigatoriedade da verificação em duas etapas.
export const MFA_REQUIRED_ROLES: readonly Role[] = [...STAFF_ROLES, "brand_rep"];

// Ações em que quem propõe não pode ser quem aprova ("quatro olhos").
export const FOUR_EYES: Partial<Record<Permission, Permission>> = {
  "commission_rules.approve": "commission_rules.propose",
  "ledger.adjust.approve": "ledger.adjust.propose",
};
