# Afiliados-Moda

Plataforma de descoberta de produtos de moda, montagem e compartilhamento de looks, com atribuição de vendas, comissões e recompensas para as usuárias. Primeira marca parceira prevista: Suntime (VTEX).

## Status
- **Fase 1 — Descoberta:** concluída (docs 00–07).
- **Fase 3 — Fundação técnica:** concluída em desenvolvimento (doc 08): Next.js 16 + TypeScript, PostgreSQL/Drizzle, autenticação, papéis e permissões, auditoria, design system inicial e testes. MFA do painel e provedor de e-mail pendentes (Fase 3b).
- **Fase 4 — Catálogo e looks:** concluída em desenvolvimento com catálogo fictício (doc 09): importação de feed XML, catálogo com busca e filtros, montador, publicação com URL própria e imagem de compartilhamento, redirecionador de cliques e moderação. Atribuição de vendas ainda não comprovada (depende da VTEX).

## Como rodar
```bash
pnpm install
cp .env.example .env.local   # ajuste DATABASE_URL e AUTH_SECRET
pnpm db:migrate && pnpm db:seed
pnpm dev
```
Detalhes, testes e decisões em [docs/08](docs/08-fase-3-fundacao.md).

## Documentação
| Documento | Conteúdo |
|---|---|
| [00 — Adendo técnico (fonte)](docs/00-adendo-tecnico.md) | Documento de referência: modelo comercial, financeiro e VTEX |
| [01 — Visão de produto](docs/01-visao-de-produto.md) | Proposta de valor, perfis, funcionamento, regras, MVP, evolução |
| [02 — Arquitetura funcional e sitemap](docs/02-arquitetura-funcional-e-sitemap.md) | Ambientes, páginas, navegação, fluxos, RBAC |
| [03 — Modelo de dados e integrações](docs/03-modelo-de-dados-e-integracoes.md) | ERD, entidades, restrições, classificação de dados, integrações |
| [04 — Arquitetura técnica](docs/04-arquitetura-tecnica.md) | Stack, módulos de back-end, front-end, design system, infraestrutura |
| [05 — Afiliados, financeiro e VTEX](docs/05-afiliados-financeiro-e-vtex.md) | Estados, cálculo, livro-razão, elegibilidade, integração e testes E2E |
| [06 — Riscos e decisões](docs/06-riscos-e-decisoes.md) | Registro de decisões pendentes e matriz de riscos |
| [07 — Roadmap](docs/07-roadmap.md) | Fases, entregáveis, critérios de aceite e próximas ações |
| [08 — Fase 3: fundação técnica](docs/08-fase-3-fundacao.md) | Critérios de aceite, decisões, pendências e como rodar |
| [09 — Fase 4: catálogo e looks](docs/09-fase-4-catalogo-e-looks.md) | Critérios de aceite, o que não está comprovado, decisões e pendências |

> Percentuais comerciais (25% / 20 p.p. / 5 p.p.) são premissas sujeitas a contrato e são tratados como configuração, nunca como código.
