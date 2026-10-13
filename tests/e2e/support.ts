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
