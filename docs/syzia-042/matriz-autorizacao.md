# SYZIA 042 — matriz de autorização

Escopo: identidade global versus operação na empresa. Toda autorização continua sujeita a sessão válida, perfil ativo, capacidade, grants, atribuição, escopo e estado aplicáveis. A interface reflete essas regras; a decisão final permanece no servidor.

| Operação / objeto | Super Admin autorizado | ADM empresarial sobre Equipe SYZIA | ADM sobre funcionário próprio | Equipe SYZIA |
|---|---|---|---|---|
| Identidade, username, e-mail e papel global | Fluxo global existente | Negado; dados e controles globais ausentes | Fluxo próprio empresarial existente, sem poder global | Sem autoelevação |
| Primeiro acesso, reemissão e reset global | Permitido pelo fluxo global | Negado em comando direto e gateway | Fluxo empresarial próprio preservado | Sem poder administrativo global |
| Suspender/desativar/reativar globalmente | Fluxo global existente | Negado | Somente conta própria empresarial no escopo permitido | Não altera conta global de terceiros |
| Revogar sessões globais | Autoridade global existente | Negado | Regras do fluxo próprio preservadas | Não recebe esse poder por atribuição |
| Atribuir compartilhado a empresas | Administração global existente | Sem poder sobre outras empresas | Não transforma próprio em global | Atribuição não é membership empresarial |
| Ver situação local do compartilhado | Permitido | Situação e atuação nesta empresa | Não se aplica | Somente escopo autorizado |
| Revisar grants locais | Fluxo autorizado | Permitido na própria empresa e dentro dos tetos | Permitido no escopo próprio | Não concede grants a si mesmo |
| Configurar autonomia da empresa | Fluxo autorizado | Permitido no escopo empresarial | Usa o mesmo teto operacional | Não substitui grant individual |
| Operar Agenda/Central | Autoridade e fluxos existentes | Fluxos empresariais existentes | Depende de função e grants | Depende de capacidade, vínculo ativo, grants e autonomia efetiva |
| Definir preço variável / avaliação técnica | Fluxo empresarial autorizado | Permitido conforme regras empresariais | Só autorizado com grants | Negado, inclusive em endpoints legados |
| Acessar dados da empresa B a partir de A | Somente autoridade global válida | Negado sem vínculo próprio com B | Negado sem autorização própria em B | Somente atribuição e permissões próprias de B |

## Identidade duplicada em legado

`private.syzia_identity` reconhece a origem global pela conta global ou papel de plataforma, inclusive quando desativado. `permission_role` avalia essa identidade antes de consultar memberships antigos. Se capacidade ou atribuição deixam de valer, não há retorno automático ao papel empresarial legado. `is_org_admin` também exclui essa interpretação indevida.

A lista empresarial retira essa pessoa de contas/legado próprios, acrescentando a apresentação `Equipe SYZIA · Atendimento compartilhado`. Os detalhes compartilhados incluem nome, situação local, capacidade de atender/responder e escopo; não expõem username/e-mail/credencial global nem os controles correspondentes.

## Bloqueios efetivos

- `access_manage` e `access_resume`: alvo global exige autoridade global.
- `access_reset`, `access_finish_provision` e `access_delivery_prepare`: validação do ator no caminho privilegiado do gateway; service role não transforma o ADM informado em Super Admin.
- `foundation_set_member` e `operations_set_attendant`: não permitem contornar a proteção do alvo global por edição empresarial legada.
- `access_reserve`: identidade global existente deve seguir atribuição, não novo membership próprio artificial.
- `permissions_team`: remove duplicação de identidade e mantém edição de grants locais.
- Revogação de vínculo, capability e grant é reavaliada na próxima operação, sem depender de recarregar a interface.

## Evidências e limites

SQL 042 02–17, 21 e 43, navegador 03, regressões 040 de identidade/credencial, sessões e A/B, regressões 041 de preço variável e grants. Os testes usam PGlite, claims e fixtures locais. Homologação com Auth/gateway/PostgREST reais e sessões reais permanece pendente. Nenhuma policy/FORCE RLS foi desabilitada para os testes.
