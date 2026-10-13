# 12 — Guia de integrações: como conectar cada serviço real

> Regra geral: **nenhuma integração é declarada pronta sem credenciais, acesso e teste reais.** Todas abaixo têm contrato (`src/integrations/contracts.ts`), adaptador e registro central (`src/integrations/registry.ts`). As páginas e serviços nunca sabem se o dado é de demonstração; a troca é feita por configuração.

## Como a troca demonstração → real funciona
| Camada | Demonstração | Real | Onde se troca |
|---|---|---|---|
| Pedidos das lojas | `DemoOrderSource` (loja simulada para marcas fictícias) | `VtexOrderSource` | Painel → Integrações (modo `demo`/`live`/`disabled`) |
| E-mail | `console` (terminal) / `memory` (testes) | `resend` | Variável `MAIL_DRIVER` |
| Pagamento de resgates | `DemoPayoutProvider` (marca "pago (simulado)") | `ManualPixPayoutProvider` (exige ID do PIX) | Automático: resgate financiado por saldo de demonstração usa o simulado |
| Catálogo | `file:feed-ficticio.xml` | URL https do feed da marca | Painel → Marcas → Feeds |

**Barreiras contra uso acidental de demonstração em produção**
1. `APP_ENV=production` faz `assertDemoAllowed()` recusar adaptadores, seed, resgates e pagamentos simulados.
2. O painel não permite ativar modo demonstração em produção, nem usar a loja simulada com marca real.
3. No banco de produção (`ALTER DATABASE … SET app.environment = 'production'`), triggers recusam qualquer linha `is_demo = true` em pedidos, conversões, livro-razão e resgates.
4. Em produção, `env()` exige provedor de e-mail real e chave de criptografia de dados pessoais.
5. Todo dado fictício é marcado (`is_demo`, marca `is_fictitious`, e-mails `.test`, selo "demonstração" nas telas).

---

## 1. Feed de produtos (XML) — Suntime
1. **Finalidade:** manter o catálogo (produtos, preços, estoque, imagens).
2. **Dados recebidos:** id/grupo do produto, título, descrição, link, imagens, preço, preço promocional, disponibilidade, categoria, cor, tamanho. **Nada é enviado.**
3. **Credenciais:** nenhuma, se a URL for pública; se exigir autenticação, informar o método (a implementar).
4. **Autenticação:** — (URL https).
5. **Endpoint:** URL do feed fornecida pela Suntime. Formato implementado: Google Merchant (RSS 2.0). **A confirmar com o XML real**; outro formato = novo leitor em `src/modules/catalog/feed-parser.ts`.
6. **Armazenamento:** `products`, `product_variants`, `product_price_history`; agendamento a cada 6 h (`/api/cron/importar-feeds`).
7. **Erros e duplicidade:** importação em transação única (tudo ou nada), trava contra execução simultânea, upsert por `(marca, id externo)`, itens inválidos rejeitados com motivo, feed muito menor que o esperado não retira produtos, alertas após 2 falhas seguidas.
8. **Teste antes de ativar:** cadastrar a marca com domínios autorizados → feed → "Importar agora" em homologação → revisar itens rejeitados e categorias.
- **Necessário da Suntime:** URL do XML, domínio dos links de produto, domínio (CDN) das imagens (vai em `IMAGE_REMOTE_HOSTS`), autorização de uso das imagens (D14).

## 2. VTEX — pedidos e atribuição
1. **Finalidade:** receber pedidos e mudanças de situação para atribuir vendas e calcular comissões.
2. **Dados recebidos:** id do pedido, datas, situação, itens (SKU, quantidade, preços, descontos), frete, `marketingData` (onde se espera o `click_id`). **Nenhum dado pessoal da compradora é gravado.** Nada é enviado à VTEX.
3. **Credenciais:** AppKey e AppToken com **perfil de acesso mínimo de leitura de pedidos (OMS)**, criados pela Suntime no License Manager. Os valores ficam no cofre da hospedagem nas variáveis indicadas no painel (ex.: `VTEX_SUNTIME_APP_KEY`, `VTEX_SUNTIME_APP_TOKEN`).
4. **Autenticação:** cabeçalhos `X-VTEX-API-AppKey` e `X-VTEX-API-AppToken`.
5. **Endpoints (documentação pública da VTEX, a confirmar no ambiente da loja):** listagem de pedidos `GET /api/oms/pvt/orders` (filtro por data de criação, paginação) e detalhe `GET /api/oms/pvt/orders/{orderId}`. Notificações (Feed/Hook de pedidos) **ainda não implementadas**: dependem de saber o que está habilitado na conta; hoje a sincronização é por consulta periódica (`/api/cron/sincronizar-pedidos`, de hora em hora, com sobreposição de 2 h).
6. **Armazenamento:** `orders`, `order_items`, `order_status_history`, `conversions`, livro-razão; cursor e histórico em `integrations`/`integration_sync_logs`.
7. **Erros e duplicidade:** até 3 tentativas para erros transitórios (408/429/5xx, respeita `Retry-After`), máx. ~4 requisições/s, cada pedido em transação própria, idempotência por `(marca, id do pedido)` + hash de conteúdo + chave única de cada lançamento; contador de falhas seguidas e alerta.
8. **Teste obrigatório antes do modo real (docs/05 §5.4):** os 12 passos do adendo em ambiente de testes, com pedidos de teste identificados. Em especial, **descobrir e comprovar em qual campo o `click_id` chega ao pedido** (`clickIdField`) e mapear devoluções.
- **Status:** adaptador e mapeamento implementados e testados com dados de exemplo **baseados na documentação**, não com a loja real. **Não ativar** antes da auditoria.
- **Plano B (se a atribuição não for confiável):** app de afiliados do ecossistema VTEX, cupom individual por criadora, ou conciliação temporária com relatório da marca (docs/05 §6.3).

## 3. E-mail transacional
1. **Finalidade:** confirmação de cadastro, recuperação de senha, avisos.
2. **Dados enviados:** e-mail da destinatária, assunto e texto. Nada é recebido.
3. **Credenciais:** conta no provedor (implementado: Resend), domínio verificado (SPF/DKIM), `RESEND_API_KEY`, `MAIL_FROM`.
4. **Autenticação:** `Authorization: Bearer <chave>`.
5. **Endpoint:** `POST https://api.resend.com/emails`.
6. **Armazenamento:** não guardamos o conteúdo dos e-mails.
7. **Erros:** até 3 tentativas para erros transitórios; falhas aparecem nos logs.
8. **Teste:** em homologação, `MAIL_DRIVER=resend` com domínio de teste; cadastrar conta fictícia e conferir recebimento.
- **Decisão pendente:** provedor final (Resend, Postmark, SES). Trocar = novo adaptador em `src/integrations/email/providers.ts`.

## 4. Pagamento de resgates
1. **Finalidade:** pagar as recompensas das criadoras.
2. **MVP (decidido):** PIX feito **fora da plataforma** pela conta da empresa; a plataforma registra o identificador da transação (E2E ID, 32 caracteres) e mantém o livro-razão. Nenhum dinheiro é movido pela aplicação.
3. **Dados:** CPF e chave PIX da criadora, **criptografados** (AES-256-GCM, `PII_ENCRYPTION_KEY`), exibidos só mascarados.
4. **Futuro (PSP):** requer conta PJ, contrato com provedor de pagamentos, parecer tributário (D9/D10). Entraria como novo `PayoutProvider`.
5. **Teste:** em homologação, aprovar e registrar pagamento de valor simbólico com comprovante real; conferir extrato.

## 5. Monitoramento e analytics
- **Hoje:** logs estruturados no servidor, página "Saúde do sistema", alertas de integração no painel.
- **A contratar:** Sentry (ou similar) para erros — exige DSN; analytics de produto com consentimento. Não implementados.

## 6. Redes de afiliados externas (Awin, Rakuten, Lomadee…)
Fora do modelo atual (parceria direta com marcas). Se forem adotadas, entram como novo `OrderSource` (postback/relatório de conversões), sem mudar telas nem livro-razão.
