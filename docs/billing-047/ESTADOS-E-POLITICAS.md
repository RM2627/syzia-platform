# Billing 047 — estados e políticas

Autoridade: recurso MP consultado pelo servidor → contrato local → versão imutável do plano → capabilities existentes → papel/grants/autonomia/vínculo. Os estados MP não são usados por telas operacionais ou RLS. O adaptador limita sua tradução à fronteira de billing.

| Estado local | Evidência/condição | Operação paga |
|---|---|---|
| `payment_pending` | Reserva sem confirmação ou período expirado sem pagamento | Restrita |
| `trialing` | Assinatura autorizada + cartão vinculado + `free_trial` oficial de 7 dias | Capabilities da versão até `trial_end` |
| `active` | Fatura vinculada + pagamento aprovado consultado na API, valor/ciclo conferidos | Até fim do período pago |
| `grace_period` | Falha de cobrança; 3 dias desde vencimento da primeira fatura não regularizada | Mantida dentro da tolerância |
| `paused` | Pausa externa, sem intenção local de cancelamento com saldo de acesso | Restrita |
| `cancel_scheduled` | Provider confirmou pausa/cancelamento; ainda há trial/período pago | Até fim do período, sem renovação |
| `canceled` | Cancelamento confirmado e nenhum período restante | Restrita |
| `restricted` | Tolerância expirou, reversão financeira ou limite de membros impede downgrade | Restrita; dados preservados |
| `reconciliation` | Contratação pendente com resposta incerta | Sem concessão de acesso |

Erro de reconciliação de contrato já confirmado não estende direitos: mantém somente o período comprovado anteriormente. Suspensão administrativa não é retirada por pagamento. O wrapper `billing_effective` recalcula expiração ao autorizar; o cron não é necessário para negar uso após um prazo vencido.

## Preço e trial

Somente Essencial 4990, Profissional 8990 e Equipe 14990 centavos, BRL, mensal. Assistido permanece no sistema existente, fora do catálogo comercial 047. O backend mapeia versões já aprovadas; não fabrica capabilities nem migra todos os contratos antigos automaticamente.

Cada oferta tem dois IDs de plano MP: com `free_trial={frequency:7,frequency_type:days}` e sem trial. O segundo atende identidades com benefício consumido; não é um quarto plano comercial. A UI precisa enviar a expectativa de trial apresentada e o servidor rejeita divergência antes de criar. Sem elegibilidade, a tela informa cobrança mensal imediata sem apresentar R$ 0.

Claims persistentes de responsável/conta, empresa, documentos e demais identificadores disponíveis do mecanismo anterior são reservados atomicamente antes da chamada externa. Reserva incerta não é liberada automaticamente. Confirmar a assinatura grava uma única concessão nas tabelas de trial existentes. CPF/CNPJ são normalizados e transformados em fingerprints; não representam consulta governamental. Trocar slug, empresa, plano ou checkout não apaga histórico. Cartão não é identificador de elegibilidade.

## Cobrança, cancelamento e mudança

A SYZIA não cria cobranças paralelas. Somente a recorrência MP cobra e retenta. A tolerância é ancorada no vencimento da fatura, não na chegada do webhook; eventos repetidos não reiniciam 3 dias. Recuperação consultada no provider restaura automaticamente acesso, respeitando bloqueios administrativos.

Cancelar pausa a recorrência imediatamente no provider. A interface só confirma a interrupção após nova leitura oficial. O acesso local continua até o maior entre trial e período pago. A reconciliação cancela definitivamente a assinatura pausada ao fim desse prazo. Reativação é permitida enquanto pausada e dentro do período de acesso; assinatura definitivamente cancelada exige nova contratação, sem novo trial.

Não há pró-rata, crédito nem débito avulso. Upgrade e downgrade alteram o valor da próxima recorrência. A versão/capabilities só mudam quando a fatura do novo ciclo, no novo valor, foi aprovada. A associação original `preapproval_plan_id` permanece; altera-se a recorrência da assinatura individual, nunca o preço global do plano. A compatibilidade dessa alteração com plano associado deve constar da homologação MP.

Downgrade é recusado antes do pedido se exceder membros. O limite é conferido novamente na confirmação financeira: se a equipe cresceu, operação paga fica restrita, dados/membros permanecem e o administrador precisa decidir os vínculos. Após correção explícita e reconciliação, a versão nova entra em vigor.

## Concorrência e auditoria

Eventos de contrato já substituído não atualizam a projeção pública nem as capabilities da assinatura vigente; sua auditoria financeira privada permanece.

Uma assinatura corrente por empresa, comandos por chave idempotente, reserva global de identidades, lease de processamento e versão/fingerprint de snapshot. Leituras e operações não podem sobrepor uma nova intenção confirmável. Resposta perdida após POST não permite novo POST automático: busca por `external_reference`, valida vínculo e reconcilia. Rejeição explícita 400/401/403/422 pode permitir outro token; falhas de transporte/5xx permanecem incertas.

Auditoria privada registra início/vínculo/trial/pagamentos/estado/pedidos de cancelamento, reativação, método, mudança, webhook e reconciliação. Duplicação de snapshot não duplica seus efeitos; logs HTTP têm apenas código seguro, evento e request ID. Sem Access Token, card token, payload bruto, PAN ou CVV.

## Notificações e reconciliação

Receptor `/billing/notifications`: `subscription_preapproval`, `subscription_authorized_payment` e `payment`. O último apenas localiza referência já vinculada; todos consultam novamente assinatura/faturas/pagamentos. Valida recebedor, aplicação, referência, assinatura, moeda, valor e vínculo. Notificação não autenticada criptograficamente é indício para leitura oficial, nunca autoridade para alterar estado. HMAC só é exigido no modo configurado e comprovadamente aplicável; não se presume que o segredo geral de Webhooks exista para Assinaturas.

`npm run billing:reconcile` consulta contratos correntes em lotes de até 1000, priorizando os menos recentemente verificados. Retorna contagem e código não-zero quando há pendências. Executar periodicamente e monitorar; não chamar a partir do navegador com chave privilegiada. Repetir rodadas até cobrir o volume. Requisições externas não ocorrem dentro de transações SQL.

**Limitação externa MP-01:** ver seção específica do `GUIA-MERCADO-PAGO-TESTE.md`. A entrega local não comprova que a URL enviada em `notification_url` na criação de `/preapproval` seja aceita/ativada pelo provider. A documentação pública consultada não resolve essa lacuna. Não usar o gate offline como prova desse contrato externo.
