// Cria a conta administrativa FICTÍCIA de desenvolvimento. Nunca execute em produção.
// Uso: pnpm db:seed (lê SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD de .env.local)
import { config } from "dotenv";
config({ path: process.env.DOTENV_PATH ?? ".env.local" });

const { NODE_ENV, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
if (NODE_ENV === "production") throw new Error("Seed de desenvolvimento não pode rodar em produção.");
if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD || SEED_ADMIN_PASSWORD.length < 10) {
  throw new Error("Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo de 10 caracteres).");
}
if (!SEED_ADMIN_EMAIL.endsWith(".test")) {
  throw new Error("Use um e-mail fictício com domínio .test (ex.: admin@exemplo.test).");
}

const { eq } = await import("drizzle-orm");
const { db } = await import("@/lib/db");
const { profiles, userRoles, users, consents } = await import("@/lib/db/schema");
const { hashPassword } = await import("@/modules/identity/password");
const { LEGAL_VERSIONS } = await import("@/modules/identity/policies");

const email = SEED_ADMIN_EMAIL.toLowerCase();
const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
if (existing) {
  console.info(`Conta fictícia ${email} já existe; nada a fazer.`);
} else {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash: await hashPassword(SEED_ADMIN_PASSWORD), emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    await tx.insert(profiles).values({ userId: user.id, displayName: "Admin Fictícia (dev)", username: "admin_ficticia" });
    await tx.insert(userRoles).values([
      { userId: user.id, role: "user" },
      { userId: user.id, role: "admin" },
    ]);
    await tx.insert(consents).values(
      (Object.keys(LEGAL_VERSIONS) as (keyof typeof LEGAL_VERSIONS)[]).map((document) => ({
        userId: user.id,
        document,
        version: LEGAL_VERSIONS[document],
      })),
    );
  });
  console.info(`Conta administrativa FICTÍCIA criada: ${email}`);
}

// ---- Catálogo e looks FICTÍCIOS de demonstração ----
const { brands, campaigns, productFeeds, products } = await import("@/lib/db/schema");
const { importFeed } = await import("@/modules/catalog/importer");
const { createLook, addItem, updateDetails, publishLook } = await import("@/modules/looks/service");

let brand = await db.query.brands.findFirst({ where: eq(brands.slug, "marca-ficticia") });
if (!brand) {
  [brand] = await db
    .insert(brands)
    .values({
      name: "Marca Fictícia",
      slug: "marca-ficticia",
      website: "https://loja-ficticia.example",
      allowedDomains: ["loja-ficticia.example"],
      // Parâmetros de exemplo. Para marcas reais, só depois da auditoria da plataforma de e-commerce (docs/05 §6).
      trackingConfig: { params: { utm_source: "afiliadosmoda", utm_medium: "look", utm_campaign: "{campaign}", utmi_cp: "{click_id}" } },
      isFictitious: true,
    })
    .returning();
  await db.insert(campaigns).values({
    brandId: brand.id,
    name: "Campanha fictícia de testes",
    slug: "teste-ficticio",
    status: "active",
    startsAt: new Date("2026-01-01T00:00:00Z"),
  });
  await db.insert(productFeeds).values({ brandId: brand.id, source: "file:feed-ficticio.xml" });
  console.info("Marca, campanha e feed FICTÍCIOS criados.");
}

const feed = await db.query.productFeeds.findFirst({ where: eq(productFeeds.brandId, brand.id) });
const result = await importFeed(feed!.id, null);
console.info(`Importação do feed fictício: ${result.status}`, result.stats ?? result.error ?? "");

const demoEmail = "criadora-demo@exemplo.test";
let demo = await db.query.users.findFirst({ where: eq(users.email, demoEmail) });
if (!demo) {
  [demo] = await db
    .insert(users)
    .values({ email: demoEmail, passwordHash: await hashPassword(SEED_ADMIN_PASSWORD), emailVerifiedAt: new Date() })
    .returning();
  await db.insert(profiles).values({ userId: demo.id, displayName: "Criadora Demo (fictícia)", username: "criadora_demo", bio: "Perfil fictício de demonstração." });
  await db.insert(userRoles).values({ userId: demo.id, role: "user" });

  const byTitle = async (title: string) => (await db.query.products.findFirst({ where: eq(products.title, title) }))!.id;
  const demoLooks: [string, string, string[]][] = [
    ["Fim de semana na praia", "Leve, fresco e pronto para o sol.", ["Vestido Longo Linho", "Bolsa de Palha", "Sandália Tiras Finas", "Óculos de Sol Gatinho"]],
    ["Escritório sem esforço", "Alfaiataria confortável para o dia todo.", ["Blazer Linho Estruturado", "Blusa Seda Decote V", "Calça Pantalona Alfaiataria", "Mule Bico Quadrado"]],
    ["Jeans com jeans", "Duas lavagens, zero erro.", ["Jaqueta Jeans Cropped", "Regata Canelada", "Calça Jeans Reta", "Tênis Branco Couro"]],
  ];
  for (const [title, description, items] of demoLooks) {
    const lookId = await createLook(demo.id);
    for (const t of items) await addItem(demo.id, lookId, await byTitle(t));
    await updateDetails(demo.id, lookId, { title, description });
    await publishLook(demo.id, lookId);
  }
  console.info(`Criadora fictícia (${demoEmail}) e 3 looks de demonstração publicados.`);
}
process.exit(0);
