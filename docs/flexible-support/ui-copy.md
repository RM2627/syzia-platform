# Textos finais da UI — 046

| Local | Texto |
|---|---|
| Benefício de plano | Suporte compartilhado no atendimento |
| Descrição do apoio | Para empresas que querem contar com o apoio da equipe compartilhada da SYZIA no atendimento aos clientes. |
| Escopo | Apoio em dúvidas, triagens e acompanhamentos, conforme disponibilidade e dentro das regras definidas pela sua empresa. |
| Modelo A | Conforme disponibilidade da equipe |
| Modelo B | Horário programado |
| Configuração flexível | A grade semanal não é obrigatória. A presença da Central indica quem pode assumir novos atendimentos. Tickets e mensagens continuam na fila quando não houver equipe disponível; entrar na fila não consome unidade. |
| Fila na ficha | Aguardando apoio. A equipe compartilhada poderá auxiliar este atendimento quando houver disponibilidade. Entrar na fila não consome atendimento. |
| Consumidor sem humano disponível | Recebemos sua mensagem. A equipe responsável responderá assim que estiver disponível. |
| Presença indisponível | Sua presença está indisponível para assumir novos atendimentos. Selecione Disponível na Central quando puder assumir atendimentos da fila. |
| Política inativa | Apoio compartilhado desativado |
| Disponibilidade atual | Há equipe disponível para assumir; o apoio depende da fila e das permissões. |
| Sem disponibilidade atual | A equipe compartilhada poderá auxiliar quando houver disponibilidade. |
| Consulta empresarial | Consultar horário programado |

Os valores de limite, consumo, datas de ciclo e timezone vêm da configuração real. Não há número comercial ou horário fixado pela 046. Descrições personalizadas dos planos continuam sendo exibidas; os textos compartilhados são acrescentados quando a capability `human_support` está presente. A mensagem personalizada fora do horário programado permanece a cadastrada na 045.

As telas de capabilities, onboarding e edição de planos usam a terminologia de apoio compartilhado. Pessoas e acessos mantém o rótulo existente “Equipe SYZIA · Atendimento compartilhado”, já coerente com o modelo. A explicação de consumo no editor foi alinhada à regra existente da 045: assumir/receber transferência consome um ticket distinto por ciclo; fila, consumidor e mensagens adicionais não multiplicam.

Fontes: `src/availability/support-copy.ts`, `src/availability/Availability.tsx`, `src/central/Central.tsx`, `src/central/model.ts`, `src/api.ts`, `src/billing/{Billing,PlanEditor,Capabilities}.tsx`, `src/acquisition/PublicSite.tsx`, `src/operations/Onboarding.tsx` e a mensagem genérica na migration 046.
