# SYZIA 047 — homologação Mercado Pago pelo proprietário

Este roteiro é para uma etapa posterior, em contas e projeto de teste. Nesta rodada não foram usadas credenciais reais, criadas assinaturas remotas, cobrados cartões ou feitos deploys. O adaptador local usa fixtures; resultados locais não demonstram disponibilidade do provider nem homologação externa.

## 1. Contas e credenciais de teste

Seguir os fluxos específicos de [contas de teste](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-test/test-accounts) e [compra teste de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-test/payment-approval). Usar vendedor e comprador de teste distintos, mesma região Brasil, cartão de teste indicado na documentação vigente. Nunca inserir cartão real.

No processo Node, por variáveis de ambiente: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PLATFORM_APP_ORIGIN` HTTPS, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_COLLECTOR_ID`, `MERCADO_PAGO_APPLICATION_ID` e `MERCADO_PAGO_NOTIFICATION_URL` HTTPS. Conferir no painel que a conta é de teste: o prefixo da credencial, sozinho, não é prova suficiente. Manter `MERCADO_PAGO_ENABLED=false` até a configuração revisada do ambiente de teste.

O frontend recebe somente a chave pública pelo endpoint de configuração. O e-mail autenticado na SYZIA é usado como `payer_email`; para o teste, cadastre o comprador fictício com o e-mail da conta compradora MP. Não copiar credenciais para logs, capturas, repositório ou chat.

## 2. Planos associados

Conferir as versões locais já aprovadas: Essencial R$49,90, Profissional R$89,90 e Equipe R$149,90; mensal, BRL, trial 7 dias. Assistido não pode ser mapeado. Usar a [API oficial de criação de plano](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval-plan/post), em ferramenta privada do operador, com Bearer do vendedor de teste.

Para cada preço criar uma variante para elegíveis com esta recorrência (exemplo Essencial; substituir apenas pelo preço aprovado da oferta):

```json
{
  "reason": "SYZIA Essencial — teste",
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",
    "transaction_amount": 49.90,
    "currency_id": "BRL",
    "free_trial": { "frequency": 7, "frequency_type": "days" }
  },
  "back_url": "https://SEU-AMBIENTE-DE-TESTE/empresas"
}
```

Criar também variante mensal no mesmo preço **sem** `free_trial`, para benefício já consumido. Não há novos planos comerciais: são duas configurações técnicas para cada oferta. Não usar dia fixo/proporcionalidade, repetitions ou end_date. Guardar somente IDs e dados não sensíveis.

Copiar `docs/billing-047/plan-mapping.example.json` para arquivo local, preencher UUIDs reais das versões de teste e os seis IDs MP. Validar sem rede:

```sh
node scripts/billing-047/configure-plans.mjs --file=SEU-MAPEAMENTO.json
```

Depois, exclusivamente no ambiente de teste configurado, definir `SYZIA_TEST_ACCOUNTS_CONFIRMED=true`, habilitar `MERCADO_PAGO_ENABLED=true` e executar:

```sh
npm run billing:configure:test -- --file=SEU-MAPEAMENTO.json --apply-test
```

O comando consulta e confere planos antes de vincular no banco. Não cria assinatura nem cobra. O mapeamento usado por contratos não pode ser substituído silenciosamente.

## 3. Notificações de Assinaturas — pendência MP-01

A [página oficial de Webhooks de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks) consultada em 05/10/2026 avisa que a configuração geral via “Suas integrações” **não é o método disponível para Assinaturas** e remete à configuração durante criação. Não seguir mecanicamente o passo a passo de Checkout Pro/Bricks.

Entretanto, a [referência de POST /preapproval](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post) e os tipos do SDK oficial Node consultados não especificam `notification_url` para essa operação. O destino do link de configuração durante criação também não esclareceu esse contrato. **Esta é uma lacuna externa aberta, não uma configuração comprovada.**

O adaptador contém `notification_url` no corpo de criação como hipótese de integração, isolada em `server/billing/mercado-pago.mjs`. Antes de homologar contratação externa, obter confirmação oficial do mecanismo efetivamente aplicável à aplicação de Assinaturas e verificar se esse campo é aceito e gera entrega real. Se o provider exigir outro mecanismo, ajustar somente essa fronteira e repetir testes. Não marcar MP-01 como PASS apenas porque a API ignorou o campo ou porque um POST manual chegou ao receptor. Não configurar o painel geral como substituto silencioso.

O receptor e processamento local estão implementados para `subscription_preapproval`, `subscription_authorized_payment` e `payment`. Conforme [informações adicionais oficiais](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/additional-info), eventos de pagamento também precisam ser considerados. Configurar os tópicos pelo mecanismo que o Mercado Pago confirmar para essa integração; validar entregas originadas por eventos reais de teste.

`MERCADO_PAGO_NOTIFICATION_AUTH=resource_lookup`: cada evento é apenas indício; o servidor consulta recursos oficiais, confere recebedor/aplicação/vínculos e só então atualiza. Não alega validar origem por assinatura. Se o mecanismo oficial escolhido fornecer segredo HMAC aplicável, configurar `MERCADO_PAGO_NOTIFICATION_AUTH=hmac` e `MERCADO_PAGO_WEBHOOK_SECRET`; testar cabeçalhos e manifest oficiais. Nunca inventar segredo ou presumir equivalência com Webhooks de outro produto.

**Critério de aprovação MP-01:** documentar fonte/orientação oficial, destino configurado, tópico entregue por assinatura/pagamento de teste, resposta 200, recurso consultado, vínculo correto e efeito local único; repetir entrega e inverter ordem. A reconciliação é recuperação operacional, não comprovação de que notificações estão configuradas.

## 4. Retorno e primeira contratação

Servidor Node e frontend de teste devem usar origem HTTPS e callback HTTPS alcançável. A URL de retorno de cada assinatura é construída pelo backend: `/painel/{organization_id}/assinatura?retorno=1`. Nenhum preço, `status=approved`, token ou flag dessa URL concede acesso.

1. Escolher cada um dos três planos com identidade elegível. Conferir “7 dias grátis”, “Hoje: R$ 0,00”, primeira cobrança estimada em sete dias e preço mensal correto. Antes da autorização, a data é estimativa; depois vem do contrato consultado.
2. Preencher o formulário oficial MP com dados de teste. Campos de PAN/CVV ficam nos iframes MP. O token é transitório e enviado somente ao backend, que cria `/preapproval` com plano associado, cartão tokenizado e estado autorizado.
3. Fechar/voltar pelo navegador: tela deve informar confirmação em andamento; só assinatura/método consultados no servidor iniciam trial.
4. Conferir `trial_end`, `next_charge`, BRL/mês e capabilities. CPF/CNPJ ou responsável já usados devem conduzir à variante sem novo trial, com cobrança explicitamente apresentada antes de confirmar.
5. Confirmar que não houve cobrança do valor mensal durante os sete dias. Verificar eventuais validações de cartão próprias do provider conforme documentação de teste; não confundir com mensalidade da SYZIA.

## 5. Cobrança, falha e recuperação

Aguardar o ciclo oficial de teste; não encurtar o trial comercial ou forjar data no banco real. Para recuperação/falha, usar cenários e cartões de teste documentados pelo MP. Conferir fatura em `/authorized_payments/{id}` e pagamento associado em `/v1/payments/{id}`. Estado “authorized” da assinatura, isoladamente, não prova mensalidade paga.

Recusa: mensagem “Não conseguimos confirmar sua cobrança. Atualize sua forma de pagamento para evitar a interrupção do serviço.”; tolerância local de três dias desde vencimento. Atualizar o método e deixar as retentativas oficiais atuarem. Verificar recuperação automática; se prazo terminar, restringir sem apagar conta, empresa ou histórico. Não criar pagamento paralelo para simular retry.

## 6. Cancelamento, reativação e mudança

Cancelar durante trial: provider deve confirmar pausa e não lançar primeira mensalidade; acesso local até fim do trial. Cancelar depois de pagar: pausa impede renovação e acesso permanece até fim do período pago. Job de reconciliação encerra definitivamente ao vencer. Testar também falha na resposta do provider: a UI não anuncia cancelamento confirmado antecipadamente.

Reativar somente assinatura pausada ainda dentro do prazo. Confirmar manutenção do mesmo contrato/benefício e ausência de nova concessão de trial. Conferir no provider o vencimento após reativação. Se o provider mudar datas ou cobrar antes do período já concedido, considerar homologação reprovada e não ativar produção.

Troca Essencial ↔ Profissional ↔ Equipe: sem pró-rata, próxima cobrança no novo valor, capacidades anteriores até comprovação do novo ciclo. Validar no MP que atualizar `auto_recurring.transaction_amount` em assinatura associada preserva frequência, trial e data esperada. Não atualizar o plano MP global. Downgrade com membros excedentes deve exigir decisão explícita do administrador; nenhum funcionário é apagado ou escolhido automaticamente.

## 7. Operação e evidências externas

Executar `npm run billing:reconcile`, simular perda de webhook, retorno simultâneo e evento repetido/antigo. Conferir auditoria privada sem segredos. Guardar evidências anonimizadas fora da base: IDs de teste, horários, estados e valores; sem token, dados de cartão ou credenciais.

Registrar PASS/FAIL separadamente para SDK/tokenização, configuração MP-01, criação dos três planos, trial real de sete dias, cobrança mensal, recusa/retry, cancelamento, reativação, troca com plano associado e reconciliação. Nenhum desses resultados externos foi fabricado nesta entrega.

Referências adicionais: [plano associado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-associated-plan), [gestão de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management), [card token oficial](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/cardtoken), [pró-rata documentado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-customization/payment-methods/proportional-amount), [API de assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview).
