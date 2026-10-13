import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import postgres from "postgres";

export const PASSWORD = "senha-ficticia-e2e";

// Cria uma conta FICTÍCIA verificada diretamente no banco de teste.
export async function seedAccount(roles: string[] = ["user"]) {
  const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgres://afiliados:afiliados_dev@localhost:5432/afiliados_test", { max: 1 });
  const email = `e2e-${randomUUID().slice(0, 8)}@exemplo.test`;
  const passwordHash = await hash(PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const [user] = await sql`insert into users (email, password_hash, email_verified_at) values (${email}, ${passwordHash}, now()) returning id`;
  await sql`insert into profiles (user_id, display_name, username) values (${user.id}, 'Carla Fictícia', ${"e2e_" + user.id.slice(0, 8)})`;
  for (const role of roles) await sql`insert into user_roles (user_id, role) values (${user.id}, ${role})`;
  await sql.end();
  return { email, id: user.id as string };
}

// Cadastra a marca e o feed FICTÍCIOS (a importação em si é feita pela interface do painel no teste).
export async function seedFictitiousBrand() {
  const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgres://afiliados:afiliados_dev@localhost:5432/afiliados_test", { max: 1 });
  const [existing] = await sql`select id from brands where slug = 'marca-ficticia'`;
  if (!existing) {
    const [brand] = await sql`insert into brands (name, slug, allowed_domains, tracking_config, is_fictitious)
      values ('Marca Fictícia', 'marca-ficticia', ${["loja-ficticia.example"]},
      ${sql.json({ params: { utm_source: "afiliadosmoda", utm_medium: "look", utm_campaign: "{campaign}", utmi_cp: "{click_id}" } })}, true)
      returning id`;
    await sql`insert into campaigns (brand_id, name, slug, status, starts_at) values (${brand.id}, 'Campanha fictícia', 'teste-ficticio', 'active', now() - interval '1 day')`;
    await sql`insert into product_feeds (brand_id, source) values (${brand.id}, 'file:feed-ficticio.xml')`;
  }
  await sql.end();
}

export async function clickCount(lookTitle: string) {
  const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgres://afiliados:afiliados_dev@localhost:5432/afiliados_test", { max: 1 });
  const [row] = await sql`select count(*)::int as n from clicks c join looks l on l.id = c.look_id where l.title = ${lookTitle} and c.is_bot = false`;
  await sql.end();
  return row.n as number;
}
