# Contrato preparado de pagamento — 033

Estado: **INTEGRAÇÃO DE PAGAMENTO REAL PENDENTE**. Não existe coleta de cartão/CVV, provider escolhido, cobrança real, cron de cobrança ou validação externa nesta entrega.

O gateway recebe apenas ID/revisão de rascunho da sessão autenticada. Consulta o próprio rascunho no banco e chama um adaptador server-side. A implementação entregue aceita apenas `mode: test`, `name: mock`, explicitamente injetado no processo da demo descartável. Resultado: `valid` e referência opaca, ligada a titular, rascunho, revisão e prazo. O navegador não escolhe o provider, o estado válido ou a referência persistida.

O banco revalida proprietário, identidade ativa, plano publicado/atual, elegibilidade, método e consentimento antes de criar organização/ADM/trial atomicamente. Guarda preço em centavos, periodicidade, versão do plano/condições, texto consentido, fim do trial, ator, referência opaca, data e indicação de simulação. Trocar dados/plano invalida a revisão anterior do método. Proposta vencida exige revisão das condições.

Ao integrar um provider após a decisão do proprietário, será necessário implementar e homologar: componente/tokenização hospedada; confirmação server-side da posse/validade do método; idempotência da cobrança; assinatura/autenticidade e replay dos eventos; conciliação do valor/contrato/organização; rotinas de vencimento; retries/tolerância e regras de cancelamento. Não substituir `simulation` por falso sem implementar essas garantias e retirar os bloqueios deliberados no contrato. Reutilizar billing_subscriptions, billing_invoices, os contratos existentes de checkout/provider e sua auditoria.

Na simulação atual, fim do trial prepara fatura pendente. Evento confirmado ativa assinatura e registra apenas a primeira conversão. Falha vira past_due; suspensão continua administrativa e auditada. Cancelamento antes do fim do trial não gera a primeira fatura. Validação do método não conta como receita ou conversão. Renovação não conta como uma nova aquisição. As métricas mostram conversões simuladas separadas de reais.
