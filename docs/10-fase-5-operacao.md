# 10 — Fase 5: operação e administração

## Finalidade
Permitir operar a plataforma pelo painel, sem alterações manuais no banco: marcas, campanhas, regras de comissão, importação automática, indicadores, relatórios e equipe.

## Critérios de aceite e resultado
| # | Critério | Verificação | Situação |
|---|---|---|---|
| 1 | Cadastro/edição de marcas (domínios autorizados, parâmetros de rastreamento validados) e feeds, com auditoria antes/depois | Integração + E2E | ✅ |
| 2 | Campanhas por marca com datas validadas | Integração + E2E | ✅ |
| 3 | Regras de comissão versionadas em pontos-base, com parcela da plataforma calculada como diferença | Unitários + integração | ✅ |
| 4 | Aprovação por outra administradora, com referência de contrato obrigatória e vigência nunca retroativa | Integração + E2E (duas sessões) | ✅ |
| 5 | Nova versão encerra a anterior sem alterá-la; o **banco** recusa alterar/apagar regra aprovada e sobrepor vigências | Integração (tentativas diretas no banco) | ✅ |
| 6 | Importação agendada (`/api/cron/importar-feeds`, protegida por segredo) que não repete feeds importados há < 30 min | Integração + E2E (401 sem segredo) | ✅ |
| 7 | Alertas de integração (falhas seguidas, sem sucesso há 24 h) na visão geral | Integração | ✅ |
| 8 | Indicadores com definição, fonte e natureza (confirmado/estimado) | Revisão + tela | ✅ |
| 9 | Relatório de cliques por marca/campanha/look/autora; CSV com proteção contra fórmulas, exportação auditada e restrita | Unitários + integração + E2E | ✅ |
| 10 | Gestão de equipe: conceder/retirar papéis; sempre resta uma administradora; ninguém remove o próprio acesso de administração; sessões encerradas na mudança | Integração + E2E | ✅ |

**Resultado local:** 91 testes unitários/integração e 34 E2E passando (desktop e celular). Mutação proposital (retirar a exigência de aprovador diferente) foi detectada.

**Defeitos encontrados e corrigidos pelos testes:** ids de campos repetidos quando há dois formulários na mesma página (acessibilidade); campos de data/seleção mais largos que a tela no celular; confirmação que desaparecia ao recolher a seção do formulário. O limite de tentativas de login por IP está ativo e foi respeitado: os testes simulam IPs distintos em vez de afrouxar a proteção.

## Decisões
- Percentuais da Suntime **não foram cadastrados**: dependem do contrato (D1/D2). O formulário aceita 25/20/5 como exemplo, e a aprovação exige referência formal.
- `vercel.json` agenda a importação a cada 6 h (válido se a hospedagem for Vercel; em outra plataforma, chamar a mesma rota com o segredo).

## Pendências
- Notificações por e-mail para alertas (depende do provedor de e-mail, Fase 3b).
- Edição de categorias e mapeamento de categorias do feed.
