import { index, pgEnum, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

// O mapeamento papel → permissões fica versionado em código (src/modules/access/permissions.ts),
// revisado por PR. O banco guarda apenas quais papéis cada conta possui.
export const roleName = pgEnum("role_name", ["user", "operator", "admin", "brand_rep"]);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleName("role").notNull(),
    // Escopo de marca para representantes (v1). A FK para brands entra quando a tabela existir (Fase 5).
    brandId: uuid("brand_id"),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "restrict" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] }), index("user_roles_role_idx").on(t.role)],
);
