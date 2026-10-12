# MP-01 — investigação sobre a SYZIA 049 atual

Rodada autorizada em 12/10/2026. Base: 049 + Sharp 0.35.5 + hotfix consolidado (050 existente). **MP-01 continua PENDENTE DE HOMOLOGAÇÃO EXTERNA.** Nenhuma migration nova, alteração financeira, credencial, publicação ou operação real.

## Correção pontual

Somente `server/billing/mercado-pago.mjs` mudou em produção. Se `MERCADO_PAGO_WEBHOOK_SECRET` já estiver configurado, a ausência de `x-signature` agora é recusada com 401 também em `resource_lookup`. Antes, retirar o header dispensava a verificação. HMAC válido continua sendo apenas um indício: as consultas oficiais e validações de vínculo permanecem obrigatórias.

Não alterar/remover segredos para fazer uma notificação passar. A origem da chave e o formato efetivo das notificações de Assinaturas precisam ser confirmados pelo Mercado Pago. `resource_lookup` sem segredo permanece com o comportamento anterior: verifica o recurso server-side, **não autentica a origem do POST**. Não chamar esse modo de Webhook autenticado.

## Contratos não presumidos

`notification_url` em POST `/preapproval` permanece uma hipótese da integração anterior; este hotfix não confirma nem modifica esse campo. Não converter para Checkout Pro/IPN nem alterar start_date, trial, preço ou cronograma por tentativa.

O receptor atende `subscription_preapproval`, `subscription_authorized_payment` e `payment`. Eventos de plano (`subscription_preapproval_plan`) são ignorados sem efeito financeiro; não são eventos de uma assinatura individual. IPN e formatos legados não foram adicionados. O mapeamento e o cadastramento oficiais dos tópicos da aplicação continuam pendentes.

A checagem existente de sete dias permanece: free_trial ausente/divergente ou next_payment_date antecipado, sem pagamento confirmado, causa `billing_trial_mismatch`. Não significa que ocorreu cobrança; também não comprova que o trial funciona. A causa da data informada pelo proprietário exige os retornos de criação/consulta do plano e assinatura, saneados, e confirmação do provider.

## Reconciliação preservada

`billing:reconcile` usa o runtime server-side existente. Recupera recursos, estados e operações previamente autorizadas; pode concluir comandos pendentes e cancelamentos vencidos. **Não é um comando estritamente de leitura** e não foi executado com ambiente real. Não substitui a homologação de notificações. O teste automatizado usa exclusivamente transporte fictício e banco descartável.

O servidor unificado já agenda reconciliação quando `MERCADO_PAGO_ENABLED=true`: padrão de 300 segundos, configurável por `BILLING_RECONCILE_INTERVAL_SECONDS`, sem sobreposição no mesmo processo e com parada coordenada. O CLI separado continua disponível. Limites existentes: lote de até 1.000 contratos, lease de dois minutos, busca paginada com limite de segurança, processamento HTTP síncrono e consultas sequenciais. O contador `succeeded` do reconciliador inclui retornos sem exceção; não prova que cada contrato foi aplicado (lease ocupado pode retornar pending). Não foi feita mudança de arquitetura ou de métricas.

## Testes e integridade

```sh
npm ci
node --test --test-concurrency=1 tests/billing-047/mp01.test.mjs
npm run test:billing:047
npm run build
npm run test:current-gate
```

Os novos testes foram acrescentados à etapa `billing-047` do gate vigente. Os manifestos históricos permanecem intactos. Os verificadores 048/049 usam `tests/support/mp01-integrity.mjs` como exceção explícita: somente o adaptador tem hash novo exato, com confirmação do hash histórico. Todos os demais arquivos protegidos continuam exigindo seus hashes anteriores; nenhum teste funcional anterior foi removido.

Documentos externos da entrega: `SYZIA-049-MP01-DIAGNOSTICO.md`, `SYZIA-049-MP01-CORRECOES.md`, `SYZIA-049-MP01-TESTES.md`, `SYZIA-049-MP01-PENDENCIAS-EXTERNAS.md`. O relatório de correções inclui aplicação, inventário, hashes e rollback por sobreposição. Não reaplicar migrations nem substituir arquivos privados.

Fontes consultadas em 12/10/2026: documentação oficial de Webhooks/Assinaturas, referência `/preapproval`, planos e faturas, SDK oficial Node `mercadopago@3.6.1` lido isoladamente sem adicionar dependência. URLs e limites do contrato estão no diagnóstico.
