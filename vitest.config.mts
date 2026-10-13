import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "src"),
      // "server-only" lança erro fora do servidor React; nos testes ele é neutralizado.
      "server-only": path.join(root, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/env.ts"],
    // Testes de integração compartilham o banco de teste: execução em série evita interferência.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
