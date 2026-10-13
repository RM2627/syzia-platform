# SYZIA 051 — diagnóstico financeiro

## Conclusão

A base 050 descartava todo corpo de erro do Mercado Pago e reduzia quase todos os HTTP 4xx a `billing_provider_rejected`. Essa escolha evitava exposição de dados, mas perdia a distinção entre autenticação, autorização, dados da requisição, conflito e limitação temporária.

Outro problema era local: `process()` chamava `billing047_service('rejected')` após uma rejeição HTTP definitiva (400/401/403/422). Essa ação preservava o contrato e a reserva e voltava `create_started` a `false`. O `catch` externo chamava em seguida a ação genérica `error`, que sempre gravava `operation_state=uncertain`, mesmo sem criação pendente. Daí a combinação de `checkout_rejected` com `reconciliation_error`.

O cenário descrito pelo proprietário é compatível com esse caminho. Não houve consulta ao contrato real, aos logs externos ou às credenciais. Não é possível reconstruir o status HTTP ou o motivo exato das recusas antigas a partir do código genérico já gravado. A 051 não afirma que o cartão foi recusado, que o comprador era incompatível ou que inexiste assinatura externa.

## Contrato oficial consultado

Consulta documental em 13/10/2026, somente leitura pública:

- [Criar assinatura — POST /preapproval](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post): publica HTTP 400, 401, 403 e 500, com categorias gerais. Não fornece nessa referência uma taxonomia detalhada de recusas de cartão/comprador.
- [Obter assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval/get): consulta oficial por identificador, incluindo 404.
- [CardForm — SDK oficial](https://github.com/mercadopago/sdk-js/blob/main/docs/card-form.md): `iframe`, `onValidityChange`, `onError`, `onFetching`, `getCardFormData` e configuração dos campos.
- [Teste de compra de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-test/payment-approval): homologação específica continua externa.

Não foram transplantados códigos de `/v1/payments`, Orders, Bricks ou Checkout Pro para interpretar uma recusa de `/preapproval`. Um texto arbitrário do provider, mesmo mencionando cartão/comprador, não é evidência contratual suficiente para classificar a causa automaticamente.

## Diagnóstico permitido

| HTTP observado | Código local | Interpretação e limite |
|---|---|---|
| 400, 422 | `billing_provider_invalid_request` | Requisição não aceita; não identifica campo, cartão ou comprador. |
| 401 | `billing_provider_authentication` | Falha de autenticação perante o provider; não atribuir ao cartão. |
| 403 | `billing_provider_forbidden` | Operação não autorizada; não presumir causa pessoal/comercial. |
| 404 na consulta do plano | `billing_plan_unavailable` | Plano não encontrado nessa consulta. |
| 404 em outros recursos | `billing_resource_missing` | Recurso não encontrado nessa consulta. |
| 408, 5xx | `billing_provider_unavailable` | Falha temporária ou resultado não determinável. |
| 409 | `billing_provider_conflict` | Conflito; criação não é repetida como se tivesse falhado definitivamente. |
| 429 | `billing_provider_rate_limited` | Limitação temporária; não dispara nova criação automática. |
| Outro HTTP de erro | `billing_provider_rejected` | Motivo não classificado. |

422, 408, 409 e 429 são tratamentos defensivos HTTP, não afirmação de que todos estejam enumerados na referência de Assinaturas. A lista de rejeições definitivas 400/401/403/422 foi preservada da 050.

Somente status numérico 400–599 e etapa fixa `plan|create|lookup|update` entram no diagnóstico adicional. O corpo de erro é descartado sem interpretação, exibição ou armazenamento. A resposta ao navegador não recebe esses metadados internos. Logs recebem somente código local, status, etapa e identificador aleatório da requisição; não recebem URL, body, CPF, e-mail, PAN, CVV, token ou cabeçalhos.

## Identidade usada na contratação

O motor usa `actor.email`, obtido pela autenticação server-side, como `payer_email` de `/preapproval`. O e-mail digitado no CardForm não substitui essa identidade na requisição da SYZIA. Esse contrato existente foi preservado; a interface agora informa essa diferença.

Na futura homologação, confirmar a compatibilidade da conta autenticada com o usuário comprador de teste, país/site, vendedor/aplicação, chave pública e credencial do mesmo ambiente. O guia oficial de compra teste orienta usar o usuário e cartão de teste. Uma eventual incompatibilidade é hipótese a verificar, não diagnóstico demonstrado das recusas antigas. Não trocar a identidade autenticada ou credenciais automaticamente, nem gravar esses valores em logs para investigar.

## Recuperação implementada

1. Antes de uma criação, mantém-se a validação oficial do plano e a aquisição da lease existente.
2. Uma criação marcada como iniciada só volta a ser repetível pela ação de rejeição definitiva já existente. Falha de transporte, JSON inválido, conflito, 5xx ou timeout depois do início não desfazem essa marca.
3. A nova RPC de falha, exclusiva de `service_role`, relê o contrato sob o mesmo advisory lock e exige a lease vigente. Se não existe provider vinculado nem POST iniciado, encerra a tentativa como `done/payment_pending`, registra `checkout_failed` e conserva reserva/histórico.
4. Nos demais casos delega à ação histórica de reconciliação. Nenhuma capabilities é concedida pela falha, pela interface ou por `back_url`.
5. Uma nova tentativa exige ação expressa do usuário, novo token oficial e o mesmo contrato/versão reservados. Consultar situação ou reconciliar não cria assinatura sem token.
6. A leitura do contexto bloqueia nova confirmação enquanto uma lease está vigente. Registros antigos contraditórios são apresentados de acordo com as marcas duráveis; não há UPDATE em lote, correção manual do contrato real, exclusão ou backfill.

`create_started=false` permite a recuperação apenas no contrato local protegido e nos caminhos descritos. Não se transforma uma pesquisa vazia em autorização para limpar `create_started=true`.

## Busca e trial

O reconciliador mantém busca paginada. Consulta parcial sem resultado não comprova ausência. Mesmo busca completa vazia mantém a criação incerta bloqueada; nunca é usada para repetir POST. Mais de um candidato, recursos divergentes e respostas incompletas continuam fechando com erro.

`verifiedSnapshot`, incluindo `billing_trial_mismatch`, foi preservado byte a byte. `next_payment_date` anterior ao fim esperado do trial, sem pagamento que justifique o ciclo posterior, continua impedindo confirmação. Não foi presumida uma interpretação especial para uma data igual à criação. A explicação do Mercado Pago e a evidência de trial real continuam pendentes.

## Pendências externas

- Causa da recusa real antiga: o dado seguro necessário não foi registrado à época.
- Mercado Pago deve confirmar os códigos/estruturas específicos de `/preapproval` para cartão, identificação, comprador de outro site, mistura de ambientes e plano indisponível antes de acrescentar classificações específicas.
- Confirmar oficialmente eventual comportamento de cache/idempotência da criação após recusa; a 051 mantém a chave existente e não depende de uma garantia nova do provider.
- Homologar tokenização real, autorização, trial, data de cobrança e recuperação, exclusivamente com o fluxo externo autorizado posteriormente.
- MP-01 permanece pendente de entrega real autenticada de notificações de Assinaturas. Simulador, fixtures, consulta oficial isolada e reconciliador não substituem essa evidência.
