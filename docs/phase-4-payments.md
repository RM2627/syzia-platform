# Preparação de pagamentos opcionais — contrato da Fase 4

Esta fase entrega **schema, contratos, cálculo e testes**, sem integração financeira efetiva. Não existe gateway conectado, criação de cobrança real, Pix/cartão real, webhook ativo, carteira, custódia, split, saldo, saque, repasse, assinatura de empresas ou conciliação.

Usar a plataforma para receber pagamentos **é opcional**. Orçamento, agenda e futuro atendimento devem continuar disponíveis para empresas que recebem por Pix próprio, dinheiro, maquininha, transferência ou outro meio externo. O modelo futuro preferido é consumidor → provedor → conta da empresa prestadora, sem custódia pela plataforma.

## Implementado localmente

- `payment_rules`: regra por empresa, com override por serviço; opt-in futuro de pagamento integrado, meios externos, antecipação (`none`, `at_service`, `optional_deposit`, `required_deposit`, `full_advance`), sinal fixo ou percentual e diretrizes de cancelamento/reembolso. Todas as regras estão obrigatoriamente em `preparation_only`; a interface explica que não ativam cobranças nem bloqueiam a agenda.
- `payment_plans`: planejamento congelado e imutável ligado à versão final atual e aprovada do orçamento, ao consumidor e à organização corretos. Valor autorizado tem FK para o valor da versão. Não é uma cobrança. A RPC retorna `charge_created: false`. Repetição usa chave e hash do payload.
- `payments`: estrutura para registros futuros com moeda, tipo total/sinal, origem, método, estados, valores confirmado/reembolsado, referência externa, responsável e datas. Não há RPC cliente para criar/capturar/confirmar pagamentos nesta fase.
- `payment_events`: histórico financeiro futuro imutável. Auditoria da Fundação permanece em todas as novas tabelas.
- `consumer_preview_payment_plan` e `consumer_prepare_payment_plan`: somente administrador autorizado; recalculam valores no banco. O parâmetro de valor esperado não escolhe o preço: divergência é rejeitada.
- `server/payments/provider-contract.ts`: porta abstrata server-side, sem dependência de provedor; `PAYMENT_PROCESSING_ENABLED=false`.
- `src/payments/contracts.ts`: estados, identificação da origem da confirmação e contrato de futura reserva temporária com expiração.

## Cálculo e invariantes

Valor percentual é armazenado em basis points: 3.000 = 30%. Cálculo em centavos inteiros: teto de `total * basis_points / 10000`, sem arredondar para baixo o sinal. Regra específica do serviço prevalece sobre a da empresa. Sinal fixo superior ao orçamento é recusado, nunca reduzido silenciosamente. Sem antecipação, planejamento de pagamento antecipado total vale zero. Na regra de pagamento no atendimento, o total permanece devido no atendimento; nenhum bloqueio antecipado é criado.

Somente versão final atual/aceita gera planejamento. Alterar posteriormente uma proposta não altera plano já congelado. FKs compostas impedem trocar empresa, consumidor, versão ou valor do plano em um registro financeiro. Valores são não negativos, reembolso não excede confirmação, confirmação não excede cobrança prevista.

Uma confirmação externa exige `manual_external`, ator e data; não aceita provedor/ID externo nem `provider_verified`. Confirmação integrada exige `provider_verified`, provedor e identificador externo; não usa responsável manual. Os CHECKs não substituem autorização: as operações financeiras efetivas continuam indisponíveis aos clientes nesta fase.

## Estados e apresentação futura

| Estado | Significado |
|---|---|
| `not_required` | Não há pagamento antecipado requerido |
| `pending` | Pendente |
| `awaiting_confirmation` | Aguardando confirmação adequada à origem |
| `partial` | Sinal/valor parcial confirmado |
| `paid` | Valor total confirmado |
| `failed` | Falha |
| `expired` | Prazo expirado |
| `cancelled` | Cancelado |
| `refund_pending` | Reembolso solicitado/pendente |
| `refunded` | Reembolso confirmado |

A interface futura deverá apresentar “Pagamento externo registrado pela empresa” para confirmação manual e “Pagamento confirmado pelo provedor” somente para confirmação automática autenticada. A função `confirmationLabel` separa essas mensagens. Na jornada atual não há botão “Pagar” ou sucesso financeiro simulado.

## Próxima implementação financeira: decisão de Marcelo

Antes de ativar, escolher provedor e homologar credenciais/contas de teste; verificar titularidade da conta recebedora e associação à empresa; criar RPCs transacionais/autorizadas; definir estados/transições; confirmar valores/moeda/versão; validar assinatura do webhook com corpo original, timestamp, repetição e chave de evento única; implementar idempotência no provedor e banco; registrar confirmação manual por ator autorizado; definir estorno/cancelamento e acompanhamento.

Reservas aguardando sinal precisam de `expiresAt` e liberação automática transacional, usando a mesma proteção de capacidade. Não transformar o atual `confirmed` em uma reserva eterna aguardando pagamento. O contrato `FutureReservationHold` prepara esses campos, mas **não bloqueia horário nem executa expiração nesta fase**, pois nenhum pagamento está ativo. Nenhuma conversão automática entre pagamento e execução/recebimento financeiro.

Testes locais de RLS, valores, percentuais, versão, confirmação manual e separação da agenda estão em `tests/presence-payments.test.mjs`. Registros pagos usados nesses testes são fixtures privilegiadas locais, claramente identificadas; não são uma função de recebimento da plataforma.
