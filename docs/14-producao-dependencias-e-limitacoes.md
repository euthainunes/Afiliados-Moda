# 14 — Arquitetura atual, implantação em produção, dependências externas e limitações

## 1. Arquitetura atual (resumo)
Monólito modular em **Next.js 16 + TypeScript**, banco **PostgreSQL** (Drizzle ORM, migrações SQL versionadas), rotinas agendadas por rotas HTTP protegidas. Detalhes de decisão em docs 04, 08–11.

```
src/
  app/
    (public)/        início, looks, /l/{slug}, perfil, FAQ, contato, termos, privacidade, regulamento
    (auth)/          entrar, cadastro, confirmar e-mail, recuperar e redefinir senha
    app/             área da usuária: início, catálogo, produto, looks/montador, desempenho, recompensas,
                     resgate, links, favoritos, notificações, suporte, conta e privacidade
    admin/           visão geral, vendas, financeiro, resgates, conciliação, usuárias, suporte, marcas,
                     campanhas/regras, catálogo, looks, integrações, relatórios, equipe, configurações,
                     saúde, auditoria
    api/             produtos (montador), cron/* (rotinas)
    r/[code]/        redirecionador de cliques
  modules/           regras de negócio por domínio (sem dependência de telas)
  integrations/      contratos + adaptadores (demo, VTEX, e-mail, pagamentos) + registro
  demo/              ÚNICO lugar que fabrica dados fictícios (bloqueado em produção)
  components/        design system (ui/) e componentes de domínio
  lib/               banco, ambiente, sessão, criptografia, dinheiro, datas
db/migrations/       SQL versionado (inclui triggers de integridade)
db/fixtures/         feed fictício
scripts/             migrate, seed, reset (dev), gerador do feed fictício
tests/               unit/, integration/ (Postgres real), e2e/ (Playwright, desktop e celular)
docs/                planejamento, decisões, guias
```

### Ambientes
| | Desenvolvimento | Homologação | Produção |
|---|---|---|---|
| `APP_ENV` | development | staging | production |
| Dados | demonstração (`pnpm db:seed`) | demonstração + testes com loja real em modo de teste | somente reais |
| E-mail | console | provedor real (domínio de teste) | provedor real |
| Integrações | demo | VTEX em ambiente/pedidos de teste | VTEX após aprovação |
| Banco | local | gerenciado, separado | gerenciado (São Paulo), PITR, `app.environment=production` |
| Faixa na tela | "Ambiente de demonstração" | "Homologação" | — |

## 2. Checklist de implantação em produção
Marque cada item com evidência (print, log, ata). **Não operar com dinheiro real sem todos os itens financeiros e jurídicos.**

### Infraestrutura
- [ ] Banco PostgreSQL gerenciado (região São Paulo), com backup diário + PITR (≥ 7 dias) e **teste de restauração** registrado.
- [ ] `ALTER DATABASE <banco> SET app.environment = 'production';` (bloqueio de dados de demonstração no banco).
- [ ] Usuário de banco da aplicação sem privilégio de superusuário.
- [ ] `pnpm db:migrate` aplicado pelo pipeline; **nunca** `db:seed` nem `db:reset`.
- [ ] Variáveis no cofre da hospedagem: `DATABASE_URL`, `AUTH_SECRET` (≥ 48 bytes aleatórios), `APP_URL` (https), `APP_ENV=production`, `MAIL_DRIVER=resend`, `MAIL_FROM`, `RESEND_API_KEY`, `PII_ENCRYPTION_KEY` (32 bytes base64), `CRON_SECRET` (≥ 32), `IMAGE_REMOTE_HOSTS`, credenciais VTEX.
- [ ] Agendador configurado para `/api/cron/importar-feeds` (6/6 h), `/api/cron/sincronizar-pedidos` (1/1 h), `/api/cron/rotinas-financeiras` (diária) com `Authorization: Bearer CRON_SECRET` (`vercel.json` já define os horários na Vercel).
- [ ] Domínio com HTTPS; `APP_URL` correto (links de e-mail e de compartilhamento).
- [ ] Monitoramento de erros (ex.: Sentry) e alerta de disponibilidade para `/` e `/r/*`.
- [ ] Página **Saúde do sistema** sem itens em "Atenção".

### Segurança
- [ ] **MFA obrigatório para administradoras e operadoras** (pendente — Fase 3b).
- [ ] Content Security Policy com nonce (pendente).
- [ ] Revisão de segurança (OWASP ASVS nível 1) e varredura de dependências.
- [ ] Primeira administradora criada por procedimento controlado (não pelo seed); segunda administradora para quatro olhos.
- [ ] Rotação documentada de `AUTH_SECRET`, `CRON_SECRET`, credenciais VTEX e chave de e-mail.

### Jurídico, financeiro e conteúdo
- [ ] Termos de uso, política de privacidade e regulamento **definitivos** (hoje rascunhos sinalizados).
- [ ] Encarregada(o) de dados (LGPD) e canal de atendimento definidos.
- [ ] Contrato com a Suntime: base de cálculo, 25%, prazos, cancelamentos, devoluções, cobrança (D1, D2, D4, D5).
- [ ] Regra de comissão cadastrada e **aprovada por segunda administradora** com referência do contrato.
- [ ] Parecer tributário sobre a natureza da recompensa e retenções (D10); processo de pagamento PIX aprovado (D9).
- [ ] Política de retenção de dados aprovada; job de limpeza de sessões/contatos implementado.

### Integração VTEX (critérios do adendo §7)
- [ ] Auditoria técnica concluída; credenciais com privilégio mínimo.
- [ ] Campo do `click_id` no pedido identificado (`clickIdField`) e **12 passos do teste ponta a ponta** executados em ambiente de teste, com evidências.
- [ ] Repetição de eventos sem duplicação comprovada; cancelamento refletido no livro-razão.
- [ ] Conciliação disponível e revisada; operação aprovada por jurídico e financeiro.
- [ ] Só então: integração em modo **real** no painel.

## 3. Dependências que exigem decisão, credencial ou ação externa
| # | Dependência | Responsável | Bloqueia |
|---|---|---|---|
| 1 | XML real de produtos da Suntime e domínio das imagens | Suntime | Catálogo real |
| 2 | Acesso VTEX (conta, AppKey/AppToken mínimos, ambiente de teste, notificações) | Suntime | Pedidos reais |
| 3 | Mecanismo de preservação do `click_id` comprovado (ou plano B) | Suntime + equipe | Atribuição e recompensas reais |
| 4 | Contrato: 25%, base de cálculo, marco dos 30 dias, cancelamentos/devoluções | Comercial + jurídico | Regra de comissão real |
| 5 | Forma de cobrança da marca e de pagamento às usuárias; parecer tributário | Financeiro + contábil | Faturas e resgates reais |
| 6 | Provedor de e-mail (conta, domínio verificado) | Equipe | Cadastro em produção |
| 7 | Hospedagem e banco de produção (Vercel + Postgres SP recomendado) | Equipe | Publicação |
| 8 | Nome, domínio e identidade visual (D16) | Sócias | Lançamento público |
| 9 | Textos legais definitivos e encarregada(o) LGPD | Jurídico | Lançamento |
| 10 | Ferramenta de monitoramento de erros | Equipe | Operação |
| 11 | Decisões D6 (atribuição por pedido × por item), D8 (autocompra — hoje recusada), D12 (mínimo de resgate — hoje R$ 20) | Sócias | Ajustes de regra (já configuráveis) |

## 4. Limitações conhecidas
- **Atribuição real não comprovada.** O adaptador VTEX foi testado só com dados de exemplo baseados na documentação.
- **Notificações de pedidos (hook/feed VTEX) não implementadas**; a sincronização é por consulta periódica.
- **Devoluções na VTEX não mapeadas** (dependem de validação com pedidos reais).
- **Base de cálculo por pedido inteiro** (todos os itens da marca no pedido atribuído); atribuição apenas dos itens do look depende da decisão D6.
- **MFA, CSP com nonce e login com Google** ainda não implementados.
- **E-mail real** implementado (Resend) mas não testado contra conta real.
- **Pagamentos** são registrados manualmente (PIX fora da plataforma); não há PSP integrado.
- **Pagamentos parciais da marca** não são aceitos: viram divergência para tratar com a marca.
- **Cache:** páginas públicas são renderizadas a cada acesso (simples e correto; otimizar com volume).
- **Imagens fictícias** são SVG locais; imagens reais exigem configuração de host.
- **Job de limpeza** (sessões expiradas, limites, contatos antigos) ainda não implementado.

## 5. Testes realizados (estado atual)
| Tipo | Quantidade | O que cobre |
|---|---|---|
| Unitários | 5 arquivos | permissões, validações, preços, feed, rastreamento, cálculo financeiro, arredondamento, VTEX (mapeamento), tentativas, CPF |
| Integração (Postgres real) | 7 arquivos | autenticação, sessões, acesso, catálogo, looks e cliques, operação, ciclo financeiro completo (atribuição → aprovação → devolução/cancelamento → elegibilidade → fatura → resgate → estorno), integridade do livro-razão no banco, bloqueios de produção, sincronização idempotente, LGPD, suporte, configurações, saúde |
| Ponta a ponta (Playwright) | 24 cenários × 2 dispositivos (48 execuções) | cadastro/login, permissões por papel, catálogo → look → publicação → clique rastreado, operação do painel, demonstração completa (desempenho, recompensas, aprovação de resgate, integrações, conciliação, saúde), suporte, privacidade, contato |

Total: 119 testes unitários/integração e 48 execuções ponta a ponta, todos passando localmente. Mutações propositais (retirar checagem de dono, de aprovador diferente, de idempotência, de status da conta) foram detectadas pelos testes. Comandos: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
