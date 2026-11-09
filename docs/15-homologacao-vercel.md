# 15 — Publicar a homologação na Vercel

> Homologação = ambiente online de testes, **só com dados fictícios**, protegido por login. Não recebe pedidos, pagamentos nem dados reais.

## Situação
| Item | Situação |
|---|---|
| Time na Vercel | `euthai` (sem projetos ainda) |
| Projeto `afiliados-moda` | **a criar** — a conexão da Vercel com o assistente expirou antes da criação |
| Banco de dados | **adiado** por decisão da usuária. Sem banco, o site abre, mas login, catálogo e painel não funcionam |
| Código | Branch `claude/affiliate-fashion-platform-qqibm5`. O `main` só tem o README inicial |
| Build sem banco | Funciona: a conexão com o banco só é aberta no primeiro uso |

## Passo a passo
1. **Projeto:** Vercel → time `euthai` → *Add New → Project* → importar `euthainunes/Afiliados-Moda`. Framework: Next.js (detectado). Não é preciso mudar comandos de build.
2. **Branch:** enquanto o código não estiver no `main`, use as publicações de *preview* do branch `claude/affiliate-fashion-platform-qqibm5` (cada push gera uma). Ao juntar o branch no `main`, a homologação pode virar o ambiente principal do projeto.
3. **Proteção:** *Settings → Deployment Protection* → manter *Vercel Authentication* ligada (só quem é do time abre o site).
4. **Variáveis** (*Settings → Environment Variables*, ambiente *Preview*):

   | Variável | Valor na homologação |
   |---|---|
   | `APP_ENV` | `staging` (mostra a faixa "Homologação"; permite dados de demonstração) |
   | `APP_URL` | endereço do deploy, ex. `https://afiliados-moda-<time>.vercel.app` |
   | `AUTH_SECRET` | 48+ caracteres aleatórios (`openssl rand -base64 48`) |
   | `MAIL_DRIVER` | `console` (e-mails só aparecem nos logs) até haver provedor |
   | `REQUIRE_STAFF_MFA` | `true` (testar a verificação em duas etapas da equipe) |
   | `CRON_SECRET` | 32+ caracteres aleatórios |
   | `DATABASE_URL` | quando o banco existir (Postgres em São Paulo) |
   | `PII_ENCRYPTION_KEY` | `openssl rand -base64 32` |
5. **Banco (quando decidido):** criar Postgres em São Paulo (Neon pela Vercel ou Supabase), pôr a `DATABASE_URL` (com pooler e `sslmode=require`) e, de uma máquina com acesso, rodar `pnpm db:migrate` e `pnpm db:seed` apontando para ele. **Nunca** aplicar `app.environment = 'production'` nesse banco.
6. **Agendador:** as rotinas do `vercel.json` só rodam no ambiente de produção da Vercel. Na homologação, rode-as pelo painel (Financeiro → "Executar conciliação…", Integrações → "Sincronizar") ou com `curl -H "Authorization: Bearer $CRON_SECRET"`.
7. **Conferência:** abrir o site, ver a faixa "Homologação", entrar com `admin@exemplo.test` (senha do seed), ativar a verificação em duas etapas, passar pelas telas da galeria e conferir **Saúde do sistema**.
