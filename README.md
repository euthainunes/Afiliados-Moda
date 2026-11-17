# Afiliados Moda (nome provisório)

Plataforma de looks com peças de marcas parceiras: as criadoras montam e compartilham looks; cada clique para a loja é rastreado; vendas atribuídas geram comissão para a plataforma e recompensa para a criadora, controladas por um livro-razão auditável. Primeira marca prevista: Suntime (VTEX).

> **Situação:** plataforma funcional em **modo demonstração** (dados fictícios, nenhuma venda, cobrança ou pagamento real). A estrutura está pronta para receber dados reais por configuração, de forma gradual — ver [docs/12](docs/12-guia-de-integracoes.md) e [docs/14](docs/14-producao-dependencias-e-limitacoes.md).

## Como rodar
Requisitos: Node 22, pnpm 10, PostgreSQL 16.
```bash
pnpm install
cp .env.example .env.local      # ajuste DATABASE_URL, gere AUTH_SECRET (openssl rand -base64 48) e SEED_PASSWORD
pnpm db:migrate                 # cria as tabelas
pnpm db:seed                    # carrega a DEMONSTRAÇÃO (fictícia); recriar tudo: pnpm db:reset
pnpm dev                        # http://localhost:3000 (links de e-mail aparecem no terminal)
```
Contas fictícias (senha = `SEED_PASSWORD`): `admin@exemplo.test` e `admin2@exemplo.test` (administradoras), `operadora@exemplo.test`, `criadora1@exemplo.test` … `criadora5@exemplo.test` e `marca@exemplo.test` (portal da marca fictícia).

Verificação em duas etapas: qualquer conta pode ativar em **Conta → Verificação em duas etapas**. Para a equipe ela é obrigatória quando `REQUIRE_STAFF_MFA=true` e **sempre** em produção; em desenvolvimento o padrão é não exigir, para facilitar a demonstração.

Qualidade: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` (os testes usam um banco cujo nome termina em `_test`).

## O que existe
- **Público:** início, descoberta de looks, página do look com imagem de compartilhamento, perfil, FAQ, contato, termos, privacidade e regulamento (rascunhos).
- **Conta:** cadastro com consentimentos, confirmação de e-mail, login, recuperação e troca de senha, sessões, perfil, exportação e exclusão de dados (LGPD).
- **Criadora:** catálogo com busca e filtros, montador de looks, links rastreáveis, desempenho com gráficos, recompensas com extrato, resgate por PIX, notificações, suporte.
- **Painel:** vendas e conversões, financeiro (posição real × demonstração, faturas das marcas, ajustes com aprovação dupla, livro-razão), resgates, conciliação, usuárias, suporte, marcas/campanhas/regras de comissão versionadas, catálogo, moderação, integrações (demo/real/desligada), relatórios e CSV, equipe, configurações, saúde, auditoria.
- **Integrações:** contratos e adaptadores para feed de produtos, pedidos VTEX (preparado, não validado), e-mail e pagamentos; troca por configuração; bloqueio de demonstração em produção na aplicação e no banco.

## Documentação
| Documento | Conteúdo |
|---|---|
| [00 — Adendo técnico](docs/00-adendo-tecnico.md) | Fonte das regras comerciais, financeiras e VTEX |
| [01 — Visão de produto](docs/01-visao-de-produto.md) · [02 — Arquitetura funcional](docs/02-arquitetura-funcional-e-sitemap.md) | Proposta, perfis, sitemap, fluxos, permissões |
| [03 — Modelo de dados inicial](docs/03-modelo-de-dados-e-integracoes.md) · [04 — Arquitetura técnica](docs/04-arquitetura-tecnica.md) · [05 — Financeiro e VTEX](docs/05-afiliados-financeiro-e-vtex.md) | Especificações |
| [06 — Riscos e decisões](docs/06-riscos-e-decisoes.md) · [07 — Roadmap](docs/07-roadmap.md) | Decisões pendentes e fases |
| [08](docs/08-fase-3-fundacao.md) · [09](docs/09-fase-4-catalogo-e-looks.md) · [10](docs/10-fase-5-operacao.md) | Entregas: fundação, catálogo e looks, operação |
| [11 — Plano da plataforma completa](docs/11-plano-plataforma-completa.md) | Modo demonstração, integrações e etapas |
| [12 — Guia de integrações](docs/12-guia-de-integracoes.md) | Como conectar cada serviço real |
| [13 — APIs e modelo de dados](docs/13-api-e-modelo-de-dados.md) · [OpenAPI](docs/api/openapi.yaml) | Rotas, serviços, tabelas e garantias |
| [14 — Produção, dependências e limitações](docs/14-producao-dependencias-e-limitacoes.md) | Arquitetura atual, checklist de produção, pendências externas, testes |

> Percentuais comerciais (25% / 20 p.p. / 5 p.p.) são premissas sujeitas a contrato: existem apenas numa regra **fictícia** de demonstração e, para marcas reais, são cadastrados e aprovados no painel.

## Backup e restauração
`scripts/backup-restore-check.sh <URL_DO_BANCO>` gera um dump, restaura numa base temporária e confere tabelas, migrações e livro-razão (ver docs/14, checklist de produção).

## Homologação
Passo a passo para publicar o ambiente de testes na Vercel: [docs/15-homologacao-vercel.md](docs/15-homologacao-vercel.md).
