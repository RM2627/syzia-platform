# Dicionário de métricas — Fase 7

Todos os agregados são calculados no SQL sobre registros existentes. O navegador formata valores e desenha barras; não baixa listas de clientes para produzir indicadores. Não há receita presumida, ranking individual ou vigilância.

## Períodos e dimensões

A visão comercial usa a **coorte de oportunidades criadas entre as datas selecionadas**. Progresso observado até o fim do período. Uma oportunidade anterior não entra apenas porque converteu no período. A série diária representa a data de criação do interesse; suas conversões são as alcançadas até o fim, não conversões ocorridas naquele dia.

Datas inicial/final inclusivas, máximo 366 dias, transformadas em `[início local, início do dia seguinte ao final)` no banco. O timezone permanece **America/Recife**, único permitido pela constraint original da Fundação. Não foi ampliada essa regra. Plataforma usa UTC. Horário da sessão SQL não modifica o recorte empresarial.

Serviço e origem filtram toda a coorte comercial. Indicadores humanos usam somente empresa/período, explicitado na tela. Origem ausente é **Não informada**, nunca inferida como Direto. Nomes de serviços/origens são dimensões atuais persistidas, não histórico versionado de atribuição. Não há marketing/UTM inferido.

| Indicador | Definição |
|---|---|
| Oportunidades | Interesses persistidos criados no período, incluindo rascunhos |
| Solicitações enviadas | Oportunidades com evento `submitted` até o fim |
| Propostas finais | Pelo menos uma versão final enviada; estimativas iniciais não contam |
| Aprovações | Evento real `approved` |
| Agendamentos | Evento `booked` ou `rescheduled`; único por oportunidade, inclui reservas posteriormente canceladas |
| Conversões | Evento comercial `converted`, conforme critério registrado pela Fase 6 |
| Taxa | Conversões / oportunidades × 100; zero se denominador zero |
| Perdas e encerramentos | Evento `lost`, `refused`, `expired`, `cancelled`, `ineligible` ou `limit_reached` |
| Valor orçado | Última versão FINAL ENVIADA de cada solicitação da coorte antes do fim; não soma revisões/estimativas |
| Valor aprovado | Versão aceita de cada solicitação com evento de aprovação até o fim |
| Receita | `null`, indisponível: não existe comprovante financeiro |
| Tarefas de retorno | Todas as tarefas criadas para a coorte até o fim; inclui canceladas/substituídas |
| Tentativas | Registros imutáveis de tentativas efetivamente registradas |
| Conversões após tentativa | Conversão posterior a alguma tentativa; associação temporal, **não prova de causalidade** |
| Serviços/origens | Oportunidades e conversões agrupadas |

Agendamento direto pode pular etapas. Encerramento e conversão podem coexistir em oportunidade reaberta. Valores comerciais não são somados entre estágios. Proposta expirada continua tendo sido orçada; não se torna receita. Valores de origem são BRL em centavos inteiros.

## Atendimento

Tickets criados no período; eventos observados até o fim. Resolvidos = tickets com evento `resolved`, mesmo se reabertos depois. Primeira resposta = primeira mensagem do consumidor até primeira mensagem posterior/simultânea de empresa/atendente. Notas internas não contam. Média/mediana SQL em segundos corridos, exibidas em minutos. Ticket sem mensagem do consumidor não entra no denominador; amostra vazia retorna null, não zero.

A comparação de prazo usa a configuração **atual** `response_minutes`, sem reconstruir SLA contratual histórico (essa configuração não era versionada). Dentro: resposta até a referência; acima: resposta tardia ou falta de resposta vencida até o menor entre agora/fim do período. Não desconta expediente, pausas ou fins de semana. Sem prazo configurado, SLA retorna null. Fila atual (queued, abertos, atribuídos, aguardando empresa) é separada dos dados históricos. Nenhum desempenho individual é ranqueado.

## Plataforma e limites

Superadmin ativo: empresas totais/ativas, perfis ativos (incluindo consumidores), solicitações, tickets e reservas criadas no período. Não são unidades de cobrança ou planos; Fase 8 não implementada.

No máximo 366 dias de série, 50 serviços no agrupamento e 200 opções no seletor; sete origens. Totais não são truncados quando grupos são limitados. Sem cache compartilhado, exportação de PII ou eventos de navegação. Volume real/planos de execução permanecem para homologação externa.
