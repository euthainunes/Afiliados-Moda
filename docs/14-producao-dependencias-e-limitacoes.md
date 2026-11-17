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
- [ ] Variáveis no cofre da hospedagem: `DATABASE_URL`, `AUTH_SECRET` (≥ 48 bytes aleatórios), `APP_URL` (https), `APP_ENV=production`, `MAIL_DRIVER=resend`, `MAIL_FROM`, `RESEND_API_KEY`, `PII_ENCRYPTION_KEY` (32 bytes base64, **guardar cópia segura**: sem ela os CPFs, chaves PIX e segredos de duas etapas ficam ilegíveis), `CRON_SECRET` (≥ 32), `IMAGE_REMOTE_HOSTS`, credenciais VTEX. `REQUIRE_STAFF_MFA` pode ficar vazia (em produção é sempre obrigatória).
- [ ] Agendador configurado para `/api/cron/importar-feeds` (6/6 h), `/api/cron/sincronizar-pedidos` (1/1 h), `/api/cron/rotinas-financeiras` (diária), `/api/cron/limpeza` (diária), `/api/cron/enviar-avisos` (15/15 min) com `Authorization: Bearer CRON_SECRET` (`vercel.json` já define os horários na Vercel).
- [ ] Domínio com HTTPS; `APP_URL` correto (links de e-mail e de compartilhamento).
- [ ] Monitoramento: registro estruturado e tela de erro com código já implementados; contratar ferramenta de alertas de erro (ex.: Sentry) e monitor de disponibilidade para `/` e `/r/*`.
- [ ] **Teste de restauração** com `scripts/backup-restore-check.sh` contra uma cópia do banco de produção (gera dump, restaura em base temporária, compara tabelas, migrações e livro-razão); registrar data e resultado. Repetir a cada trimestre.
- [ ] Confirmar que a hospedagem **sobrescreve** `X-Forwarded-For` (a Vercel faz isso). Atrás de outro proxy, os limites de tentativa por IP podem ser burlados por cabeçalho forjado.
- [ ] Página **Saúde do sistema** sem itens em "Atenção".

### Segurança
- [x] MFA obrigatório para administradoras e operadoras (implementado).
- [ ] Cada pessoa da equipe ativou a verificação e guardou os códigos de recuperação (Saúde do sistema sem pendência).
- [x] Content Security Policy com nonce (implementado).
- [ ] Conferir no navegador do domínio final que nenhum recurso é bloqueado (console sem erros de CSP) e que `IMAGE_REMOTE_HOSTS` cobre a CDN das imagens.
- [x] Revisão de segurança interna (estilo OWASP ASVS nível 1) — achados corrigidos (doc 11 §4.3).
- [ ] Revisão de segurança **externa** (pentest) e varredura de dependências (`pnpm audit`) antes do lançamento.
- [ ] Primeira administradora criada por procedimento controlado (não pelo seed); segunda administradora para quatro olhos.
- [ ] Rotação documentada de `AUTH_SECRET`, `CRON_SECRET`, credenciais VTEX e chave de e-mail.

### Jurídico, financeiro e conteúdo
- [ ] Termos de uso, política de privacidade e regulamento **definitivos** (hoje rascunhos sinalizados).
- [ ] Encarregada(o) de dados (LGPD) e canal de atendimento definidos.
- [ ] Contrato com a Suntime: base de cálculo, 25%, prazos, cancelamentos, devoluções, cobrança (D1, D2, D4, D5).
- [ ] Regra de comissão cadastrada e **aprovada por segunda administradora** com referência do contrato.
- [ ] Parecer tributário sobre a natureza da recompensa e retenções (D10); processo de pagamento PIX aprovado (D9).
- [ ] Política de retenção de dados aprovada (rotina de limpeza implementada; ajustar `privacy.contact_retention_days` ao prazo aprovado).

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
| 11 | Login com Google: projeto no Google Cloud, tela de consentimento OAuth verificada, Client ID/Secret | Equipe | Login social (opcional para lançar) |
| 12 | Decisões D6 (atribuição por pedido × por item), D8 (autocompra — hoje recusada), D12 (mínimo de resgate — hoje R$ 20) | Sócias | Ajustes de regra (já configuráveis) |

## 4. Limitações conhecidas
- **Atribuição real não comprovada.** O adaptador VTEX foi testado só com dados de exemplo baseados na documentação.
- **Notificações de pedidos (hook/feed VTEX) não implementadas**; a sincronização é por consulta periódica.
- **Devoluções na VTEX não mapeadas** (dependem de validação com pedidos reais).
- **Base de cálculo por pedido inteiro** (todos os itens da marca no pedido atribuído); atribuição apenas dos itens do look depende da decisão D6.
- **Login com Google** implementado mas testado só com respostas simuladas; depende das credenciais OAuth (doc 12 §7).
- **E-mail real** implementado (Resend) e testado contra API simulada; falta testar com a conta e o domínio reais.
- **Verificação em duas etapas** por app autenticador ou chave de acesso (passkey); sem SMS, por segurança. Chaves de acesso testadas com autenticador de software e o virtual do Chromium; conferir em aparelhos reais (iPhone, Android, Windows Hello) na homologação, com o domínio definitivo (a chave fica presa ao domínio).
- **Avisos por e-mail** dependem do provedor de e-mail real; até lá ficam na fila e saem no terminal (`MAIL_DRIVER=console`).
- **Agendamentos na Vercel:** o plano gratuito (Hobby) só permite rotinas diárias. As de hora em hora (pedidos) e de 15 em 15 minutos (avisos por e-mail) exigem o plano Pro, ou um agendador externo chamando as mesmas rotas com `CRON_SECRET`. Os avisos também saem logo após as ações do painel, então o atraso máximo sem a rotina é até a próxima ação ou a rotina diária.
- **CSP** permite estilos inline (`style-src 'unsafe-inline'`); scripts exigem nonce.
- **Pagamentos** são registrados manualmente (PIX fora da plataforma); não há PSP integrado.
- **Pagamentos parciais da marca** não são aceitos: viram divergência para tratar com a marca.
- **Cache:** todas as páginas são renderizadas a cada acesso — exigência da CSP com nonce. Com volume, avaliar CDN/cache de dados (consultas) em vez de páginas estáticas.
- **Imagens fictícias** são SVG locais; imagens reais exigem configuração de host (`IMAGE_REMOTE_HOSTS` ou domínios da marca; outras são rejeitadas na importação).
- **Autocompra** só é detectada quando a autora está logada ao clicar no próprio link. Compra pelo próprio link numa janela anônima não é detectada; depende de a VTEX informar dados da compradora (CPF/e-mail em hash) para comparar — a decisão D8 e a auditoria VTEX definem isso.
- **Proteção contra SSRF** recusa endereços internos escritos como IP e nomes locais; nomes de domínio que apontam para IPs internos não são detectados (irrelevante na Vercel, que não tem rede privada).

## 5. Testes realizados (estado atual)
| Tipo | Quantidade | O que cobre |
|---|---|---|
| Unitários | 8 arquivos | permissões, validações, preços, feed, rastreamento, cálculo financeiro, arredondamento, VTEX (mapeamento), tentativas, CPF, TOTP (vetores da RFC 6238), CSP, contrato do e-mail real, redirecionamento seguro, endereços externos (SSRF), registro sem dados sensíveis |
| Integração (Postgres real) | 13 arquivos | autenticação, chaves de acesso (autenticador de software: cadastro, entrada, replay, assinatura adulterada, outra origem, clone), portal da marca (isolamento entre marcas, nenhum dado de compradora), avisos por e-mail (fila, agrupamento, preferência, novas tentativas, concorrência), exclusão de conta por link, login com Google (protocolo e regras de vínculo, com respostas simuladas), verificação em duas etapas (pendência, anti-replay, recuperação, limite, obrigatoriedade da equipe, redefinição), rotina de limpeza, sessões, acesso, catálogo, looks e cliques, operação, ciclo financeiro completo (atribuição → aprovação → devolução/cancelamento → elegibilidade → fatura → resgate → estorno), integridade do livro-razão no banco, bloqueios de produção, sincronização idempotente, LGPD, suporte, configurações, saúde |
| Ponta a ponta (Playwright) | 30 cenários × 2 dispositivos (60 execuções) | cadastro/login, chave de acesso (autenticador virtual do Chromium), portal da marca, ativação e desafio da verificação em duas etapas, CSP sem bloqueios, permissões por papel, catálogo → look → publicação → clique rastreado, operação do painel, demonstração completa (desempenho, recompensas, aprovação de resgate, integrações, conciliação, saúde), suporte, privacidade, contato |

Total: 178 testes unitários/integração e 60 execuções ponta a ponta, todos passando localmente. Mutações propositais (retirar checagem de dono, de aprovador diferente, de idempotência, de status da conta) foram detectadas pelos testes. Comandos: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
