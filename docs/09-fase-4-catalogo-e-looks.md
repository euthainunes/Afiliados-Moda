# 09 — Fase 4: catálogo, montador e páginas compartilháveis

## Finalidade
Entregar o centro da experiência da usuária: descobrir peças, montar um look, publicá-lo com uma URL própria e compartilhá-lo; e, do lado da visitante, ver o look e ir à loja por um link rastreável. Tudo funciona com um **catálogo fictício** até a chegada do XML real da Suntime, e **nenhuma recompensa é calculada nesta fase**.

## Critérios de aceite e resultado

| # | Critério | Como foi verificado | Situação |
|---|---|---|---|
| 1 | Importação de feed XML (formato Google Merchant) agrupando SKUs por produto, com histórico de preço | Integração (`catalog.test.ts`) | ✅ |
| 2 | Reimportação idempotente: nada duplica; produtos sem mudança não são regravados | Integração | ✅ |
| 3 | Produtos que saem do feed deixam o catálogo, mas continuam nos looks como "indisponível"; feed muito menor que o esperado não retira nada | Integração | ✅ |
| 4 | Itens inválidos (sem preço, sem https, link fora do domínio da marca) são rejeitados com motivo; arquivo inválido não altera o catálogo | Unitários e integração | ✅ |
| 5 | Importação manual pelo painel, com permissão e auditoria | Integração e E2E | ✅ |
| 6 | Catálogo com busca sem acentos, filtros (categoria, marca, preço, disponibilidade), ordenação e paginação | Integração e E2E | ✅ |
| 7 | Detalhe do produto com tamanhos, disponibilidade, favoritar e "adicionar ao look" | E2E e capturas | ✅ |
| 8 | Montador: adicionar, remover e reordenar peças (com botões acessíveis), título, descrição e prévia | Integração e E2E | ✅ |
| 9 | Publicação exige título, ≥ 2 peças e nenhuma peça indisponível; URL própria que nunca muda (inclusive ao republicar) | Integração e E2E | ✅ |
| 10 | Nenhuma usuária edita, publica ou apaga look de outra | Integração e E2E (404) | ✅ |
| 11 | Página pública com metadados Open Graph e imagem de compartilhamento gerada (colagem das peças) | E2E (meta tags e PNG) | ✅ |
| 12 | "Ver na loja" passa por `/r/{code}`, registra o clique com `click_id` e redireciona ao produto com os parâmetros da marca | Integração e E2E (302 + parâmetros) | ✅ |
| 13 | Robôs, cliques da própria autora e excesso de cliques por IP são identificados; looks despublicados não geram clique atribuível | Integração | ✅ |
| 14 | Redirecionador nunca envia para domínio não autorizado da marca | Integração | ✅ |
| 15 | Moderação: remover look com motivo, com auditoria | Integração | ✅ |
| 16 | Layout em celular (barra inferior na área logada) e computador | E2E nos dois perfis + capturas | ✅ |

**Resultado local:** 70 testes unitários e de integração e 28 testes de ponta a ponta passando (13 cenários × 2 dispositivos, mais as capturas). Foram feitas mutações propositais (remover a checagem de dono do look; aceitar preço ambíguo); ambas foram detectadas. Os testes E2E encontraram e permitiram corrigir dois defeitos reais: filtro de preço vazio zerando o catálogo e ausência de confirmação visível após publicar.

## O que **não** está comprovado (e não é apresentado como tal)
- **Atribuição de vendas:** o redirecionador acrescenta parâmetros configuráveis por marca (para a marca fictícia: `utm_source`, `utm_medium`, `utm_campaign`, `utmi_cp={click_id}`). **Não se presume** que a VTEX da Suntime preserve esses parâmetros até o pedido; isso depende da auditoria e dos testes de ponta a ponta da Fase 7 (docs/05 §6). A configuração da Suntime começa vazia.
- **Formato do feed da Suntime:** o leitor implementado é o Google Merchant (RSS 2.0), formato comum de exportação. Se o XML real for outro, entra um novo leitor sem mudar o restante.
- **Imagens reais:** precisam do host da CDN da marca em `IMAGE_REMOTE_HOSTS` e de autorização contratual de uso (D14).

## Decisões tomadas nesta fase
| Decisão | Motivo |
|---|---|
| Produto = grupo de SKUs (`item_group_id`); tamanhos viram variantes | Feeds VTEX costumam listar um item por tamanho; o catálogo mostra uma peça só |
| Busca por trigramas (`pg_trgm`) sobre texto normalizado | Encontra termos parciais e sem acento sem serviço extra de busca |
| Importação inteira em uma transação, com trava contra execução simultânea | Catálogo nunca fica pela metade |
| Páginas públicas renderizadas a cada acesso | Preço, estoque e despublicação aparecem na hora; cache entra quando houver volume |
| Moderação *a posteriori* (D15) | Publicação imediata; remoção com motivo e auditoria |
| Divulgação de afiliado na página do look e `rel="sponsored"` nos links | Transparência para a compradora e boa prática de SEO |
| Perfil público em `/perfil/{usuaria}` (em vez de `/@usuaria`) | No Next.js, pastas iniciadas por `@` são reservadas a rotas paralelas |
| Somente looks publicados geram cliques atribuíveis; robôs não recebem `click_id` | Evita atribuição indevida |

## Pendências para próximas fases
- Edição de marcas, campanhas e regras de comissão pela interface (Fase 5).
- Importação agendada (job periódico) e alertas de falha (Fase 5).
- Desempenho por look com vendas atribuídas e recompensas (Fase 6).
- Arrastar-e-soltar no montador (hoje: botões ↑/↓, acessíveis por teclado).
- Cache das páginas públicas e contagem agregada de visualizações.

## Como experimentar localmente
```bash
pnpm db:migrate && pnpm db:seed   # importa o catálogo fictício e cria 3 looks de demonstração
pnpm dev
```
- Visitante: `http://localhost:3000/looks`
- Criadora fictícia: `criadora-demo@exemplo.test` (senha = `SEED_ADMIN_PASSWORD` do `.env.local`)
- Painel: `admin@exemplo.test` → Catálogo (importar de novo) e Looks (moderação)
- Para regenerar o feed fictício: `python3 scripts/generate-fictitious-feed.py`
