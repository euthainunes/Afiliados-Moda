# 08 — Fase 3: fundação técnica

## Finalidade
Criar a base sobre a qual todos os módulos serão construídos: projeto, banco de dados versionado, autenticação, perfis e permissões validados no servidor, trilha de auditoria, design system inicial e testes automatizados. Nenhuma funcionalidade de negócio (catálogo, looks, financeiro) entra aqui.

## Critérios de aceite e resultado

| # | Critério | Como foi verificado | Situação |
|---|---|---|---|
| 1 | Cadastro com aceite de termos, privacidade e regulamento, e declaração de maioridade | Teste de integração e E2E | ✅ |
| 2 | Login só após confirmação de e-mail | `tests/integration/auth.test.ts` | ✅ |
| 3 | Recuperação de senha com link de uso único (30 min) que encerra todas as sessões | Teste de integração | ✅ |
| 4 | Respostas que não revelam se um e-mail tem conta (cadastro, login, recuperação) | Testes de integração e E2E | ✅ |
| 5 | Limite de tentativas por e-mail e por IP | Teste de integração (bloqueio após 8 tentativas) | ✅ |
| 6 | Sessões no servidor, revogáveis, com expiração por inatividade e absoluta; equipe interna com sessão mais curta | Testes de integração; tela "Sessões ativas" | ✅ |
| 7 | Usuária comum não acessa o painel; operadora não acessa auditoria nem ações financeiras | Testes unitários (RBAC), de integração e E2E (404) | ✅ |
| 8 | Ação administrativa registrada em auditoria imutável, com dados pessoais mascarados | Teste de integração (UPDATE/DELETE bloqueados pelo banco) | ✅ |
| 9 | Nenhum redirecionamento para sites externos após login | Teste unitário e E2E | ✅ |
| 10 | Layout funcional em celular e computador | E2E em dois perfis (Desktop Chrome e Pixel 7) + capturas | ✅ |
| 11 | Lint, tipos, testes e build em CI | `.github/workflows/ci.yml` | ✅ configurado (primeira execução ocorre no próximo PR) |

Resultado local: **33 testes unitários/integração** e **18 testes E2E** (9 cenários × 2 dispositivos) passando; build de produção sem erros. Os testes foram validados com mutações propositais (permissão financeira dada à operadora; sessão de conta suspensa aceita): ambas foram detectadas.

## Decisões tomadas nesta fase
| Decisão | Motivo | Reversível? |
|---|---|---|
| **Autenticação própria** (argon2id + sessões no Postgres + cookie `HttpOnly`) em vez de Auth.js/Supabase Auth | Mantém a stack portátil enquanto a D18 (Supabase × Neon) não é decidida; controle total de sessões, revogação e auditoria | Sim, isolada em `src/modules/identity` |
| **Mapeamento papel → permissões versionado em código** (`src/modules/access/permissions.ts`); o banco guarda só os papéis de cada conta | Mudanças de permissão passam por revisão de código e ficam no histórico do git. Permissões editáveis pela interface ficam para depois do MVP. **Ajusta o doc 03**, que previa tabelas `roles`/`permissions` | Sim |
| Painel responde **404** a quem não tem permissão | Não revela a existência de áreas internas | Sim |
| Confirmação de e-mail exige **clique** (POST), não só abrir o link | Pré-visualizadores de link em apps de e-mail não consomem o token | — |
| Rate limit no **Postgres** | Funciona em serverless sem adicionar Redis ao MVP | Sim |
| `cacheComponents` do Next.js 16 **desligado** | Áreas autenticadas são renderizadas por requisição; será reavaliado na Fase 4 para páginas públicas de looks | Sim |
| Nome "Afiliados Moda" e paleta como **provisórios** | Dependem da D16 | Sim, centralizados em `src/config/site.ts` e `globals.css` |

## Pendências (Fase 3b, antes de qualquer uso em produção)
- **MFA (TOTP) obrigatório para operadoras e administradoras.**
- Provedor de e-mail transacional (hoje: impressão no terminal em desenvolvimento; produção recusa enviar sem provedor).
- Login com Google.
- Edição de perfil, exportação de dados e exclusão/anonimização de conta (LGPD).
- Gestão de equipe pela interface (hoje: papéis atribuídos por script/banco).
- Content Security Policy com nonce.
- Textos legais definitivos (páginas atuais são rascunhos sinalizados).

## Como rodar localmente
```bash
pnpm install
cp .env.example .env.local      # ajuste DATABASE_URL e gere AUTH_SECRET (openssl rand -base64 48)
pnpm db:migrate                 # aplica db/migrations
pnpm db:seed                    # cria a conta administrativa FICTÍCIA (admin@exemplo.test)
pnpm dev                        # http://localhost:3000 — links de e-mail aparecem no terminal

pnpm lint && pnpm typecheck
pnpm test                       # unitários + integração (exige banco *_test)
pnpm build && pnpm test:e2e     # ponta a ponta com Playwright
```
Os testes recriam do zero apenas bancos cujo nome termina em `_test`; todos os dados criados são fictícios (domínio `.test`).

## Estrutura criada
```
src/
  app/(public)        início, termos, privacidade, regulamento (rascunhos)
  app/(auth)          entrar, cadastro, verificar-email, recuperar-senha, redefinir-senha
  app/app             área da usuária: início, conta e privacidade (senha, sessões)
  app/admin           painel: visão geral, usuárias (busca, suspensão com motivo), auditoria
  proxy.ts            redirecionamento otimista para login (a checagem real é no servidor)
  modules/access      papéis, permissões, can/assertCan, quatro olhos
  modules/identity    cadastro, login, sessões, tokens, rate limit, administração de contas
  modules/audit       trilha append-only com mascaramento
  lib/db              schema Drizzle e conexão
  components/ui       Button, Field, Checkbox, Alert, Card, Badge, SubmitButton
db/migrations         SQL versionado (inclui trigger que impede alterar a auditoria)
tests/                unit, integration (Postgres real), e2e (Playwright)
```
