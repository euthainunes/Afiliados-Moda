import { MFA_REQUIRED_ROLES, ROLE_PERMISSIONS, STAFF_ROLES, type Permission, type Role } from "./permissions";

export type Principal = { id: string; roles: readonly Role[] };

export function permissionsOf(roles: readonly Role[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) result.add(p);
  return result;
}

export function can(principal: Principal | null | undefined, permission: Permission): boolean {
  if (!principal) return false;
  return permissionsOf(principal.roles).has(permission);
}

export function isStaff(roles: readonly Role[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}

export function requiresMfa(roles: readonly Role[]): boolean {
  return roles.some((r) => MFA_REQUIRED_ROLES.includes(r));
}

// Para onde a pessoa vai depois do login, se não houver destino pedido.
export function homeFor(roles: readonly Role[]): string {
  if (isStaff(roles)) return "/admin";
  if (roles.includes("brand_rep") && !roles.includes("user")) return "/marca";
  return "/app";
}

// Checagem de propriedade: a usuária só age sobre recursos dela.
export function owns(principal: Principal | null | undefined, ownerId: string): boolean {
  return !!principal && principal.id === ownerId;
}

// Garante que o aprovador de uma ação sensível é diferente de quem a propôs.
export function assertDifferentApprover(proposerId: string, approverId: string): void {
  if (proposerId === approverId) {
    throw new AccessDeniedError("A aprovação precisa ser feita por outra pessoa.");
  }
}

export class AccessDeniedError extends Error {
  constructor(message = "Acesso negado.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export function assertCan(principal: Principal | null | undefined, permission: Permission): void {
  if (!can(principal, permission)) throw new AccessDeniedError();
}
