# Publicação controlada — sem laboratório adicional

Este procedimento será executado pelo proprietário **somente após autorização**. Não exige servidor local nem instalação do SQLite da POC. Não configura serviços, DNS ou segredos automaticamente.

## Sequência inicial

1. Conferir o incremental e o inventário. Validar em branch separada. Manter a POC da Fase 2.1 arquivada e os contratos Mercado Pago inalterados.
2. Aprovar a migration 069. Fazer backup conforme o procedimento atual do Supabase. Executar somente a nova migration no projeto operacional correto, em janela aprovada. Ela nasce bloqueada e não contata provedores.
3. Preparar o deploy do backend e frontend atuais. Não criar outro serviço. O start permanece `npm start`/`node server/unified.mjs`. Usar o mesmo `PORT` e os mesmos mecanismos existentes de Auth e origem permitida.
4. Manter os valores iniciais abaixo, além das configurações atuais da SYZIA. Não alterar variáveis Mercado Pago, Resend ou Supabase Auth.
5. Após publicação autorizada, verificar `/health`, login e administração de uma assinatura Mercado Pago existente, sem nova contratação.

| Variável | Publicação inicial |
|---|---|
| `BILLING_CHECKOUT_MODE` | `disabled` |
| `STRIPE_ENABLED` | `false` |
| `STRIPE_ENVIRONMENT` | `test` |
| `STRIPE_OPERATIONS_ENABLED` | `false` |
| `STRIPE_PRODUCTION_CONFIRMED` | `false` |
| `MERCADO_PAGO_ENABLED` e demais variáveis MP | Preservar a configuração aprovada para administrar os contratos existentes |
| `BILLING_PROVIDER` | Preservar seu valor anterior; não usar esta variável para selecionar Stripe |
| `VITE_BILLING_API_URL` | URL HTTPS atual do backend; nenhum segredo Stripe no frontend |

`disabled` suspende aquisições; não troca o provedor de contratos anteriores. `internal` habilita apenas o checkout Mercado Pago existente. `stripe` seleciona apenas o Checkout hospedado. Valores desconhecidos são rejeitados. O banco também precisa estar no modo aprovado, evitando bypass por RPC direta.

## Conectividade oficial sem operação financeira

Após autorização, cadastrar no Render as variáveis do namespace de teste, usando segredos obtidos diretamente na conta Stripe. Não enviá-los por chat ou adicioná-los ao Git.

| Variável | Valor não secreto já informado pelo proprietário |
|---|---|
| `STRIPE_TEST_ACCOUNT_ID` | `acct_1UXNEIBckoU1IhdM` |
| `STRIPE_TEST_PRODUCT_ID` | `prod_VYXYmag6YgTPoc` |
| `STRIPE_TEST_PRICE_MONTHLY` | `price_1UXQT3BckoU1IhdMTuaDL3nH` |
| `STRIPE_TEST_PRICE_SEMIANNUAL` | `price_1UXQT4BckoU1IhdMSRfR0DQ2` |
| `STRIPE_TEST_PRICE_ANNUAL` | `price_1UXQT4BckoU1IhdM36nUP29n` |
| `STRIPE_TEST_SECRET_KEY` | Segredo de teste, somente no backend |
| `STRIPE_TEST_WEBHOOK_SECRET` | Segredo do endpoint criado na Stripe, somente no backend |

Ativar **somente** `STRIPE_ENABLED=true`; manter `BILLING_CHECKOUT_MODE=disabled` e `STRIPE_OPERATIONS_ENABLED=false`. A aplicação usa explicitamente a API `2026-09-30.endive`.

O Super Admin ativo pode abrir **Planos e assinaturas → Conectividade Stripe → Verificar conectividade (somente leitura)**. Essa ação chama `POST /billing/stripe/preflight`, autenticado, que internamente faz apenas cinco GETs Stripe: conta, produto e três preços. Não cria Checkout Session, Customer, Subscription ou Invoice. O resultado separa catálogo oficial verificado e mapeamento no banco conferido/pendente. Um resultado positivo não é homologação de pagamento ou webhook.

## Endpoint online de teste

URL: **`<API_HTTPS_ATUAL>/billing/stripe/notifications`**. Se o domínio atual do backend for `https://api.usesyzia.com.br`, o caminho completo será `https://api.usesyzia.com.br/billing/stripe/notifications`. Confirmar a URL realmente publicada; nenhum domínio foi configurado por esta entrega.

No ambiente de teste Stripe, selecionar API Endive e estes eventos:

- `checkout.session.completed`, `checkout.session.expired`;
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`;
- `customer.subscription.trial_will_end`, `customer.subscription.paused`, `customer.subscription.resumed`;
- `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.finalization_failed`.

O proxy deve preservar o corpo e `Stripe-Signature`. Não adicionar autenticação Bearer nesse endpoint. Ele exige assinatura válida e ambiente correto. Uma resposta HTTP 200 significa envelope recebido de maneira durável/ignorado de forma conhecida; **não** significa pagamento nem acesso concedido. Eventos conhecidos permanecem na fila até reconciliação por GET; eventos sem contrato local são `unbound`.

O endpoint Mercado Pago continua `/billing/notifications`, com sua validação e segredo próprios.

## Configuração do banco, sem habilitar contratação

Após a migration aprovada, o proprietário pode registrar os mapeamentos por `public.billing069_configure`, a partir de sessão administrativa autorizada no Supabase SQL Editor. Essa função não recebe segredos e não chama Stripe. Exemplo **não executado**:

```sql
select public.billing069_configure(
 'disabled', 'test', false, array[]::uuid[],
 '[
  {"code":"monthly","account_id":"acct_1UXNEIBckoU1IhdM","product_id":"prod_VYXYmag6YgTPoc","price_id":"price_1UXQT3BckoU1IhdMTuaDL3nH"},
  {"code":"semiannual","account_id":"acct_1UXNEIBckoU1IhdM","product_id":"prod_VYXYmag6YgTPoc","price_id":"price_1UXQT4BckoU1IhdMSRfR0DQ2"},
  {"code":"annual","account_id":"acct_1UXNEIBckoU1IhdM","product_id":"prod_VYXYmag6YgTPoc","price_id":"price_1UXQT4BckoU1IhdM36nUP29n"}
 ]'::jsonb
);
```

Mapeamentos registrados são imutáveis por esta função. Divergências exigem revisão, não sobrescrita. Os planos novos ficam ocultos no catálogo público antigo.

## Autorização posterior de testes semestral e anual

Não executar nesta publicação inicial. Exige autorização específica para cada assinatura de teste e organização preparada exclusivamente para homologação.

1. Confirmar o ambiente `test`, o catálogo e os mapeamentos. Cadastrar a organização autorizada em `test_organizations` pela função de configuração, com `confirmation_enabled=true` e modo `stripe`, apenas após a autorização. Não incluir empresas reais de clientes.
2. No Render, habilitar `STRIPE_OPERATIONS_ENABLED=true` e selecionar `BILLING_CHECKOUT_MODE=stripe`. Não mudar nenhum segredo Mercado Pago.
3. Entrar como administrador autorizado dessa organização; conferir modalidade, valor integral, trial elegível e condições; usar exclusivamente cartão oficial de teste no Checkout hospedado.
4. Verificar, por leitura, a cadeia contrato → sessão → cliente → assinatura → fatura. Conferir cartão, sete dias exatos e primeira cobrança integral. Status de navegador ou evento isolado não substitui essas provas.
5. Observar a fila durável e o motor compartilhado. Consultas administrativas sanitizadas possíveis: `private.billing069_runtime`, `private.billing069_stripe`, `private.billing069_inbox` e o contrato correspondente em `private.billing047_contracts`. Não exportar corpos de eventos ou dados pessoais.
6. Após a janela aprovada, voltar `BILLING_CHECKOUT_MODE=disabled` em backend e banco; manter a gestão dos contratos do provedor original. Não recriar a assinatura mensal já validada na Fase 2.1.

A organização já utilizada para trial mantém esse histórico. Não limpar reservas/claims para obter outro período grátis. A assinatura mensal da POC não é adotada automaticamente: falta um vínculo operacional previamente autorizado e comprovado.

## Produção futura

As variáveis equivalentes usam prefixo `STRIPE_PRODUCTION_`. Exigem Secret Key live, produto/preços reais correspondentes, endpoint e segredo próprios. `STRIPE_PRODUCTION_CONFIRMED=true` é uma confirmação adicional, não substitui homologação. Os IDs de teste acima não podem ser copiados para o namespace de produção. Não há conversão automática de Customers, cartões ou contratos.

Antes de vendas reais, cumprir as pendências do relatório, especialmente ciclos oficiais, interface, troca de modalidade, checkout expirado e procedimentos de reversões. Manter o modo `disabled` até nova autorização.

## Render Free e reconciliação

O agendador existente executa reconciliação serializada aproximadamente a cada cinco minutos quando o processo está ativo. Uma instância Free pode dormir; não há promessa de execução contínua ou SLA de entrega. A fila durável permite retomada após despertar/restart. A atualização autenticada do status também consulta o provedor. A resposta HTTP não libera acesso por si só. Nenhum serviço adicional ou plano pago foi contratado.
