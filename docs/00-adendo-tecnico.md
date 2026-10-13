# ADENDO TÉCNICO — COMISSÕES, RECOMPENSAS, LIQUIDAÇÃO FINANCEIRA E INTEGRAÇÃO VTEX

> Documento de referência fornecido pelas responsáveis pelo projeto, reproduzido sem alterações. É a fonte principal das regras comerciais e financeiras, junto com o briefing do projeto. Os demais documentos em `docs/` derivam dele.

## 1. MODELO COMERCIAL DA SUNTime

A Suntime será a primeira marca parceira do MVP. A comissão comercial informada é de 25%, sujeita à formalização contratual e à validação da base de cálculo.

No lançamento, a divisão comercial pretendida será:

* 20 pontos percentuais da base de cálculo: recompensa da usuária.
* 5 pontos percentuais da base de cálculo: receita bruta da plataforma.

Isso significa que, sobre uma venda elegível de R$ 100, com comissão de 25% calculada sobre esse valor:

* Comissão total: R$ 25.
* Recompensa da usuária: R$ 20.
* Parcela da plataforma: R$ 5.

Esses valores são ilustrativos e pressupõem que a base de cálculo seja o valor elegível da venda. O sistema deverá permitir configurar a base contratual, os percentuais e as condições de cada marca.

A divisão deve ser parametrizada por marca e campanha. Não fixe esses percentuais no código.

### Evolução futura

A estratégia comercial prevê começar com uma participação elevada para as usuárias, estimulando a adoção e a distribuição dos looks. Com a maturidade da plataforma, a participação poderá ser reduzida.

A mudança de percentual deverá afetar novas campanhas ou vendas conforme regras explícitas, sem alterar retroativamente recompensas já adquiridas.

Antes de ativar o modelo, documente a base de cálculo, os descontos, os cupons, os cancelamentos, as devoluções, os custos de pagamento e o tratamento tributário.

## 2. SEPARAÇÃO ENTRE COMISSÃO, RECOMPENSA E CAIXA

O sistema deverá distinguir quatro eventos financeiros:

1. Venda registrada na VTEX.
2. Venda atribuída e validada para fins comerciais.
3. Comissão recebida ou reconhecida conforme as condições contratuais.
4. Recompensa da usuária liberada para resgate.

Esses eventos não são equivalentes e podem ocorrer em momentos diferentes.

Implemente um livro-razão de recompensas com histórico imutável dos eventos financeiros e ajustes identificados. Não dependa apenas de um campo de saldo editável.

Cada lançamento deverá guardar, quando aplicável:

* Pedido de origem.
* Identificador da conversão.
* Usuária beneficiária.
* Look e produto associados.
* Base de cálculo.
* Comissão comercial.
* Percentual da usuária.
* Percentual da plataforma.
* Valor estimado.
* Valor validado.
* Estado financeiro.
* Datas de registro, validação e elegibilidade.
* Motivo de cancelamento ou ajuste.
* Referência ao evento de origem.

Garanta idempotência: a repetição de uma notificação não pode gerar uma segunda comissão nem uma segunda recompensa.

## 3. POLÍTICA DE VALIDAÇÃO E RESGATE

A política pretendida é disponibilizar o resgate da recompensa após 30 dias, contados de um marco claramente definido e validado juridicamente.

Não trate os 30 dias como prazo legal mínimo obrigatório para toda operação. O prazo de sete dias relacionado ao direito de arrependimento em compras realizadas fora do estabelecimento comercial é uma referência legal distinta, cuja aplicação deve ser confirmada no contexto da operação. A política de recompensas deverá considerar a legislação aplicável, o contrato com a marca e os direitos da consumidora.

Implemente estados independentes para cada venda:

* Registrada.
* Aguardando confirmação.
* Em validação.
* Aprovada comercialmente.
* Recompensa pendente.
* Elegível para resgate.
* Resgate solicitado.
* Paga.
* Cancelada ou estornada.

A regra de elegibilidade deverá ser configurável e não deverá liberar recompensas apenas porque 30 dias se passaram, caso ainda exista uma pendência relevante ou uma contestação de venda.

Defina, com orientação jurídica e financeira:

* O evento que inicia a contagem dos 30 dias.
* O tratamento de pedidos parcialmente devolvidos.
* O tratamento de cancelamentos e estornos posteriores.
* O tratamento de recompensas já resgatadas quando ocorre um estorno.
* As regras para saldo negativo ou compensação futura, respeitando os direitos da usuária.
* A comunicação transparente das condições do programa.

Não altere ou confisque saldo de maneira arbitrária. Todo ajuste deverá ter motivo, referência ao evento original e histórico auditável.

## 4. FLUXO FINANCEIRO COM AS MARCAS

A hipótese comercial a avaliar é permitir que a marca pague a comissão devida à plataforma em um ciclo anterior ao repasse da recompensa à usuária.

Por exemplo, uma comissão comercial poderia ser cobrada ou liquidada depois do período inicial de validação da compra, enquanto a recompensa da usuária permaneceria pendente até cumprir as condições do programa.

Não assuma que o simples uso de cartão de crédito pela marca garante o recebimento definitivo dos valores, elimina chargebacks ou torna a operação financeiramente segura.

Antes de implementar:

1. Defina o evento que autoriza a cobrança da marca.
2. Determine se a cobrança ocorrerá por cartão, fatura, transferência ou outro meio.
3. Confirme a viabilidade técnica e contratual do mecanismo.
4. Defina o tratamento de falhas de pagamento.
5. Determine como serão tratados reembolsos, chargebacks e divergências.
6. Avalie o impacto no capital de giro.
7. Valide a estrutura contábil, tributária e jurídica.

A plataforma deverá apresentar separadamente:

* Comissão calculada.
* Comissão cobrada.
* Comissão recebida.
* Valores pendentes de recebimento.
* Recompensas pendentes.
* Recompensas elegíveis.
* Valores pagos às usuárias.
* Ajustes e estornos.
* Receita e margem da plataforma.

Não trate valores devidos às usuárias como receita livre da empresa. A estratégia de capital de giro deverá ser validada com profissionais financeiros e jurídicos, considerando obrigações de pagamento e possíveis devoluções.

## 5. INTEGRAÇÃO DIRETA COM VTEX

A Suntime utiliza VTEX. O caminho preferencial é avaliar uma integração direta com os serviços e APIs oficiais disponíveis no ambiente da loja, em vez de depender exclusivamente de confirmação manual.

A existência da VTEX, por si só, não garante que a plataforma consiga identificar qual usuária ou look originou cada pedido. A atribuição depende de preservar um identificador de origem durante a navegação e relacioná-lo aos dados do pedido.

### 5.1. Auditoria inicial da integração

Antes de programar, solicite à Suntime ou à equipe responsável:

* Identificação do ambiente e da configuração VTEX utilizada.
* Acessos técnicos necessários, concedidos com privilégio mínimo.
* Documentação das APIs e eventos disponíveis.
* Possibilidade de acessar pedidos e seus estados.
* Possibilidade de registrar ou recuperar identificadores de atribuição.
* Possibilidade de receber notificações de atualização de pedidos.
* Restrições contratuais e de segurança.
* Ambiente de testes e pedidos de teste.

Não solicite credenciais administrativas amplas se permissões limitadas forem suficientes.

### 5.2. Identificação da origem da compra

Crie um identificador próprio para cada clique de saída, associado ao look, à usuária e ao produto.

Avalie os mecanismos suportados pelo ambiente VTEX para preservar esse identificador até o pedido. Considere, conforme a configuração real da loja, parâmetros de campanha, metadados de pedido, campos customizados ou mecanismos de integração disponíveis.

A escolha deve ser documentada e validada em testes. Não presuma que parâmetros de URL sejam automaticamente preservados no pedido.

O sistema deve conseguir relacionar, quando houver evidência suficiente:

* Click ID.
* Usuária.
* Look.
* Produto ou oferta.
* Campanha.
* Pedido.
* Estado do pedido.
* Valor elegível.
* Comissão calculada.

Se a integração não fornecer uma relação confiável entre clique e pedido, registre a limitação e não atribua a venda de maneira arbitrária.

### 5.3. Sincronização de pedidos

Avalie a estratégia mais adequada para consultar ou receber alterações de pedidos pela VTEX.

Considere os recursos oficialmente disponíveis no ambiente, como APIs de pedidos e mecanismos de notificação, sem assumir que um endpoint ou evento específico esteja habilitado.

A integração deverá:

* Registrar novos pedidos elegíveis.
* Atualizar estados dos pedidos.
* Detectar cancelamentos.
* Detectar devoluções e estornos quando essas informações estiverem disponíveis.
* Evitar conversões duplicadas.
* Registrar falhas de sincronização.
* Permitir reprocessamento seguro.
* Conciliar pedidos recebidos com pedidos já registrados.
* Manter histórico dos eventos recebidos.

Implemente monitoramento e alertas para falhas persistentes de integração.

### 5.4. Testes obrigatórios

Antes de ativar recompensas reais, realize testes controlados para comprovar:

1. A usuária acessa a plataforma.
2. Abre um look compartilhável.
3. Clica em um produto.
4. É direcionada ao produto correto na Suntime.
5. O identificador de origem é preservado pelo mecanismo implementado.
6. Um pedido de teste é criado na VTEX.
7. A integração recupera o pedido.
8. A atribuição é reconciliada com a origem.
9. A comissão é calculada segundo as regras configuradas.
10. A repetição do evento não duplica o resultado.
11. Um pedido cancelado atualiza corretamente o estado financeiro.
12. Os registros podem ser auditados de ponta a ponta.

Utilize pedidos de teste claramente identificados. Não crie recompensas reais durante os testes.

### 5.5. Plano alternativo

Se a integração direta não permitir atribuição suficientemente confiável, apresente alternativas antes de avançar:

* Integração por aplicativo ou serviço de afiliados compatível.
* Postback ou webhook fornecido por um sistema intermediário.
* Captura de parâmetros de campanha na loja, desde que preservados e recuperáveis.
* Processo temporário de conciliação de pedidos autorizado pela Suntime.

Explique os limites de cada alternativa, o custo operacional e o impacto na precisão da atribuição.

## 6. PAINEL FINANCEIRO E CONCILIAÇÃO

Crie uma visão administrativa para conciliar:

* Pedidos registrados.
* Pedidos atribuídos.
* Pedidos elegíveis.
* Comissão contratual calculada.
* Valores cobrados das marcas.
* Valores recebidos.
* Recompensas de usuárias.
* Saldo elegível para resgate.
* Resgates realizados.
* Estornos.
* Divergências entre VTEX e plataforma.

Disponibilize filtros por período, marca, campanha, pedido e estado financeiro.

Toda diferença deverá poder ser investigada. Não permita alterações manuais silenciosas.

## 7. CRITÉRIOS DE ACEITE FINANCEIRO

A integração somente estará pronta para operação real quando:

* A atribuição de pedidos tiver sido comprovada em ambiente de teste.
* Os identificadores de origem forem relacionados aos pedidos com evidência suficiente.
* Os valores forem calculados com base nas regras comerciais formalizadas.
* Os eventos repetidos forem tratados sem duplicação.
* Cancelamentos e ajustes forem refletidos no livro-razão.
* A conciliação estiver disponível para auditoria.
* A regra de elegibilidade de 30 dias estiver definida e implementada.
* O percentual de 20 pontos percentuais para a usuária e 5 para a plataforma estiver parametrizado, condicionado à confirmação contratual da base de cálculo.
* O processo de recebimento da marca e de pagamento das usuárias tiver sido validado.
* A operação estiver aprovada para lançamento pelos responsáveis jurídicos e financeiros.

Se algum requisito depender de documentação, credenciais ou autorização da Suntime, mantenha a dependência explícita. Não simule confirmação de pedido ou recebimento financeiro.

## 8. PRÓXIMA AÇÃO

Comece solicitando e auditando:

1. XML real da Suntime.
2. Documentação e acesso de teste ao ambiente VTEX.
3. Mecanismos disponíveis para acessar pedidos e suas atualizações.
4. Método para preservar e recuperar a atribuição de origem.
5. Contrato ou confirmação formal da comissão de 25%.
6. Base de cálculo e percentual da recompensa.
7. Regras de cancelamento, devolução e resgate.
8. Processo de cobrança da marca e de pagamento das usuárias.

Depois, apresente um plano técnico com as decisões tomadas, as dependências pendentes, o fluxo de dados e os testes de ponta a ponta.

Priorize a experiência da consumidora em paralelo. A integração financeira é essencial para monetização e recompensas, mas não deve bloquear o desenvolvimento do catálogo, do montador de looks e das páginas compartilháveis.
