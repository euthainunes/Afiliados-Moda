import { hash, verify } from "@node-rs/argon2";

// Parâmetros argon2id recomendados pela OWASP (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Hash fixo usado quando a conta não existe, para que o tempo de resposta não revele e-mails cadastrados.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("senha-ficticia-para-equalizar-tempo");
  return dummyHash;
}
