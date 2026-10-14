# Contratos oficiais consultados

Consulta realizada durante esta rodada, em outubro de 2026. A documentação pública sustenta o uso do endpoint e SDK, mas não prova a resposta do contrato real do proprietário.

| Fonte oficial | Contrato relevante | Uso na alteração |
|---|---|---|
| [Gerenciamento de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management) | Atualização da assinatura com `card_token_id` em PUT; cancelamento, pausa e reativação | Trocar cartão na assinatura existente, sem POST de criação |
| [Atualizar assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/update-preapproval/put) | Requisição com token e resposta com vínculo, cartão, pagador e propriedades de recorrência | Validar resposta e reler assinatura antes de anunciar confirmação |
| [Visão geral de Assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview) | Recorrência e retentativas de cobranças recusadas; consulta de assinatura/faturas | Preservar retentativas do provedor e reconciliador; sem nova cobrança paralela |
| [CardForm — SDK oficial](https://github.com/mercadopago/sdk-js/blob/main/docs/card-form.md) | `createCardToken()`, `onCardTokenReceived`, `getCardFormData`, `onSubmit`, campos em iframe | Uma ação explícita de tokenização e comando, evitando submit automático duplicado |
| [Criar assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post) | `payer_email` e assinatura associada a plano | Preservar correção anterior de identidade pagadora; nenhum outro campo de criação foi alterado |

## O que a documentação não autoriza concluir

- `authorized` sem as demais evidências não substitui validação local de trial, pagamento, vínculo e permissões.
- Atualizar cartão não comprova pagamento de cobrança recusada nem garante retentativa imediata. A data/resultado real devem ser consultados e homologados externamente.
- A referência de atualização não garante últimos quatro dígitos em toda resposta de assinatura. Eles só são exibidos quando retornados por pagamento oficial cujo cartão corresponde ao atual.
- Não se inferiu a causa do mismatch real. Não se converteu versão textual em número, não se inventou primeira cobrança nem se removeu HMAC.
- O contrato/entrega de notificações de Assinaturas continua sujeito à MP-01. A documentação não converte simulação de webhook em homologação real.
