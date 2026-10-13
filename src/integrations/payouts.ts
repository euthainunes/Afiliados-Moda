import { assertDemoAllowed } from "@/lib/env";
import type { PayoutProvider } from "./contracts";

// Registro manual de PIX: a transferência é feita fora da plataforma (internet banking da empresa)
// e aqui só se registra o identificador do comprovante. Nenhum dinheiro é movido pela aplicação.
export class ManualPixPayoutProvider implements PayoutProvider {
  readonly provider = "manual_pix";
  readonly isDemo = false;
  async confirmPayment({ reference }: { reference: string | null }) {
    const ref = reference?.trim() ?? "";
    // Identificador de transação PIX (E2E ID): 32 caracteres alfanuméricos.
    if (!/^[A-Za-z0-9]{32}$/.test(ref)) throw new Error("Informe o identificador da transação PIX (32 caracteres) do comprovante.");
    return { reference: ref, simulated: false };
  }
}

// Demonstração: marca o resgate como pago de forma SIMULADA, sem transferir valores.
export class DemoPayoutProvider implements PayoutProvider {
  readonly provider = "demo";
  readonly isDemo = true;
  constructor() {
    assertDemoAllowed("Pagamento simulado");
  }
  async confirmPayment() {
    return { reference: "SIMULADO — nenhum valor foi transferido", simulated: true };
  }
}
