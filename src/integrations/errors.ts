export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

export class IntegrationConfigError extends IntegrationError {
  constructor(message: string) {
    super(message, false);
    this.name = "IntegrationConfigError";
  }
}

export class HttpError extends IntegrationError {
  constructor(
    readonly status: number,
    message: string,
    retryAfterMs?: number,
  ) {
    // 408, 429 e 5xx são transitórios; 4xx restantes indicam problema de configuração ou de dados.
    super(message, status === 408 || status === 429 || status >= 500, retryAfterMs);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tentativas controladas: só repete erros transitórios, com espera exponencial e respeito a Retry-After.
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  { attempts = 3, baseDelayMs = 500, maxDelayMs = 10_000, onRetry }: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number; onRetry?: (attempt: number, error: unknown) => void } = {},
): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return { value: await fn(attempt), attempts: attempt };
    } catch (error) {
      lastError = error;
      const retryable = error instanceof IntegrationError ? error.retryable : error instanceof TypeError; // TypeError: falha de rede no fetch
      if (!retryable || attempt === attempts) break;
      onRetry?.(attempt, error);
      const wait = error instanceof IntegrationError && error.retryAfterMs ? error.retryAfterMs : baseDelayMs * 2 ** (attempt - 1);
      await sleep(Math.min(wait, maxDelayMs));
    }
  }
  throw lastError;
}

// Limita a cadência de chamadas a uma API externa (intervalo mínimo entre requisições).
export function throttle(minIntervalMs: number) {
  let last = 0;
  return async () => {
    const wait = last + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };
}
