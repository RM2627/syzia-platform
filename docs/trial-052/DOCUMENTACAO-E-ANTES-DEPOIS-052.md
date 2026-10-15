# Documentação e comparação antes/depois

## Fontes oficiais consultadas

- [Mercado Pago — Obter assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval/get)
- [Mercado Pago — Atualizar assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/update-preapproval/put)

As referências apresentam `version` como número relacionado às modificações e exemplos com zero. O conteúdo consultado não garante expressamente sua presença em todos os retornos, nem declara opcionalidade universal. A omissão no caso real é evidência fornecida pelo proprietário; não foi obtida nesta rodada por consulta autenticada.

A referência GET também expõe identificadores, condições recorrentes, status e `last_modified`. A referência PUT permite atualização do meio de pagamento pelo token oficial. Não se presume atomicidade entre PUT e GET nem uma garantia de consistência imediata não documentada: leituras contraditórias ou insuficientes continuam pendentes. Datas iguais com fatos distintos, sem contador que demonstre avanço, são rejeitadas conservadoramente.

## Comparação

| Situação | Antes | Depois |
| --- | --- | --- |
| CPF válido sem comprovação adicional | Revisão documental necessária para elegibilidade | Decisão automática por consistência e histórico |
| CPF inválido ou inesperado | Validação nos fluxos existentes, com regras de formatação diferentes | Normalizador compartilhado no cliente; contrato equivalente no banco |
| Registro de identidade verificada | Necessário como condição rotineira | Preservado para verificação explícita; nunca fabricado |
| Reserva do próprio contrato | Podia aparecer como identidade já reservada no contexto | Reconhecida como pertencente ao contrato atual |
| Pedido antigo pendente | Dependia da verificação adicional | Reavaliação automática; conclusão auditada após confirmação financeira |
| `version` ausente | `billing_binding_mismatch/version` | Ausência aceita; demais validações continuam obrigatórias |
| `version = 0` ou inteiro positivo | Aceito | Aceito; regressão de contador continua bloqueada |
| `version = null`, string, negativo ou fração | Rejeitado | Rejeitado; não convertido em ausência |
| Persistência sem contador remoto | Exigia atribuição do campo | Preserva último contador conhecido; usa data e fatos oficiais para ordenação |
| Troca de cartão sem `version` | Podia falhar depois do PUT | Confirmação por resposta oficial + GET, cartão e data; contador validado quando disponível |
| PUT incerto | Não reenviado automaticamente | Mesma proteção mantida; ausência de mudança observável continua pendente |
| Assinatura existente incerta | Consulta do vínculo existente | Mesmo contrato e assinatura; sem novo POST ou novo trial |
| Problema financeiro | Estado de conferência, potencial confusão com elegibilidade | Identificação explícita como assinatura em conferência |
| Histórico, HMAC, preços e duração | Protegidos | Preservados |

## Evidência local inicial

Na reprodução antes da alteração, a propriedade ausente causou exatamente `billing_binding_mismatch/version`. Zero e inteiro positivo passaram. Null, string, negativo, fração e inteiro inseguro falharam. Com propriedade ausente e vendedor divergente, o erro continuou sendo de vendedor, demonstrando a ordem das verificações.

Depois da alteração, testes de snapshot e integração com banco local demonstram recuperação de assinatura simulada sem `version`, concessão única e consultas repetidas sem recriar assinatura. Há testes negativos para outros vínculos e condições financeiras com `version` ausente.

Essas evidências não comprovam recuperação da assinatura real do proprietário. Se outra validação falhar na homologação externa, o acesso deve permanecer bloqueado e o diagnóstico específico deve orientar a investigação.
