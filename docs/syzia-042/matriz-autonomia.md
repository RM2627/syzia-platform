# SYZIA 042 — matriz de autonomia efetiva

Para atendimento compartilhado e demais operadores sujeitos ao teto de atendimento, autorização exige a interseção: **capacidade do plano + papel elegível + vínculo/status ativo + grant individual + autonomia atual revisada + autonomia publicada + escopo + regras do objeto/estado**. Consentimento também é exigido nos canais que o requerem.

Administradores mantêm sua autoridade empresarial já existente; os checkboxes de delegação não retiram o poder próprio do ADM de configurar/operar a empresa. Uma atribuição não transforma Equipe SYZIA em ADM. Grants e autonomia de A não alteram B.

| Ação configurável | Grant exigido | Semântica efetiva / limites |
|---|---|---|
| Informar preço tabelado (`price_list`) | `quotes.values` | Referência fixa publicada; não é autorização para editar preço. |
| Informar faixa (`price_range`) | `quotes.values` | Limite mínimo e máximo explícitos e publicados. Somente “a partir de” não cria uma faixa. A referência explícita é exibida no catálogo/manual. |
| Criar orçamento tabelado (`quote_create`) | `quotes.manage` e `quotes.values` | Composição determinística autorizada, com validação existente. Avaliação/preço variável continua no escopo empresarial. |
| Enviar orçamento (`quote_send`) | `quotes.manage` e `quotes.values` | Envio definido/autorizado e regras do pedido. Não libera calculadora empresarial variável ao compartilhado. |
| Alterar itens (`quote_items`) | `quotes.manage` e `quotes.values` | Não concede criação de preço manual, alteração arbitrária de base ou adicional técnico não autorizado. Guardas da 041 permanecem. |
| Aplicar desconto (`discount`) | `quotes.manage` e `quotes.values` | Ação atual e publicada autorizadas; menor teto percentual entre configuração atual e publicada; preço travado bloqueia desconto. Não libera cálculo variável compartilhado. |
| Explicar condições publicadas (`negotiate`) | `central.reply` | Informação sobre condições já publicadas. Não cria preço, benefício, política ou compromisso novo. |
| Agendar (`schedule`) | `agenda.manage` | Pedido apto, duração final e todas as regras da Agenda. Reserva divisível é integral. |
| Remarcar (`reschedule`) | `agenda.manage` | Revalida disponibilidade e estado. Diferencia um período de replanejamento do conjunto. |
| Cancelar (`cancel`) | `agenda.manage` | Estado e regras vigentes; no cancelamento integral, todas as partes. |
| Buscar encaixe (`fit_in`) | `agenda.manage` | Busca disponibilidade dentro da capacidade. Não ignora conflito, bloqueio, buffer ou duração. |
| Follow-up (`follow_up`) | `followup.manage` | Teto atual e publicado, elegibilidade, regras de oportunidade, estado e consentimento aplicáveis. |
| WhatsApp (`whatsapp`) | `central.reply` | Permissão efetiva e contato autorizado/consentimento. A disponibilidade de número não certifica integração ou envio externo. |
| Pós-atendimento (`aftercare`) | `followup.manage` | Regras e escopo do acompanhamento existente; não acrescenta automação externa. |

## Publicação e revogação

Uma ação permitida na configuração atual, mas ausente no manual publicado, permanece indisponível ao operador delegado. Quando a empresa revoga uma ação ou reduz o teto atual, a próxima operação considera a restrição imediatamente, mesmo antes de republicar. A publicação continua sendo o fluxo existente; a migration não publica rascunhos automaticamente.

`company_attendant_permission` é um predicado de autorização, não uma mutação. Cada comando ainda valida o objeto, o estado, o tipo de serviço e o escopo. Mesmo que `quote_items`/`discount` sejam permitidos, a Equipe SYZIA não recebe a calculadora variável proibida pela 041.

## Casos executados

| Combinação | Resultado local |
|---|---|
| Autonomia SIM + grant SIM + demais condições válidas | Permitido (SQL 08). |
| Autonomia SIM + grant NÃO | Negado (09). |
| Autonomia atual NÃO + grant SIM | Negado antes de republicar (10). |
| Ampliação ainda não publicada | Negada (11). |
| Capability ausente, com membership legado | Negado (12). |
| Atribuição revogada em sessão aberta | Negado; sem fallback legado (13). |
| Preço “a partir de” sem máximo versus faixa explícita publicada | Somente a faixa explícita satisfaz `price_range` (14). |
| Desconto dentro/fora do menor teto efetivo | Permitido/negado conforme teto (15); preço variável continua negado (16). |
| Encaixe e condições sem/com grant válido | Predicados respeitam grant; reserva respeita capacidade e conflitos (17, 27–29, 39, 43–44). |

A tabela documenta o comportamento implementado e a validação local. Homologação real de canal externo/consentimento/concorrência permanece separada no relatório técnico.
