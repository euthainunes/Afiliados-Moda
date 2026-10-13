import { bigint, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { products } from "./catalog";
import { users } from "./identity";

export const lookStatus = pgEnum("look_status", ["draft", "published", "unpublished", "removed"]);

export const looks = pgTable(
  "looks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull().default(""),
    description: text("description"),
    // Definido na primeira publicação e nunca mais alterado: a URL compartilhada não pode quebrar.
    slug: text("slug").unique(),
    status: lookStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    removedReason: text("removed_reason"),
    removedBy: uuid("removed_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("looks_user_idx").on(t.userId, t.updatedAt),
    index("looks_published_idx").on(t.status, t.publishedAt),
  ],
);

export const lookItems = pgTable(
  "look_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lookId: uuid("look_id")
      .notNull()
      .references(() => looks.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    // Preço no momento em que a peça entrou no look (histórico; a página pública mostra o preço atual).
    priceAtAddCents: bigint("price_at_add_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("look_items_look_product_idx").on(t.lookId, t.productId), index("look_items_look_idx").on(t.lookId, t.position)],
);
