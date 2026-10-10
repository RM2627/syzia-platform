> **Atualização de decisão — UX-001 / feature freeze:** o proprietário aprovou exclusivamente UX-001 no documento `docs/ux001/request.md`. Implementação e encerramento desta intervenção em `RELATORIO-UX001-FINAL.md`. **UX-002 — ADIADO_PARA_POS_LANCAMENTO**, sem alteração. O conteúdo abaixo é o registro histórico da auditoria anterior; a expressão “aguardando aprovação” de UX-001 foi superada por essa autorização explícita.

# Decisões de UX — aguardando aprovação

Nenhuma proposta abaixo foi implementada. São decisões que ultrapassam o refinamento local de carregamento autorizado nesta rodada.

## UX-001 — AGUARDANDO_APROVACAO — UX-MÉDIO

**Problema:** abrir um ticket pelo ambiente empresarial navega para `/central/:code`. A navegação da empresa desaparece, o contexto muda para a Central global e a aba da fila volta ao padrão. Na inspeção, depois de selecionar “Todos” na empresa e abrir o primeiro ticket, foi necessário selecionar “Todos” novamente para encontrar outro ticket. A troca direta entre “Pendências” e “Atendimento”, por outro lado, mantém o estado local da aba do mesmo componente, podendo conservar o filtro anterior.

**Impacto:** perda de orientação e de filtro; cliques adicionais na rotina da empresa. A operação continua disponível e foi exercitada após selecionar a aba novamente.

**Evidência:** `src/central/Central.tsx`, links de ticket para `/central/`; `reports/ux-performance/before/measurements.json` e `after/measurements.json`, sondas `ticket-2-*` com fila diferente da inicialmente selecionada. As sondas de troca efetiva após reabrir “Todos” estão em `before-actions/` e `after-actions/`, com sucesso. Não confundir o timeout dessa sonda com falha da API de ticket.

**Proposta:** decidir se o atendimento empresarial deve manter `/painel/:empresa/atendimento?ticket=...` e o filtro da empresa ao abrir/trocar tickets; definir explicitamente a aba inicial ao alternar Atendimento/Pendências. A Central global continuaria tendo sua rota própria.

**Risco:** alteração estrutural de navegação, histórico/voltar, links de Home/Comercial e interpretação de filtros. Exige testes de ambos os contextos e dos papéis. Não é correção automática nesta rodada.

**Telas:** Home, Pendências, Atendimento empresarial, Central global, tickets e links de retorno.

## UX-002 — AGUARDANDO_APROVACAO — UX-MÉDIO

**Problema:** login e seleção de empresa fazem verificações antes de `window.location.assign`; o novo documento repete verificações de sessão/permissões. Além disso, o `AuthProvider` pode carregar contexto na rota de login após a sessão ser instalada, embora essa rota esteja prestes a sair. Há leituras adicionais de `access_session` com `p_activity`, que pertencem ao controle de inatividade e não são duplicatas equivalentes.

**Impacto:** latência na entrada e chamadas repetidas em documentos distintos. Na entrada empresarial medida após as correções, `permissions_context` ainda ocorre uma vez no cálculo do destino e uma vez no novo ambiente; as consultas de autorização não foram suprimidas.

**Evidência:** `src/access/EnterpriseAccess.tsx` (`companyEntryPath` e login), `src/FoundationApp.tsx` (`AuthProvider` e `Home.openCompany`); medições `login-*` e `open-company-*` em `reports/ux-performance/after/measurements.json`. O problema do shell desaparecendo durante o carregamento do módulo foi corrigido independentemente deste item.

**Proposta:** aprovar uma revisão delimitada do ciclo de entrada: uma fonte de resolução de contexto por sessão/empresa, revalidação explícita e transição sem recarga completa quando compatível com Auth, inatividade, termos e verificação cadastral. Não reutilizar permissões de outra empresa nem guardar decisões de autorização em cache persistente.

**Risco:** envolve arquitetura de sessão, destino de entrada e fronteiras de autorização. Reduzir essas chamadas sem essa revisão pode impedir detecção de revogação, primeira entrada ou contexto alterado. Precisa de aprovação separada, não de simples remoção de um fetch.

**Telas:** Login, Minhas empresas, Trocar contexto, primeiro acesso, termos e verificação.

## Decisão após a entrega

Não iniciar automaticamente nenhum destes itens. O proprietário decide se mantém o comportamento atual durante o feature freeze ou autoriza uma intervenção específica. Nenhuma dessas propostas constitui autorização de deploy ou de homologação externa.
