# Mercado Pago — transição preparada, não ativada

## Regra e estado desta entrega

Não houve consulta real de planos, criação de plano/assinatura, cobrança, troca de credencial ou SQL remoto. A existência/estado dos seis planos informados pelo proprietário é evidência anterior; **não foi revalidada nesta execução**. Testes usam gateway simulado e banco local descartável. MP-01 continua pendente de comprovação externa de notificações reais.

| Oferta | Mensalidade | Plano trial | Plano pago |
|---|---:|---|---|
| Essencial | R$ 49,90 | SYZIA-ESSENCIAL-TRIAL | SYZIA-ESSENCIAL-PAGO |
| Profissional | R$ 89,90 | SYZIA-PROFISSIONAL-TRIAL | SYZIA-PROFISSIONAL-PAGO |
| Equipe | R$ 149,90 | SYZIA-EQUIPE-TRIAL | SYZIA-EQUIPE-PAGO |

BRL, intervalo mensal; variante trial com sete dias, variante paga sem período gratuito. Assistido permanece indisponível. Os códigos acima são referências externas, não substituem IDs de planos.

## Por que novas versões

`billing047_offer_set` continua protegendo mapeamentos utilizados. A migração 063 não altera ofertas antigas: adiciona registro por ambiente, novas versões comerciais por configuração explícita, ambiente imutável no contrato e auditoria. Preço, capacidades, limites e trial são copiados da versão válida e conferidos contra os três planos aprovados. Contratos existentes, reservas de trial e versões anteriores permanecem.

Contratos antigos recebem classificação `legacy`, não uma presunção de sandbox. O operador deve confirmar que todos os contratos atuais estão definitivamente cancelados no provedor, com operação concluída; `cancel_scheduled` isoladamente não basta. Configuração é recusada se houver operação ativa/incerta, versão desatualizada, identidade divergente, preço errado, plano repetido ou reutilização de ID histórico. Flags ausentes são recusadas. A assinatura que nascer depois utiliza o novo mapeamento; o mapeamento de origem do contrato fica imutável mesmo após troca de plano pelo motor existente.

## Gates de execução posterior

**G0 — aprovação técnica.** Revisar diff, migrations, relatórios e pendências do gate. Backup/revisão de banco e autorização expressa antes de qualquer ação externa. Não executar este guia apenas por extrair o ZIP.

**G1 — leitura autorizada.** Usar ambiente privado fora do repositório. Nunca transmitir segredos no chat, Git, logs ou argumentos. Variáveis: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_COLLECTOR_ID`, `MERCADO_PAGO_APPLICATION_ID`, `PLATFORM_APP_ORIGIN`, `MERCADO_PAGO_NOTIFICATION_URL`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_PRODUCTION_ACCOUNT_CONFIRMED=true`. Identidade/vínculo da conta precisam de confirmação do proprietário.

Após migration aprovada, `npm run billing:production-preflight -- --read-only-confirmed` consulta ambiente, digest dos mapeamentos e contagem de contratos bloqueantes. Sem esse argumento não faz requisições. O preflight não confirma cancelamento remoto: isso exige leitura separada sob a credencial correta do ambiente legado e revisão do proprietário.

Preparar JSON privado com três objetos, cada um contendo somente `code`, `source_version_id`, `trial_plan_id`, `paid_plan_id`. Obter UUIDs atuais e seis IDs reais, sem inventar. Salvar com extensão `.billing-private.json` fora do projeto; a proteção no gitignore é adicional, não destino recomendado.

```powershell
# Offline: valida estrutura e não faz requests.
npm run billing:production-configure -- --file=C:\SYZIA-PRIVADO\ofertas.billing-private.json
# Somente com autorização de leitura externa:
npm run billing:production-configure -- --file=C:\SYZIA-PRIVADO\ofertas.billing-private.json --validate-read-only
```

A validação usa seis GETs de planos: ID, status, preço, BRL, recorrência, trial, referência, vendedor e aplicação. Não faz POST/PUT ao Mercado Pago. Ausência de `live_mode` na resposta **não prova ambiente de produção**; a ferramenta exige declaração explícita do proprietário e vínculo vendedor/aplicação, além de rejeitar um `live_mode` contraditório quando presente. Caso a API não devolva campo exigido, interromper e confirmar o contrato com o Mercado Pago; não afrouxar a checagem para passar.

**G2 — configuração atômica no banco.** Nova autorização para escrita. Manter contratação desabilitada até concluir a coordenação banco/runtime. Executar ferramenta com `--apply-production --confirm=CREATE_NEW_PRODUCTION_VERSIONS`, `--expected-legacy-sha256=<digest conferido>` e `--batch-id=<UUID único>`. Reutilizar o mesmo UUID e conteúdo somente para retomar aquela mesma operação. A transação cria três versões e registro de seis planos; não cria planos externos. A repetição idêntica retorna o mesmo resultado. Mudança no conteúdo com o mesmo UUID falha.

**G3 — runtime e webhooks.** Configurar `BILLING_ENVIRONMENT=production` somente depois da configuração aprovada; alinhar identidade do runtime com os registros. O código antigo/ambiente divergente falha fechado. Ativar Mercado Pago comercialmente é decisão distinta e não executada aqui. Modo de observação em ambiente novo é recusado nesta versão, preservando o modo legado; não contornar com troca de flags.

Autenticação HMAC existente permanece obrigatória em produção. Conferir URL `/billing/notifications`, HTTPS, assinatura, request-id, vendedor/aplicação e logs sanitizados. Back URL só retorna à interface; não ativa assinatura. Notificações sem vínculo conhecido são registradas por ID para investigação e não consultadas com credenciais de outro ambiente. Reconciliação seleciona contratos do ambiente local e conserva snapshot/idempotência.

**G4 — homologação externa expressamente autorizada.** Validar assinatura real ou procedimento de teste permitido pelo produto Assinaturas, meio de pagamento, primeiro período, cancelamento, recuperação, eventos reais e duplicados; observar registros no provedor e aplicação. Esta entrega não autoriza cobrança real. Não marcar MP-01 nem produção como homologados com simulador de ID fictício ou mocks locais.

## Rollback e observabilidade

Antes de configuração, manter runtime `legacy`; migrations são aditivas e não iniciam cobrança. Depois de configurar e sobretudo após contrato real, não reverter banco/credenciais para teste nem editar `provider_environment`. Bloquear novas contratações de maneira controlada, preservar recepção/reconciliação e preparar correção incremental com conciliação externa autorizada. Não apagar contratos, reservas de trial ou auditoria. Registrar ID do lote/versões e digest, nunca token/cartão/e-mail completo. O script não imprime payloads do provedor.

## Referências oficiais consultadas

- [Consulta de plano](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval-plan/get).
- [Criação de assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post).
- [Visão geral de Assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview).
- [Gerenciamento de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management).

Consulta documental não substitui homologação externa de credenciais, planos, notificações ou ambiente.
