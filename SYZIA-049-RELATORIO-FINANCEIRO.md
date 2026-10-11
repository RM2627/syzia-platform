# SYZIA 049 — Financeiro

## Resultado e preservação

Integração 047 preservada. `mercado-pago.mjs`, `subscriptions.mjs`, `runtime.mjs`, `http.mjs` e `server/unified.mjs` têm comparação SHA-256 com a 048 no gate. Não foram alterados preços (R$ 49,90 / 89,90 / 149,90), trial de sete dias, tolerância de três dias, cancelamento, troca de plano, antifraude ou capacidades. Assistido permanece indisponível. Nenhum endpoint novo concede assinatura.

Os seis planos de teste já existentes e seus vínculos de lançamento não foram consultados, recriados ou alterados. Não executamos `configure-plans.mjs --apply-test`, reconciliação remota ou conexão ao Supabase/Render. `MERCADO_PAGO_ENABLED=false` no Render deve permanecer assim nesta etapa.

## Ensaio isolado reproduzível

Na raiz do projeto, após `npm ci`:

```sh
npm run homologation:billing:isolated
npm run homologation:billing:isolated -- --offline
npm run test:billing:047
npm run test:049
```

O primeiro comando sai com código 2, intencionalmente desativado. Somente `--offline` ativa o ensaio. Ele não lê `.env`, cria PGlite efêmero separado para cada plano, injeta transporte Mercado Pago em memória e substitui o `fetch` global por uma rejeição de rede. Não abre servidor público. Resultado esperado para os três planos: `trialing → active → cancel_scheduled → active`, `externalCalls: 0`. Fechar o processo descarta os bancos. Não usar seu banco de lançamento para obter esse resultado.

A suíte 047 continua cobrindo checkout, antifraude, retorno, cobrança, tolerância/recuperação, troca de plano, limite de membros, concorrência, cancelamento e indisponibilidade. A 049 adiciona os três tipos de evento com HMAC, divergência query/body, ausência/adulteração de assinatura, consulta efetiva de recursos e repetição sem duplicação.

## Webhooks e HMAC

| Evento | Recurso consultado | Autoridade |
| --- | --- | --- |
| `subscription_preapproval` | `/preapproval/{id}` | Assinatura oficial e vínculo local |
| `subscription_authorized_payment` | `/authorized_payments/{id}`, assinatura e pagamentos | Fatura vinculada, recebedor, valor e pagamento oficial |
| `payment` | `/v1/payments/{id}`, vínculo e assinatura | Recebedor e `external_reference`; pagamento isolado não libera acesso |

O adaptador preservado verifica `x-signature`, `x-request-id`, timestamp e ID normalizado, usando HMAC SHA-256 e comparação constante. Usa o segredo de Webhooks da aplicação/ambiente correto, não o Access Token. Quando `data.id` aparece na query, deve coincidir com o corpo. Status, valor e data recebidos na notificação não são prova financeira. A confirmação vem da consulta oficial e da validação de vendedor, aplicação, referência, plano, BRL, recorrência, valor e estado.

A documentação atual de Assinaturas alerta que a configuração geral por “Suas integrações” não é o método disponível para Assinaturas, embora a página também descreva assinatura e validador de Webhooks. Por isso, não inferimos compatibilidade operacional apenas pelo simulador. Manter HMAC; se eventos reais não trouxerem o contrato esperado, registrar amostra sanitizada e investigar o mecanismo específico de Assinaturas. Não desligar validação para obter HTTP 200.

HTTP 503 no simulador com gateway desligado é esperado. Não comprova assinatura, cobrança ou entrega de eventos reais.

## Roteiro externo — PENDENTE, AÇÃO DO PROPRIETÁRIO

1. Manter o backend publicado desligado para billing. Separar um banco **novo de homologação**, sem clientes, assinaturas ou histórico do banco de lançamento. Não restaurar dump de produção. Registrar claramente URL/ref do projeto separado antes de qualquer comando.
2. Aplicar a cadeia de migrations no banco separado, configurar Auth/Storage e criar somente contas/empresas fictícias pelos fluxos normais. Publicar no catálogo isolado as três versões comerciais aprovadas. Conferir os IDs de versão locais: não presumir que serão iguais aos IDs do lançamento.
3. Reutilizar os seis planos Mercado Pago já validados, na mesma conta vendedora/aplicação de teste. Conferir novamente, com consulta somente leitura, vendedor, aplicação, valor, BRL, mês e trial de cada ID. No banco **isolado**, cadastrar as associações com a RPC administrativa `billing047_offer_set(p_code,p_version,p_trial_plan,p_paid_plan)` usando service role exclusivamente server-side. Isso cria vínculos locais no banco separado; não cria planos Mercado Pago. Não repetir `configure-plans.mjs --apply-test` no banco de lançamento.
4. Configurar um arquivo de ambiente local separado, fora de Git, com URL/chaves do banco isolado e credenciais da vendedora de teste. Conferir manualmente que não aponta ao banco de lançamento. Usar `MERCADO_PAGO_NOTIFICATION_AUTH=hmac`, segredo correto e `MERCADO_PAGO_ENABLED=true` **somente nesse processo isolado**. Conferir `PLATFORM_APP_ORIGIN`, `CONSUMER_ORIGIN`, `MERCADO_PAGO_NOTIFICATION_URL` e variáveis server-side descritas em `.env.server.example`; o adaptador deriva o retorno da origem configurada. Não alterar Render.
5. Disponibilizar, por decisão e configuração do proprietário, um endpoint HTTPS isolado para `/billing/notifications`; usar o mecanismo de notificação de Assinaturas aceito pelo provider para aquela aplicação e assinatura. Confirmar entrega dos eventos da compra real de teste; não substituir a URL de produção nem editar os seis planos sem necessidade e aprovação. Se a aplicação não aceitar o callback por assinatura utilizado pelo adaptador, parar e manter MP-01 aberta.
6. Usar compradora e cartões de teste oficiais, nunca cartão real. Para cada plano, conferir a oferta, vínculo do pagamento, sete dias gratuitos e primeira data. Completar compra; no retorno, a tela permanece confirmando até consulta server-side. Conferir assinatura local, versão e capabilities.
7. Cancelar uma assinatura durante trial e verificar no provider que a primeira cobrança foi impedida, mantendo o acesso local autorizado até seu limite. Reativar quando permitido; não conceder novo trial. Testar contratação sem trial com identidade sintética que já consumiu trial no ambiente separado, pelo fluxo legítimo; não apagar histórico para repetir gratuidade.
8. Quando o ambiente Mercado Pago suportar a recorrência de teste, observar uma cobrança aprovada, recusa e recuperação. Verificar três dias de tolerância, bloqueio pago sem apagar dados e recuperação automática. Não disparar cobranças paralelas ou editar o relógio/estado do banco de lançamento. Se o sandbox não produzir determinado evento, registrar esse caso como não homologado.
9. Verificar cancelamento no período pago, preservação até seu término, reativação e upgrade/downgrade pelos fluxos existentes. Conferir limite de membros antes de downgrade; nenhum funcionário deve ser apagado.
10. Testar dois cliques, duas abas, retorno simultâneo e repetição/reordenação de eventos reais de teste. Repetir apenas notificações sanitizadas válidas no endpoint isolado; não copiar tokens ou segredos para logs. Conferir ausência de duplicação nos efeitos/auditoria.
11. Interromper temporariamente a entrega de uma notificação apenas no ambiente isolado e executar `billing:reconcile` com seu arquivo de ambiente separado, após conferir novamente a URL do banco. Conferir convergência. O servidor unificado também agenda reconciliação quando habilitado: não deixá-lo conectado ao lançamento.
12. Guardar evidências sanitizadas de IDs de teste, evento, HTTP, recurso consultado, estado local, próxima cobrança e capacidades; não guardar Access Token, card token, CVV, cabeçalhos completos ou dados pessoais. Encerrar o processo isolado ao finalizar.

## Critérios de ativação comercial

MP-01 só encerra com eventos reais de teste recebidos e autenticados, recursos oficiais conciliados, trial/primeira cobrança/cancelamento/recuperação validados, concorrência sem efeitos duplicados e todas as pendências de ambiente resolvidas. Troca para credenciais/planos de produção exige uma etapa explícita do proprietário. O PASS local da 049 não autoriza essa troca.

Fontes oficiais consultadas: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks ; https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-test/payment-approval .
