# 11 — Plano para a plataforma completa (modo demonstração → dados reais)

> Resposta ao pedido de estruturar toda a plataforma (front-end, back-end, banco, integrações e painel) funcionando com dados fictícios e preparada para receber dados reais de forma gradual.
> Este documento **não recomeça o projeto**: ele parte do que já existe (docs 00–10) e define o que falta, em que ordem e com quais decisões.

## 1. Análise: o que já existe e o que falta

As fases do novo pedido foram mapeadas para o trabalho já entregue:

| Fase do pedido | Situação | Onde está |
|---|---|---|
| 1 — Planejamento | **Feito** e agora complementado por este documento | docs 00–07, 11 |
| 2 — Fundação técnica | **Feito**: Next.js 16 + TypeScript, PostgreSQL/Drizzle com migrações, autenticação, sessões, RBAC, auditoria imutável, CI | doc 08 |
| 3 — Interface | **Parcial**: público, cadastro/login/recuperação, catálogo, montador, looks públicos, painel (usuárias, marcas, campanhas, regras, catálogo, looks, relatórios, equipe, auditoria). **Falta**: desempenho e financeiro da usuária, meus links, notificações, suporte, perfil editável e privacidade (LGPD), telas financeiras e de integrações do painel | docs 09–10 |
| 4 — Regras de negócio | **Parcial**: catálogo, looks, cliques, regras de comissão. **Falta**: pedidos, atribuição, conversões, livro-razão, elegibilidade, resgates, conciliação, notificações | doc 05 (especificação) |
| 5 — Dados de demonstração | **Parcial**: catálogo, marca, looks e cliques fictícios. **Falta**: pedidos, conversões (aprovadas, pendentes, rejeitadas), comissões, extratos e resgates fictícios coerentes | — |
| 6 — Testes e segurança | **Feito** (ver doc 14 §5). **Falta**: revisão de segurança externa (OWASP ASVS) antes do lançamento | docs 08–10, 14 |
| 7 — Integrações reais | **Preparado só para catálogo** (feed). **Falta**: contratos e adaptadores para pedidos (VTEX), e-mail, pagamentos, monitoramento | doc 05 §6 |
| 8 — Homologação e produção | **Não iniciado**: checklist, backups testados, monitoramento | — |

### Adequação ao modelo de negócio
Itens da lista do pedido foram adaptados ao modelo real (looks com marcas parceiras diretas), sem criar páginas desnecessárias:
- **"Produtos, ofertas e oportunidades de afiliação"** → catálogo de peças das marcas parceiras (já existe).
- **"Links de afiliados, campanhas e materiais de divulgação"** → *Meus links*: links rastreáveis de cada peça dos looks publicados, com copiar e compartilhar. Material de divulgação = página do look e imagem de compartilhamento (já gerada). Banco de imagens de campanha **não** entra no MVP.
- **"Redes e marketplaces de afiliados"** (Awin, Rakuten, Lomadee etc.) → **não** fazem parte do modelo atual (parceria direta com a marca). A arquitetura de adaptadores permite incluí-las depois, se o negócio decidir.
- **"Saldos e saques"** → recompensas por estado (pendente, elegível, em resgate, paga) derivadas do livro-razão, e solicitação de resgate.

## 2. Arquitetura recomendada (mantida, com acréscimos)

Mantém-se o **monólito modular** (docs 04): uma aplicação Next.js com módulos de domínio isolados, PostgreSQL como fonte única de verdade, jobs agendados por rotas protegidas. Acréscimos:

### 2.1 Camada de integrações com contratos e adaptadores
```
src/integrations/
  contracts.ts          interfaces: OrderSource, PayoutProvider, EmailProvider, ProductFeedSource
  registry.ts           escolhe o adaptador de cada integração conforme configuração + ambiente
  demo/                 adaptadores de DEMONSTRAÇÃO (geram dados fictícios marcados; nunca movem dinheiro)
  vtex/                 adaptador real de pedidos VTEX (concluído após a auditoria técnica)
  email/                console (dev), provedor real (a escolher)
  payouts/              registro manual de PIX (MVP); PSP no futuro
```
- Páginas e serviços chamam **apenas os contratos** (ex.: `orderSource(brand).fetchUpdatedOrders(since)`); nenhuma página sabe se o dado é de demonstração.
- Cada integração tem uma linha em `integrations` com **modo** (`disabled` | `demo` | `live`), status, último sucesso, falhas, e referência ao segredo (nunca o segredo em si).
- Toda chamada externa passa por: tempo limite, tentativas com espera crescente, registro em `integration_sync_logs`, idempotência por identificador externo.

### 2.2 Modo demonstração seguro
| Proteção | Como |
|---|---|
| Ambiente explícito | `APP_ENV` = `development` \| `staging` \| `production` (validado na inicialização) |
| Demonstração proibida em produção | Em `production`, o registro **recusa** adaptadores `demo` e o script de dados fictícios aborta |
| Dados marcados | Coluna `is_demo` em marcas, pedidos, conversões, transações financeiras e resgates; e-mails fictícios em domínio `.test` |
| Separação nos números | Relatórios e saldos de produção consideram só `is_demo = false`; em demonstração, toda tela financeira mostra a faixa **"DEMONSTRAÇÃO — valores fictícios"** |
| Sem dinheiro simulado como real | O adaptador de pagamento demo marca resgates como "pagamento simulado" e nunca gera comprovante; o fluxo real exige registro manual com comprovante por administradora |

### 2.3 Financeiro (implementação da especificação do doc 05)
`orders` → `conversions` (com cópia da regra aplicada) → `ledger_transactions`/`ledger_entries` (partidas dobradas, soma zero, imutável, chave de idempotência) → saldos derivados → `payout_requests`/`payouts` → `brand_invoices`/`brand_payments` → `reconciliation_items`. Elegibilidade avaliada por job diário segundo a política da regra (prazo + status + pagamento da marca).

## 3. Integrações: o que cada uma exige para ser ativada
Detalhamento completo será publicado em `docs/12-guia-de-integracoes.md`. Resumo:

| Integração | Finalidade | Necessário para ativar | Situação |
|---|---|---|---|
| Feed de produtos (XML) | Catálogo | URL do feed real e domínio das imagens | Pronta; aguarda o XML da Suntime |
| VTEX — pedidos | Registrar pedidos e status | AppKey/AppToken com perfil mínimo de leitura de pedidos, conta/ambiente, mecanismo de notificação, ambiente de teste | Contrato e adaptador demo agora; real após a auditoria |
| VTEX — atribuição | Ligar pedido ao clique | Mecanismo validado em teste ponta a ponta (doc 05 §6.3) | Dependência externa |
| E-mail transacional | Confirmação, senha, avisos | Escolha do provedor, domínio verificado (SPF/DKIM), chave de API | Adaptador console; real quando houver conta |
| Pagamento às usuárias | Resgates | Decisão PIX manual × provedor (PSP), conta PJ, parecer tributário (D9/D10) | Registro manual com comprovante no MVP |
| Monitoramento | Erros e alertas | Conta (ex.: Sentry) e DSN | Logs estruturados agora |
| Analytics de produto | Funil | Ferramenta com consentimento | Fora do MVP |

## 4. Plano de execução (próximas entregas)

| Etapa | Entregáveis | Critério de aceite |
|---|---|---|
| **A. Modo demonstração e contratos** | `APP_ENV`, registro de integrações com modo, contratos, adaptadores demo, logs de sincronização, tela de integrações no painel (ativar/desativar autorizadas), saúde do banco e serviços | Produção recusa modo demo (teste automatizado); trocar uma integração de demo para desativada não exige mudar páginas |
| **B. Financeiro** | Pedidos, atribuição, conversões, livro-razão, elegibilidade, resgates, faturas da marca, conciliação | Testes de idempotência, soma zero, cancelamento/devolução, regra preservada, saldo derivado = soma dos lançamentos |
| **C. Área da usuária** | Desempenho (cliques, conversões, comissões com gráficos), extrato, resgate, Meus links, notificações, suporte (formulário + histórico), perfil editável, privacidade (exportar dados, excluir conta) | Gráficos batem com os registros do banco (teste); fluxos com estados de carregamento, erro e vazio |
| **D. Painel** | Conversões, financeiro, resgates (aprovar/rejeitar/registrar pagamento), conciliação, configurações, notificações de suporte | Ações críticas com confirmação, permissão e auditoria |
| **E. Dados de demonstração coerentes** | Usuárias com perfis variados, pedidos e conversões em todos os estados, extratos e resgates em todas as etapas, notificações | Valores seguem as regras cadastradas; tudo marcado como demonstração |
| **F. Documentação** | Arquitetura atualizada, API (OpenAPI das rotas `/api`), modelo de dados, guia de integrações, checklist de produção, lista de dependências externas | Aplicação executável seguindo a documentação |
| **G. Segurança (3b)** | MFA para a equipe, adaptador de e-mail real, CSP com nonce | Testes de MFA; nenhuma rota do painel sem segundo fator em produção |
| **H. Prontidão para homologação** | Revisão de segurança interna com correções, registro de erros, teste de restauração de backup, login com Google pronto para ativar | Achados corrigidos com teste; restauração verificada; Google testado com respostas simuladas |

## 4.1 Situação da execução
| Etapa | Situação |
|---|---|
| A. Modo demonstração e contratos | ✅ concluída |
| B. Financeiro | ✅ concluída (com dados de demonstração; dados reais dependem da VTEX e do contrato) |
| C. Área da usuária | ✅ concluída |
| D. Painel | ✅ concluída |
| E. Dados de demonstração coerentes | ✅ concluída (`src/demo/seed.ts`) |
| F. Documentação | ✅ docs 12, 13, 14 e OpenAPI |
| H. Prontidão para homologação | ✅ concluída (ver §4.3). **Pendentes externos:** credenciais do Google, ferramenta de alertas de erro, pentest externo |
| G. Segurança (MFA, CSP) e e-mail real | ✅ concluída: verificação em duas etapas, CSP com nonce, rotina de limpeza, contrato do e-mail real testado com API simulada. **Pendentes externos:** conta do provedor de e-mail e credenciais do login com Google |

### 4.2 Etapa G — o que foi feito
| Item | Como | Teste |
|---|---|---|
| Verificação em duas etapas (TOTP) | App autenticador (RFC 6238, 6 dígitos, 30 s, tolerância ±30 s); segredo criptografado (AES-256-GCM); 10 códigos de recuperação de uso único guardados só como HMAC; código já usado é recusado (anti-replay atômico no banco); 10 tentativas por 15 min por conta; sessão fica **pendente** (10 min, sem acesso a nada) até o código | `tests/unit/security.test.ts` (vetores da RFC), `tests/integration/mfa.test.ts`, `tests/e2e/security.spec.ts` |
| Obrigatória para a equipe | `REQUIRE_STAFF_MFA`; em produção é **sempre** obrigatória e a aplicação recusa iniciar com `false`. Sem segundo fator, a sessão de operadora/administradora perde os papéis internos (vale para telas, ações e exportações) e é levada ao cadastro; a equipe não pode desativar o próprio | `mfa.test.ts` |
| Redefinição | Administradora remove o segundo fator de **outra** pessoa, com motivo obrigatório, encerrando as sessões e registrando na auditoria (Painel → Equipe) | `mfa.test.ts` |
| CSP com nonce | `src/proxy.ts`: nonce novo por requisição, `script-src 'nonce' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests` quando o site é https. Todas as páginas passaram a ser renderizadas por requisição (condição para o nonce) | unitário + E2E (nenhum script bloqueado, nonce muda a cada resposta) |
| Rotina de limpeza | `/api/cron/limpeza` diária (sessões, links, limites, ativações abandonadas, anonimização de contatos) | `mfa.test.ts` |
| E-mail real | Adaptador Resend com testes de contrato (formato, nova tentativa em erro temporário, sem repetição em erro definitivo) usando API simulada | `tests/unit/email.test.ts` |

**Decisões tomadas nesta etapa (reversíveis):** `style-src` mantém `'unsafe-inline'` (o React e o `next/image` usam atributos `style`; scripts continuam estritamente protegidos). Criadoras **podem** ativar a verificação, mas não são obrigadas. Retenção de contatos públicos proposta em 180 dias (parâmetro editável, a confirmar com o jurídico).

### 4.3 Etapa H — revisão de segurança e prontidão
**Revisão de segurança interna** (estilo OWASP ASVS nível 1, autorização de todas as ações e rotas, IDOR, XSS, SQL, sessões, enumeração, SSRF). Achados e correções:

| # | Achado | Gravidade | Correção | Teste |
|---|---|---|---|---|
| 1 | Destino pós-login com tabulação (`/\t/site.com`) virava redirecionamento para outro site | Média | `safeNext` recusa caracteres de controle e confere a origem após interpretar a URL | unitário + E2E |
| 2 | Ajuste manual podia beneficiar quem o propõe ou aprova | Média | Proposta e aprovação recusadas quando a pessoa é a beneficiária | integração |
| 3 | Cadastro com e-mail existente respondia mais rápido (enumeração) e permitia envio em massa de avisos | Baixa | Mesmo custo de processamento; limite de avisos por endereço | integração |
| 4 | Formulário de recebimento revelava se um CPF tinha conta | Baixa | Mensagem genérica, registro na auditoria e limite de 5 alterações/dia | integração |
| 5 | Imagem de compartilhamento buscava imagens de qualquer host | Baixa | Imagens só de domínios da marca ou `IMAGE_REMOTE_HOSTS` (importação e cartão) | unitário |
| 6 | Download do feed seguia redirecionamentos sem validar | Baixa | Redirecionamentos seguidos manualmente; recusa http e endereços internos | unitário |
| 7 | Autocompra por janela anônima não é detectada | Baixa | **Documentado** (depende de dados da compradora vindos da VTEX e da decisão D8) | — |
| 8 | Sem teto de looks, atendimentos e favoritos por conta | Baixa | Limites por hora e teto de 50 rascunhos | — |
| — | Mensagens internas de erro no suporte; chave de configuração com `in` | Mínima | Só erros previstos chegam à tela; `Object.hasOwn` | — |

**Demais entregas:** registro estruturado sem dados sensíveis + `instrumentation.ts` + telas de erro com código; `scripts/backup-restore-check.sh` (testado localmente: 43 tabelas idênticas, livro-razão balanceado); login com Google (doc 12 §7); exclusão de conta passa a apagar segundo fator e vínculos externos.

**Decisões desta etapa (reversíveis):** vínculo automático com conta existente de mesmo e-mail (o Google verificou o endereço), com invalidação da senha quando a conta não tinha confirmado o e-mail; criadoras vindas do Google concluem cadastro com aceite de termos e 18+; registro de erros em JSON na hospedagem até haver ferramenta contratada.

## 5. Decisões confirmadas pela usuária
Todas as recomendações abaixo foram aceitas e aplicadas.

## 5.1 Decisões (registro)
| # | Decisão | Recomendação | Por quê |
|---|---|---|---|
| 1 | Simular o ciclo financeiro completo com dados fictícios (pedidos, comissões, resgates) | **Sim**, sempre marcado como demonstração e bloqueado em produção | Permite validar telas e regras antes da VTEX, como pedido |
| 2 | Percentuais da demonstração | 25% / 20 p.p. / 5 p.p. numa regra **fictícia**, aprovada no seed | Reproduz o adendo sem cadastrar nada como contratado |
| 3 | Pagamento às usuárias no MVP | Registro manual de PIX com comprovante | Volume baixo; PSP só depois de parecer tributário |
| 4 | Suporte | Formulário com histórico no painel | Sem custo de ferramenta externa no início |
| 5 | Redes de afiliados externas | Fora do MVP | Modelo atual é parceria direta com a marca |
| 6 | Hospedagem | Vercel + Postgres gerenciado em São Paulo | Mantém o recomendado no doc 04 |
