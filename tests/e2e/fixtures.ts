import { randomInt } from "node:crypto";
import { test as base, type Browser, type BrowserContext } from "@playwright/test";

export { expect } from "@playwright/test";

// Cada teste simula um IP de origem diferente (cabeçalho X-Forwarded-For), para que o limite
// de tentativas de login por IP — que está ativo — não seja atingido pela suíte inteira.
export function fakeIpHeader() {
  return { "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` };
}

export async function newIsolatedContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ extraHTTPHeaders: fakeIpHeader() });
}

export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.setExtraHTTPHeaders(fakeIpHeader());
    await provide(context);
  },
});
