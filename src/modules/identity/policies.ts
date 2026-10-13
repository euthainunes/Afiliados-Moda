// Versões vigentes dos documentos legais. Ao mudar, o novo aceite é registrado em `consents`.
// Os textos ainda são RASCUNHOS e dependem de revisão jurídica (docs/06, D10/D11).
export const LEGAL_VERSIONS = {
  terms: "2026-10-rascunho-1",
  privacy: "2026-10-rascunho-1",
  rewards_rules: "2026-10-rascunho-1",
} as const;

// Duração das sessões (docs/02 §5).
export const SESSION_POLICY = {
  user: { idleMs: 30 * 24 * 3600_000, absoluteMs: 90 * 24 * 3600_000 },
  staff: { idleMs: 8 * 3600_000, absoluteMs: 12 * 3600_000 },
  // Intervalo mínimo entre atualizações de "visto por último", para não escrever a cada requisição.
  touchIntervalMs: 15 * 60_000,
  // Prazo para digitar o código do app depois de acertar a senha.
  pendingMfaMs: 10 * 60_000,
} as const;

export const TOKEN_TTL = {
  email_verification: 48 * 3600_000,
  password_reset: 30 * 60_000,
} as const;

// Limites de tentativas (janela fixa).
export const RATE_LIMITS = {
  loginPerEmail: { limit: 8, windowSec: 15 * 60 },
  loginPerIp: { limit: 30, windowSec: 15 * 60 },
  signUpPerIp: { limit: 10, windowSec: 3600 },
  emailPerAddress: { limit: 3, windowSec: 3600 },
  emailPerIp: { limit: 10, windowSec: 3600 },
  // Códigos da verificação em duas etapas (por conta). Com 3 códigos válidos por vez, 10 tentativas
  // a cada 15 min tornam a adivinhação inviável.
  mfaPerUser: { limit: 10, windowSec: 15 * 60 },
} as const;
