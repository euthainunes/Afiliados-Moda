# 05 — Afiliados, recompensas, financeiro e integração VTEX

> Baseado no *Adendo Técnico*. Nenhum pedido, recebimento ou pagamento será simulado como real. Ambientes de teste usam dados marcados com `is_test = true` e **não** geram recompensas reais.

## 1. Glossário de estados (distinções obrigatórias)

| Termo | Definição operacional | Fonte de verdade |
|---|---|---|
| **Clique registrado** | Visitante passou por `/r/{code}`; `click_id` gerado | Tabela `clicks` |
| **Pedido registrado** | Pedido existe na VTEX e foi sincronizado | API VTEX → `orders` |
| **Venda atribuída** | Pedido registrado **com evidência** de um `click_id` válido na janela | `conversions` (estado `registered`) |
| **Venda validada** | Pedido em status final aceito (ex.: faturado/entregue — a definir) **e** prazo de validação cumprido sem cancelamento | `conversions.state = approved` |
| **Comissão calculada** | Valor da comissão segundo a regra (snapshot) | Razão: `brand_commission_receivable` (estimada → confirmada) |
| **Comissão cobrada** | Incluída em fatura emitida à marca | `brand_invoices` |
| **Comissão recebida** | Pagamento da marca registrado e conciliado | `brand_payments` + razão |
| **Recompensa pendente** | Parcela da usuária de venda atribuída ainda não elegível | Razão: `user_rewards_pending` |
| **Recompensa elegível** | Passou na regra de elegibilidade | Razão: `user_rewards_eligible` |
| **Resgate solicitado** | Usuária pediu; valor bloqueado | `payout_requests` + razão `payout_in_progress` |
| **Recompensa paga** | Transferência executada com comprovante | `payouts` + razão `user_rewards_paid` |
| **Cancelamento / devolução / estorno** | Reversão total ou parcial, sempre por novo lançamento | `order_status_history` + razão |

## 2. Cálculo (exemplo ilustrativo do adendo)

Venda elegível de R$ 100,00, regra `commission_bps=2500`, `user_share_bps=2000`, `platform_share_bps=500`:

| Item | Cálculo | Valor |
|---|---|---|
| Base de cálculo | *definida em contrato* (pressuposto: valor elegível = R$ 100) | 10 000 centavos |
| Comissão | 10 000 × 2500 / 10 000 | 2 500 (R$ 25,00) |
| Recompensa da usuária | 10 000 × 2000 / 10 000 | 2 000 (R$ 20,00) |
| Parcela da plataforma | comissão − recompensa | 500 (R$ 5,00) |

Regras de implementação: calcular por item; arredondar a recompensa da usuária (*half-even*) e atribuir o resíduo à plataforma para que **usuária + plataforma = comissão** sempre; gravar a regra usada (`rule_snapshot`) na conversão; mudanças de percentual criam nova versão de regra com `valid_from` futura — nada retroativo.

## 3. Livro-razão — lançamentos por evento

Cada evento cria uma `ledger_transaction` balanceada (soma = 0) com `idempotency_key` determinística.

| Evento | Idempotency key | Lançamentos (simplificado) |
|---|---|---|
| Conversão atribuída | `conv:{id}:registered` | +comissão a receber (estimada) da marca; +recompensa pendente da usuária; +receita estimada da plataforma (contrapartidas em conta de controle) |
| Pedido validado | `conv:{id}:approved` | estimada → confirmada (mesmos valores ou ajustados) |
| Recompensa elegível | `conv:{id}:eligible` | pendente → elegível |
| Cancelamento antes de elegível | `conv:{id}:canceled` | reverte pendente e comissão estimada |
| Devolução parcial | `conv:{id}:return:{eventId}` | reverte proporcional ao item/valor devolvido |
| Estorno após pagamento | `conv:{id}:chargeback:{eventId}` | lança débito da usuária (saldo pode ficar negativo) — **compensação futura conforme regulamento, sem confisco arbitrário** |
| Resgate solicitado | `payout:{id}:requested` | elegível → em resgate |
| Resgate rejeitado | `payout:{id}:rejected` | em resgate → elegível |
| Resgate pago | `payout:{id}:paid` | em resgate → pago (com comprovante) |
| Ajuste manual | `adj:{uuid}` | qualquer conta, **com motivo, referência ao evento original, proponente e aprovador distintos** |

**Valores devidos às usuárias** ficam em contas de passivo (`user_rewards_*`) e nunca são somados à receita. Receita da plataforma = apenas `platform_revenue_*`.

## 4. Política de elegibilidade (configurável)

`eligibility_policy` (JSON na regra de comissão) — exemplo de valores **a validar juridicamente**:

```jsonc
{
  "start_event": "order_invoiced",          // marco: pedido faturado? entregue? (PENDENTE)
  "wait_days": 30,                          // prazo pretendido
  "require_order_status_in": ["invoiced"],  // status final aceito
  "require_no_open_dispute": true,
  "require_brand_payment_received": true,   // recomendado p/ não financiar com caixa próprio (PENDENTE)
  "min_payout_cents": 2000                  // mínimo de resgate (PENDENTE)
}
```

Job diário avalia conversões; **o simples passar de 30 dias não libera** se qualquer condição falhar. A usuária vê o motivo ("aguardando confirmação da loja", "aguardando prazo até dd/mm").

> Observação jurídica: o prazo de 7 dias de arrependimento (CDC art. 49, compras fora do estabelecimento) é referência distinta dos 30 dias do programa; a definição do marco e do prazo deve ser validada por profissional jurídico.

## 5. Fluxo financeiro com a marca (hipótese a validar)

1. Fim do período (ex.: mensal) → fatura com conversões **validadas** ainda não faturadas.
2. Envio à marca (MVP: PDF/CSV gerado no admin + cobrança manual; meio de pagamento **pendente**).
3. Registro do recebimento (valor, data, referência bancária) → conciliação fatura × recebimento.
4. Diferenças viram `reconciliation_items` investigáveis.

Pendências antes de implementar a cobrança: evento que autoriza cobrança, meio (cartão/fatura/transferência), falhas de pagamento, chargebacks, capital de giro, estrutura contábil/tributária (o adendo alerta que cartão não elimina chargeback).

## 6. Integração VTEX

### 6.1 Auditoria inicial (antes de programar) — checklist a enviar à Suntime
- [ ] Nome da conta VTEX (`{account}.vtexcommercestable.com.br`) e se usam checkout padrão, Store Framework/FastStore ou headless.
- [ ] Criação de **AppKey/AppToken** com perfil de acesso **customizado e mínimo** (somente leitura de pedidos no OMS). Sem permissões administrativas amplas.
- [ ] Workspace/ambiente de teste e possibilidade de pedidos de teste (ex.: meio de pagamento de teste) identificados como teste.
- [ ] Disponibilidade de **notificações de pedidos** (Orders Feed v3 ou Hook) para a conta — e se já há outro consumidor configurado (a configuração de hook/feed é por AppKey).
- [ ] Se o checkout grava **`marketingData`** (utmSource, utmMedium, utmCampaign, utmiCampaign, utmipage, utmiPart, coupon) a partir dos parâmetros da URL na loja deles, e se isso sobrevive à navegação até o checkout.
- [ ] Se aceitam um **campo customizado no orderForm (`customData`)** ou instalação de app (ex.: aplicativo de afiliados do ecossistema VTEX) — depende de aprovação técnica da marca.
- [ ] Política de cookies/consentimento da loja (pode bloquear parâmetros/scripts).
- [ ] Limites de requisição, janelas de manutenção, contato técnico.
- [ ] Feed XML real de produtos e se há ID de produto/SKU compatível com o que aparece nos itens do pedido.

> Os nomes de APIs/campos acima são os mecanismos **conhecidos** da VTEX, mas **sua disponibilidade e comportamento na loja da Suntime não estão confirmados**. Nada será assumido até o teste E2E.

### 6.2 Identificador de rastreamento
- `click_id` = ULID gerado no redirecionador, relacionado a usuária, look, produto e campanha na tabela `clicks` (o ID em si não carrega dados pessoais).
- URL de destino montada a partir da URL do produto + parâmetros do mecanismo escolhido. Ex. (candidato A, UTMs): `https://loja/produto/p?utm_source=<plataforma>&utm_medium=look&utm_campaign=<campaign_slug>&utmi_cp=<click_id>` — **formato final a definir após auditoria**.

### 6.3 Mecanismos candidatos de atribuição

| # | Mecanismo | Como | Prós | Contras/limites |
|---|---|---|---|---|
| A | **UTM/utmi → `marketingData` do pedido** | Parâmetros na URL; checkout VTEX tende a registrar no orderForm | Sem desenvolvimento na loja | Pode se perder (navegação, outra sessão, outro dispositivo, consentimento); sobrescrito por outra campanha (último clique da loja) |
| B | **`customData` no orderForm via script/app** | Script na loja grava `click_id` | Campo dedicado, não colide com mídia paga | Exige alteração na loja da marca |
| C | **App de afiliados VTEX** | App do ecossistema que gerencia afiliados e comissões | Suporte nativo, regras na própria VTEX | Instalação/custo; modelo de dados próprio; avaliar exportação |
| D | **Cupom individual por usuária** | Cada usuária tem cupom; pedido traz `coupon` | Funciona entre dispositivos | Exige desconto/promoção; vaza em sites de cupom; perde granularidade de look |
| E | **Conciliação manual autorizada** | Marca envia relatório | Plano de contingência | Baixa escala, baixa confiabilidade; só temporário |

**Recomendação:** testar A primeiro (menor custo); se a taxa de preservação for insuficiente, propor B à Suntime; D como complemento cross-device. Toda conversão grava `attribution_method` e `confidence`.

### 6.4 Sincronização de pedidos
1. **Entrada:** hook/feed → `POST /api/webhooks/vtex` (validação de origem por segredo/credencial do hook) → grava `inbound_events` (idempotente) → enfileira → 200.
2. **Worker:** busca o pedido completo via API de pedidos (fonte de verdade), normaliza status, grava `orders`/`order_items`/`order_status_history` em transação.
3. **Atribuição:** extrai identificador → procura `click` válido → cria `conversion` + lançamentos.
4. **Rede de segurança:** job periódico (ex.: a cada hora) lista pedidos alterados no período e reconcilia o que o hook possa ter perdido.
5. **Falhas:** retentativa com *backoff* exponencial; após N falhas → `failed` + alerta + botão "Reprocessar" no admin.
6. **Mapa de status** (VTEX → interno) configurável, incluindo cancelamento e, se disponível, devolução/estorno (`returned`/`invoiced` com itens devolvidos — a confirmar).

### 6.5 Testes obrigatórios (critérios de aceite da Fase 7)
Os 12 passos do adendo (seção 5.4) viram um **roteiro de teste E2E documentado** com evidências (prints, IDs de pedido de teste, registros do razão), executado em ambiente de teste com `is_test = true`, sem gerar recompensas reais. Métrica-chave: **% de pedidos de teste com `click_id` recuperado** em cenários: mesmo dispositivo/mesma sessão; navegação entre páginas; carrinho abandonado e retorno; troca de dispositivo (esperado: falha em A/B); bloqueio de cookies.

## 7. Critérios de aceite financeiro (go-live)
Reproduzidos do adendo §7 — **todos** precisam estar atendidos e documentados, com aprovação jurídica e financeira registrada, antes de ativar a flag `rewards_live` por marca.
