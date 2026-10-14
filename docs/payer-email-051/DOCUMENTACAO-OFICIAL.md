# Contrato oficial e escopo da correção

Consulta: 14/10/2026. Somente documentação do Mercado Pago. Exemplos oficiais não foram copiados integralmente para a implementação.

| Fonte | O que sustenta | Aplicação nesta correção |
|---|---|---|
| [Criar assinatura — POST /preapproval](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post) | `payer_email` é obrigatório e identifica o assinante; credenciais, aplicação e vendedor têm funções distintas | Enviar o e-mail pagador confirmado, mantendo autenticação e autorização SYZIA separadas |
| [Assinaturas com plano associado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-associated-plan) | O exemplo de criação contém `preapproval_plan_id`, `payer_email`, `card_token_id` e status autorizado | Manter checkout integrado e campos existentes; corrigir somente a origem do e-mail |
| [Geração do card token](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/cardtoken) | O CardForm documenta `cardholderEmail` em `getCardFormData()`; o token representa o cartão e tem uso limitado | Extrair o e-mail com o token, conferir com a confirmação local e descartar o token após a tentativa |

A separação entre login administrativo da SYZIA e pagador é uma interpretação da integração, sustentada pelos campos distintos do contrato. Não é uma declaração do provedor de que qualquer endereço digitado prova propriedade, consentimento ou autorização. O meio de pagamento e a resposta oficial continuam necessários.

A página de tokenização também contém exemplos de outro endpoint financeiro. Esses exemplos não foram transplantados para Assinaturas: não foi criada chamada adicional a `/v1/payments`.

Não há fundamento nesta evidência para remover `notification_url`, alterar `status`, mudar comprador, CPF, credenciais ou valores automaticamente. Nenhum desses campos foi modificado. A documentação pública do HTTP 400 não permite concluir a causa específica das tentativas informadas apenas a partir do status.

É necessário confirmar externamente: aceitação do e-mail do comprador na configuração de teste efetivamente usada; compatibilidade vendedor/aplicação/plano/comprador; token recém-gerado; regras do trial; semântica de retry após recusa definitiva com a chave existente; e entrega de eventos reais de Assinaturas. Essas verificações não foram executadas nesta rodada.
