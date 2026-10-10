# Matriz da rotina empresarial

Revisão local cumulativa das Fases 2–8. Registros fictícios; não representa homologação externa.

| Jornada | Entrada e ação | Persistência e autorização |
|---|---|---|
| 1. Primeira entrada | Home → checklist → tela exata | Checklist calculada no banco; gestor da empresa |
| 2. Preparar presença | Configurações → Página, identidade e agenda | Rascunho e publicação anteriores preservados |
| 3. Ver o dia | Home → Agenda de hoje / próximo / amanhã | Mesmas reservas do consumidor; horário da empresa |
| 4. Ver semana/mês | Agenda → Semana / Calendário | Consulta por período, limitada a 42 dias |
| 5. Novo cliente | Home → Novo cliente | Cadastro por empresa, telefone não autentica nem mescla |
| 6. Novo orçamento manual | Home → Novo orçamento | Solicitação + oportunidade + estimativa calculada no banco |
| 7. Enviar proposta | Orçamentos → solicitação → revisar valores | Versão final imutável; aprovação permanece do consumidor |
| 8. Agendar manualmente | Home → Novo agendamento | Mesmo recurso, regras de horário e constraint de conflito |
| 9. Consultar ficha | Agenda → compromisso | Cliente, serviço, itens, respostas, valores, origem e histórico |
| 10. Iniciar/concluir | Ficha → Iniciar / Finalizar → confirmar | Revisão e histórico; conclusão não é pagamento |
| 11. Cancelar/remarcar | Ficha → ação → confirmar | Transação preserva reserva anterior se novo horário falhar |
| 12. Bloquear agenda | Agenda → Bloquear período | Mesma tabela/recurso; não remove reservas existentes |
| 13. Decisão da equipe | Home → atenção / Pendências → ticket | Contexto e resposta empresarial nas estruturas existentes |
| 14. Acompanhar interessados | Comercial → oportunidade / próximo contato | Consentimento, limite, intervalo e histórico existentes |
| 15. Métricas e tutorial | Métricas; Ajuda → Refazer tutorial | Agregados gerenciais; tutorial individual por empresa |

Atendimento próprio é um vínculo empresarial de colaborador explicitamente marcado pelo gestor. Atendimento compartilhado mantém papel global e vínculo vigentes. Modalidade mista permite os dois, respeitando prontidão, presença, contexto, autonomia e responsável único por ticket. Nenhum atendente recebe indicadores gerenciais por esse vínculo.

Não foi criado estado de “confirmação pendente” fictício: uma reserva aceita já é confirmada. A atenção da Home mostra pedidos submetidos/em análise e decisões não respondidas. A execução é separada do estado da reserva para preservar capacidade, cancelamento e histórico existentes.

## Auditoria das 15 tarefas solicitadas

| Tarefa do prestador | Ponto inicial e passos/telas | Resultado e evidência | Fricção/correção |
|---|---|---|---|
| Abri pela manhã: o que tenho hoje? | Entrar → empresa → Home | Agenda do dia, estado e ações; navegador desktop/mobile | Entrada deixou de priorizar vínculos administrativos |
| Quem é meu próximo cliente? | Home → próximo atendimento | Próximo compromisso ativo calculado no servidor | Card abre a ficha diretamente |
| O que foi contratado? | Home/Agenda → ficha | Itens, referência/aprovação, respostas, origem e histórico; navegador | Dados reunidos, sem navegar por telas técnicas |
| Cliente chegou: iniciar | Agenda → ficha → Iniciar → confirmar | Transição autorizada e auditada; SQL local | Estado inválido/futuro próximo é rejeitado |
| Terminei: concluir | Ficha em execução → Finalizar → confirmar | Evento único; métrica de conclusão; SQL local | Não registra pagamento ou receita |
| Mudar horário | Ficha → Reagendar → escolher → confirmar | Histórico anterior; reserva preservada na falha; SQL e UI | Confirmação explica preservação da reserva |
| Recebi pelo WhatsApp | Home → Novo agendamento → cliente/serviço → horário | Entidades e cálculo existentes; SQL e UI | Cliente pode ser criado dentro do fluxo; erro de horário preserva solicitação |
| Bloquear amanhã 12–14h | Agenda → Bloquear período → dia/início/fim → confirmar | Mesmo recurso/constraint; SQL e UI | Bloqueio aparece como compromisso distinto |
| Atendente pede autorização | Home → atenção → ticket → responder | Contexto e retorno ao responsável existentes; suíte Central | Link de notificação aponta o ticket, sem busca manual |
| O que tenho amanhã? | Home → Amanhã | Agenda de amanhã, itens abrem ficha; navegador | Sem trocar filtros para consulta rápida |
| Consultar semana | Agenda → Semana → data | Sete dias e bloqueios; navegador | Lista por dia no celular |
| Como está meu negócio? | Navegação → Métricas → período/filtros | Agregados anteriores + conclusões; regressão Analytics | Indicadores separados da Home operacional |
| Funcionário sem métricas | Configurações → Pessoas e acessos → Atendente próprio | Vínculo atômico; SQL testa privilégio e promoção | Marcação explícita, sem papel global administrativo |
| Preparar atendimento compartilhado | Configurações → modalidade → checklist de atendimento | Manual/FAQ/regras/autonomia/prontidão derivados; SQL + UI de configuração | Ajuda explica finalidade; alteração exige reativação revisada |
| Próprios e compartilhados juntos | Modalidade mista → prontidão → Central | Elegibilidade por vínculo; responsável único e transferência existentes | Não há segunda Central ou dupla responsabilidade |

Níveis de prova: navegador local não é teste de usuário externo; SQL local não é teste com Auth real. As tarefas de iniciar/concluir e gestão de vínculo têm prova de transação local, além das telas revisadas; a matriz não afirma validação em dispositivos físicos ou Supabase externo.
