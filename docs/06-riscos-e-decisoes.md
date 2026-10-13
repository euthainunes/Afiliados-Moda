# 06 — Riscos e decisões pendentes

## 1. Decisões pendentes (registro)

| # | Decisão | Recomendação | Motivo | Quem valida | Bloqueia |
|---|---|---|---|---|---|
| D1 | Base de cálculo da comissão | Valor pago pelos itens atribuídos, líquido de descontos, sem frete e sem impostos destacados | Padrão de mercado; evita comissão sobre frete | Contrato Suntime | Cálculo real |
| D2 | Comissão de 25% | Cadastrar como regra em `draft` até contrato | Não fixar no código | Comercial/jurídico | Ativação |
| D3 | Divisão 20/5 p.p. | Parametrizada; mudanças só para vendas futuras | Adendo §1 | Sócias | — |
| D4 | Marco dos 30 dias | Data de faturamento ou entrega do pedido (não a data da compra) | Reduz risco de devolução após liberação | Jurídico/financeiro | Elegibilidade |
| D5 | Exigir comissão recebida antes de elegibilidade | **Sim** no MVP | Não financiar recompensas com caixa próprio | Financeiro | Elegibilidade |
| D6 | Atribuição por pedido ou por item | Por item quando o identificador permitir; senão por pedido apenas para itens do look | Comissão justa | Produto + contrato | Modelo de `conversions` |
| D7 | Janela de atribuição | 7 dias, último clique | Prática comum; ajustável | Contrato | Atribuição |
| D8 | Autocompra (usuária compra do próprio look) | Permitir com teto mensal ou não remunerar — decidir | Risco de fraude × incentivo | Produto/jurídico | Antifraude |
| D9 | Forma de pagamento à usuária | PIX manual no MVP, PSP em lote depois | Volume baixo inicial | Financeiro | Resgate |
| D10 | Natureza jurídico-tributária da recompensa e exigência de CPF/NF/RPA | Parecer obrigatório | Pode exigir retenção de impostos ou cadastro como prestadora | Contador/jurídico | Lançamento |
| D11 | Saldo negativo após estorno | Compensar com recompensas futuras; nunca cobrar retroativamente sem previsão no regulamento | Adendo §3 | Jurídico | Regulamento |
| D12 | Valor mínimo de resgate | R$ 20 | Custo operacional | Financeiro | Resgate |
| D13 | Mecanismo VTEX de atribuição | Testar UTM/marketingData → customData → app de afiliados → cupom | Ver doc 05 | Técnico Suntime | Fase 7 |
| D14 | Uso das imagens de produto | Usar URLs/CDN da marca, com autorização contratual | Direito de imagem | Contrato | Catálogo |
| D15 | Moderação de looks | A posteriori, com denúncia | Agilidade | Produto | — |
| D16 | Nome, domínio e identidade visual | Definir antes da Fase 2 | Marca/OG | Sócias | UX/UI final |
| D17 | Idade mínima | 18 anos (recebimento de valores) | Capacidade civil | Jurídico | Cadastro |
| D18 | Stack: Supabase vs. Neon+Auth.js | Supabase | Menos peças no MVP | Técnico | Fase 3 |
| D19 | Portal da marca no MVP | Não | Uma marca, relacionamento próximo | Produto | — |
| D20 | Documento principal da ideia | **Enviar o documento original** — só o adendo foi recebido | Evitar premissas erradas | Sócias | Revisão desta Fase 1 |

## 2. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Atribuição VTEX não confiável | Média | **Crítico** | Auditoria primeiro; mecanismos alternativos; métricas de preservação; não atribuir sem evidência |
| Pagar recompensa antes de receber da marca | Média | Alto | D5; faturamento só de vendas validadas; saldo negativo compensável |
| Estorno/chargeback após resgate | Baixa–média | Médio | Marco tardio (D4); regulamento claro; compensação futura |
| Fraude (autocliques, autocompra, compra-e-devolve, contas múltiplas) | Média | Alto | Detecção de autoclique (sessão/IP hash), teto, revisão manual de resgates, CPF único por conta de recebimento |
| Enquadramento tributário/regulatório | Média | Alto | Parecer antes do lançamento (D10) |
| LGPD (dados de compradoras, CPF, PIX) | Baixa | Alto | Minimização; criptografia; DPO/encarregado; política de retenção |
| Catálogo pequeno (1 marca) limita engajamento | Alta | Médio | Pipeline comercial; multi-marca no modelo; curadoria de looks iniciais |
| Feed XML incompleto/instável | Média | Médio | Validação por item, relatório de erros, última versão válida mantida |
| Preço/estoque divergentes no look | Alta | Baixo–médio | Atualização frequente; selo "esgotado"/"preço atualizado"; não exibir preço antigo como atual |
| Imagens OG/compartilhamento mal renderizadas | Média | Médio | Imagem OG gerada no servidor; testes nos validadores das redes |
| Dependência de fornecedor (lock-in) | Baixa | Médio | SQL padrão, migrações próprias, módulos com interfaces |
| Custos de infraestrutura crescendo com cliques | Baixa | Baixo | Particionamento, agregações, limites de gasto |

## 3. Inconsistências e pontos de atenção no material recebido
1. **Documento principal ausente:** apenas o adendo técnico foi recebido; aspectos de produto (público-alvo exato, tom de marca, diferenciais de conteúdo) foram inferidos e estão marcados como recomendação.
2. "Venda registrada na VTEX" vs. "venda atribuída": o adendo lista 4 eventos financeiros e 9 estados de venda — unificados no glossário do doc 05.
3. O exemplo R$ 100 → R$ 25 pressupõe base = valor elegível; com descontos/frete os valores mudam (D1).
4. A hipótese de cobrar a marca antes de repassar à usuária depende de contrato e de capital de giro — tratada como hipótese, não como fluxo definido.
