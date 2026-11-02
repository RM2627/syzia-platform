# Validação direcionada — Fase 3

Dados e provedores exclusivamente simulados. Banco PostgreSQL embarcado/PGlite descartável, carregando as migrations operacionais até 069. Nenhum Supabase remoto ou serviço financeiro real foi utilizado.

| Conjunto | Resultado | Evidência |
|---|---|---|
| Integração SQL + transporte Stripe online | PASS: 22/22 registros na execução integral; caso adicional de upgrade populado também PASS | `stripe-final.log`, `populated-upgrade.log` |
| Total único da nova suíte após adicionar o caso de upgrade | 23 registros Node, dos quais 2 são agrupadores de subtestes | Mesmos logs, sem contar repetições como casos novos |
| Regressões compartilhadas | 34 casos históricos afetados: 7 do gateway 047, 18 de notificações 050 e 9 do servidor unificado 048 | `transport-regression.log`, `mp-observe-fix.log` |
| Correção encontrada na regressão | 050-N03/N15 inicialmente falharam por alteração do código de bloqueio do modo observe. Foi restaurado `billing_disabled` e ambos passaram, sem alterar os testes históricos | `mp-observe-fix.log`, 2/2 PASS |
| TypeScript + Vite principal | PASS | `build.log` |
| Sintaxe Node do backend afetado | PASS | `backend-syntax.log` |
| Navegador desktop/mobile | NÃO EXECUTADO: falha de infraestrutura ao iniciar navegador | `browser.log`, `browser-install.log` |
| Supabase Auth remoto, Render e Stripe oficial | NÃO EXECUTADO nesta rodada | Nenhuma credencial ou operação real utilizada |

O log de regressão compartilhada inclui também cinco testes novos de transporte que já estão contados na suíte nova; não foram contados novamente. Os dois FAILs iniciais de observe estão explicitamente preservados com seu resultado posterior. Não há gate geral nem repetição dos 79 testes da Fase 2.1.

## O que os testes efetivamente demonstram

- Migration fechada por padrão, planos antigos e mapeamentos preservados; upgrade de contrato Mercado Pago populado mantém todos os campos anteriores, adicionando apenas o provedor.
- RLS/FORCE RLS, negação de RPC de serviço ao navegador, Super Admin para preflight e proteção entre organizações.
- Autenticação consultada por `auth.getUser` e sessão reforçada chamada antes da RPC no adaptador Supabase simulado. Isso não substitui teste de um JWT/sessão real online.
- Contrato único sob duas solicitações concorrentes; reserva histórica do trial e nenhum grant antes da leitura oficial simulada.
- Três preços corretos, períodos 1/6/12 meses e faturas integrais; sem parcelamento implícito.
- Trial aplicado uma única vez no ledger existente, inclusive cancelamento de renovação feito antes da primeira confirmação local.
- Assinatura do corpo original, alteração de um byte rejeitada, deduplicação durável, reconstrução do controller e reconciliação; envelopes sem e-mail ou corpo bruto.
- Customer/organização/ambiente divergentes rejeitados. Evento não vinculado não cria empresa nem adota assinatura antiga da POC.
- Perda da resposta de criação: não há segundo POST; um evento de sessão permite recuperação por GET oficial validado.
- Cancelamento e reativação da renovação continuam pelo provedor original com aquisições suspensas.
- HTTP/CORS, limites de corpo, proteção de segredos, respostas incertas e ausência de fallback entre provedores.
- Preflight Super Admin executa apenas GETs e distingue validação do catálogo e do mapeamento persistido.

## Navegador

Dois testes foram adicionados em `tests/stripe-online/ui.spec.ts`: ofertas/consentimento/bloqueio em 1440, 390 e 360 px; retorno pendente sem liberação por URL. O harness monta o componente real com backend simulado.

A tentativa falhou antes de executar a jornada porque não havia o executável Chromium esperado. Foi tentada a instalação do navegador; o arquivo recebido estava vazio/truncado. Não há screenshots aprovadas ou alegação de revisão visual. Executar esses testes em CI com Chromium disponível, ou homologar a interface online controlada antes de abrir contratações.

## Comandos reproduzíveis

```sh
npm run test:stripe:online
node --test --test-concurrency=1 tests/billing-047/gateway.test.mjs tests/hotfix-050/notifications.test.mjs tests/syzia-048/unified.test.mjs
npm run build
npm run test:stripe:online:browser
```

O último comando requer o navegador Playwright. Ele usa porta exclusiva 5189, um worker, zero retries e não reutiliza servidor remanescente. Os testes não solicitam segredos nem enviam e-mails ou operações Stripe reais.

## Evidências oficiais anteriores

A assinatura mensal, o cartão vinculado e o trial de 02/11 a 09/11/2026 foram informados pelo proprietário como confirmados na API oficial. Não foram recriados nem consultados novamente nesta execução. A conta, produto e IDs não secretos foram documentados para configuração futura. A compatibilidade da nova persistência e dos webhooks online continua pendente.

Contrato de API reutilizado da Fase 2.1: `2026-09-30.endive`; `allowed_payment_method_types=['card']`, coleta `always`, retorno com `payment_method_types` somente cartão, períodos em `subscription.items`, faturas com `parent/pricing`. Referências técnicas preservadas: https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions , https://docs.stripe.com/webhooks e https://docs.stripe.com/payments/checkout/free-trials . Fixtures são sintéticas e não representam capturas autenticadas da conta.
