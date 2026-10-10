# SYZIA 041 — roteamento, permissões e evidências

## Roteamento final

| Situação | Caminho | Autoridade / resultado |
|---|---|---|
| Serviço e todos os adicionais fixos, imediatos, duração e regras válidas | Consumidor conclui no wizard | Motor existente calcula e reserva atomicamente, sem ticket obrigatório ou proposta final. |
| Composição multisserviço inteiramente determinística | Mesmo caminho direto | Uma solicitação e uma reserva da duração total. Relações/regras publicadas continuam validadas. |
| Serviço “a partir de” / “sob consulta” / jornada configurada para avaliação | Atendente próprio elegível; sem ele, ADM elegível | Um ticket com `routing_scope=company`, motivo visível e horário pretendido. |
| Pelo menos um item exige avaliação | Pedido inteiro para empresa | Não divide a composição em tickets comerciais concorrentes. |
| Exceção técnica/comercial fora da autonomia | Empresa | Encaminhamento no ticket existente. Sem repasse à SYZIA para arbitrar preço. |
| Não há próprio/ADM elegível | Fila empresarial | Preserva escopo empresarial, sem atribuir preço à Equipe SYZIA. |
| Dúvida determinística | FAQ, informações, regras/respostas publicadas; depois ajuda contextual | Compartilhado somente quando plano, vínculo, grants e autonomia autorizarem. |
| Dúvida sobre item variável | Ajuda contextual da empresa | Mesma solicitação em rascunho e contexto da jornada, sem proposta/appointment artificial. |
| Proposta aprovada, horário cabe | Motor de agenda | Reserva com duração final e capacidade revalidadas. |
| Proposta aprovada, horário não cabe | Consumidor escolhe novo horário | Preserva aprovação e versões, sem novo orçamento. |

Elegibilidade reaproveita as verificações existentes de empresa ativa, conta/vínculo, função de atendente, grants e acesso operacional. Roteamento para um responsável não concede grants novos. O histórico 040 não é reatribuído em massa.

## Permissões afetadas

| Ação | Consumidor autorizado no pedido | ADM / Super Admin com autoridade empresarial existente | Próprio autorizado | Próprio sem grants | Compartilhado SYZIA |
|---|---|---|---|---|---|
| Finalizar direto / aprovar / reservar | Sim, conforme estado e regras | Operações empresariais existentes | Conforme grants/autonomia existentes | Não por responsabilidade de ticket | Somente ações determinísticas existentes autorizadas |
| Ver ticket de avaliação empresarial | Sua conversa pública pelo acesso seguro | Sim | Conforme acesso Central existente | Conforme acesso de leitura, sem poder editar preço | Não pela fila/contexto/RLS de tickets empresariais |
| Montar preço final, item manual e desconto | Não | Sim, pela autoridade existente | Exige `quotes.read`, `quotes.manage`, `quotes.values` e teto publicado | Bloqueado | Bloqueado, inclusive RPCs antigas de edição arbitrária |
| Revisão determinística pelo manual | Não | Conforme ação | Conforme ação | Bloqueada sem ação concedida | Mantém fluxo existente, preço publicado e autonomia |
| Solicitar fotos da avaliação | Não | Exige autoridade e `central.reply` | Exige papel empresarial e `central.reply` | Bloqueado sem grant | Não solicita pela RPC empresarial |
| Enviar foto | Sim, vínculo do pedido/serviço e estado permitido | Fluxo consumidor não concede autoridade administrativa adicional | Idem | Idem | Não ganha acesso por conhecer código |
| Ler anexo privado | Somente pelo mecanismo autorizado do pedido | Gateway verifica escopo existente | Gateway e grants existentes | Sem permissão, negado | Sem ampliar acesso à avaliação empresarial |
| Publicar catálogo/regras | Não | Conforme configuração/publicação existente | Só com grants existentes | Bloqueado | Sem permissão empresarial adicional |
| Revogação | Link/sessão revogável preservado | Verificação a cada operação | Nova operação negada após revogação | Não contorna por UI aberta | Plano, vínculo e grants continuam revalidados |

`journey_ticket_visible` é a única função auxiliar nova com execução concedida ao papel autenticado para avaliação de policies; não retorna dados do ticket. Demais helpers privados ficam sem execução remota. RPCs públicas novas recebem grant autenticado e validam identidade/escopo/estado no servidor. Não há mudança para acesso global irrestrito ou membership artificial.

## Cobertura dos 29 itens obrigatórios

SQL refere-se à suíte `tests/syzia-041-sql.test.mjs`; navegador a `tests/demo-browser/syzia-041.spec.ts`. Todos os itens abaixo tiveram validação local aprovada. A tabela não declara homologação externa.

| Item do pedido | Evidência executada |
|---|---|
| 1. Contratação fixa sem atendente | SQL 02; navegador 01 |
| 2. Fixo + adicionais | SQL 03 |
| 3. “A partir de” para próprio | SQL 04 |
| 4. “Sob consulta” para ADM | SQL 05 |
| 5. SYZIA impedida de alterar preço | SQL 06–07, 32 |
| 6. ADM/próprio monta proposta | SQL 08, 20–23; navegador 02 |
| 7. FAQ sem ticket | Navegador 03: consulta e lista de pedidos vazia antes de abrir atendimento |
| 8. Ajuda contextual e retomada | SQL 18–19, 35; navegador 03 |
| 9. Agendamento direto | SQL 02–03, 26; navegador 01 |
| 10. Variável com horário pretendido | SQL 10; navegador 02, 04 |
| 11. Aprovação com horário disponível | SQL 11; navegador 02 |
| 12. Horário indisponível | SQL 12–13; navegador 07, novas opções e mesma versão aprovada |
| 13. Multisserviço determinístico | SQL 14 |
| 14. Multisserviço misto | SQL 15; regressão 038 |
| 15. Políticas de fotos | SQL 16, 33–34 |
| 16. Foto pelo acompanhamento | SQL 17; navegador 06 com envio pelo gateway local |
| 17. Calculadora e totais | SQL 20–22, 32; navegador 02 |
| 18. Duração por adicional | SQL 03, 11, 13, 20 |
| 19. Prévia como cliente | SQL 23; navegador 02 |
| 20. Versionamento | SQL 24; regressão 038 |
| 21. Claro/escuro | Navegador 01 escuro, 02 claro; capturas e revisão visual |
| 22. Desktop/mobile | Navegador 01–04, 06–07; mobile 390×844 sem overflow horizontal |
| 23. Isolamento A/B | SQL 06, 25, 31, 33, 35 |
| 24. Revogação em sessão | SQL 09, 30; regressões 039/040 |
| 25. Agenda existente | SQL 12–13, 26–27; regressões 038/040 |
| 26. Orçamento/multisserviço 038 | 22 casos da suíte histórica executados sobre 041 |
| 27. Planos/permissões 039/040 | 26 + 35 casos históricos executados sobre 041 |
| 28. Build/typecheck | `build.log` e `bundle.log` |
| 29. Upgrade populado | SQL 01: comparação das 119 tabelas nas colunas anteriores; integridade das migrations |

O adaptador de regressão altera explicitamente o ator de um caso 038 para ADM, porque a avaliação passou ao escopo empresarial. Não remove asserções de composição, proposta ou conversa. Os testes 039/040 continuam cobrindo contrato, trial, plano temporário, grants e isolamento afetados.

## Três fluxos de referência e capturas

As capturas vêm da interface atual da demo local, com dados exclusivamente fictícios. Caminhos relativos ao projeto:

| Fluxo | Percurso efetivo | Capturas |
|---|---|---|
| A — contratação direta | Página → item → informações → dados → disponibilidade → revisão → confirmação → reserva; consulta da Agenda | `reports/syzia-041/fluxo-a-direto.png` |
| B — avaliação | Página → variável → dados → horário pretendido → envio → calculadora/prévia → proposta → aprovação → reserva | `fluxo-b-pretendido.png`, `calculadora.png`, `fluxo-b-aprovado.png` |
| C — dúvida antes de contratar | Informações/FAQ sem ticket → contato consentido → mensagem/resposta → continuar → finalizar mesmo código | `fluxo-c-ajuda.png` |
| Exceção de horário | Pedido sob avaliação → outro pedido ocupa horário → aprovação mantém proposta e oferece novos horários → reserva | `horario-indisponivel.png` |
| Fotos | Próprio/ADM solicita na Central → consumidor envia no acompanhamento → estado fotos enviadas | `central-orcamento.png`, `fotos-acompanhamento.png` |
| Mobile | Wizard de avaliação e acompanhamento em tela estreita | `mobile-revisao.png`, `mobile-acompanhamento.png` |

Todos os nomes sem diretório acima estão em `reports/syzia-041/`. A demo usa Auth fixture e armazenamento local simulado; não foi utilizada uma conta real nem imagem de cliente real. A imagem do teste de upload é um quadrado sintético, usado exclusivamente para validar o transporte.

## Limites de evidência

Os testes locais de conflito/replay não substituem concorrência PostgreSQL real. O runner nativo foi bloqueado por mapeamento de UID; ver `native.log`. Auth/SMTP/Storage/PostgREST reais, restauração e revisão manual do proprietário permanecem pendentes. Nenhuma aprovação/reserva foi tratada como pagamento.
