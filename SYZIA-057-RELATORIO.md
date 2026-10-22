# SYZIA 057 — Ativação automática por convite

Base oficial: `RM2627/syzia-platform`, `33e04ca8ba14be73e7050ae84c5299410d5c7011`. A referência de `main` foi consultada uma vez pelo GitHub conectado. Branch local: `syzia-057-ativacao-automatica`. Não houve commit, push, merge, deploy, serviços externos, e-mail ou pagamento real.

## Resultado

Implementado e testado localmente: o destinatário de um convite válido autentica sua identidade, confere a configuração, escolhe o plano, aceita as condições e prepara a organização para o checkout existente. O fluxo normal não pede justificativa nem aprovação do Super Admin. A materialização continua condicionada à confirmação financeira confiável do mecanismo existente.

**Não é homologação de produção.** Auth, confirmação por e-mail e Mercado Pago foram simulados; a integração externa precisa ser verificada pelo proprietário depois da revisão/aplicação autorizada. O erro histórico `42501` de produção não teve sua causa retrospectiva comprovada. Não foi atribuído automaticamente à ausência de JWT e nenhuma proteção global foi removida.

## Mudanças e fundamento

1. `commercial_claim_request` conserva sua assinatura RPC, mas valida o destinatário pela correspondência entre o hash do e-mail do convite, o e-mail atual do interessado e `auth.users.email` confirmado. Não utiliza e-mail fornecido no body nem metadados editáveis como prova. A sessão e o perfil continuam sujeitos a `private.is_active_user()`.
2. Convite ativo, finalidade, prazo, geração, revogação, versão imutável, identidade já vinculada e organização já criada continuam verificados. A conta não recebe poder sobre outras empresas. A decisão do proprietário autoriza preparar uma **nova** organização a partir daquela versão.
3. Novas ativações recebem `authorization_method=verified_invitation` e data de verificação; o evento `commercial_invitation_verified` usa a auditoria existente. Não é inventada justificativa textual nem revisão humana. Histórico anterior permanece intacto. Solicitações antigas pendentes só avançam quando a mesma identidade confirma o destinatário. Uma rejeição administrativa anterior não é silenciosamente anulada.
4. Contexto e conclusão revalidam a identidade antes de criar a organização pendente. Os contratos anteriores de conclusão e contexto são reutilizados por wrappers, com EXECUTE dos predecessores revogado para `PUBLIC`, `anon`, `authenticated` e `service_role`. Chamadas repetidas do dono de uma organização já preparada retornam a organização existente.
5. Interface remove o formulário de vínculo/análise e mantém revisão explícita da configuração, cadastro, planos, condições, documentos jurídicos e checkout. O retorno do cadastro/identidade conserva o convite na mesma sessão de navegador; ao entrar na organização preparada, esse contexto temporário é encerrado. Em outro navegador, o usuário precisa reabrir o convite original.
6. Na aba Ativações, registros automáticos são identificados e não exibem formulário de nova aprovação. A aba Convites, seu formulário compacto e regras de emissão/envio permanecem preservados.

### Correção estritamente necessária à reconciliação

Foi reproduzido localmente `42702: column reference "b.organization_id" is ambiguous` na ação `pending` de `commercial_materialization_service`. O alias SQL `b` colidia com a variável PL/pgSQL `b`. Isso impedia a enumeração de organizações prontas para materializar.

A migration redefine essa função com **somente o alias daquela consulta alterado** para `confirmed_contract`. Um teste compara o corpo anterior e o novo para garantir essa única diferença. Não altera consulta ao Mercado Pago, regras de confirmação, trial, importação, capabilities, bloqueios ou idempotência. O teste reproduz a recusa antes da atualização e confirma a reconciliação depois dela.

## Migration

`supabase/migrations/202610220058_invitation_activation.sql` é transacional e incremental, destinada somente ao banco operacional. O número 057 já é usado por `202610210057_billing_completed_change_recovery.sql`, incluída no commit oficial. Essa migration financeira permanece byte a byte intacta. Não aplicar a nova migration ao Neon demonstrativo; não há mudança do schema demonstrativo.

Acrescenta origem/data da verificação às claims; permite statement nulo somente para nova autorização verificada e datada; preserva statements, revisões, versões, aceites e organizações anteriores. Não altera RLS/FORCE RLS ou funções globais de sessão. Nenhum SQL foi executado em banco real.

## Testes executados

| Conjunto | Resultado | Alcance |
|---|---|---|
| Ativação 057 | 14/14 PASS | SQL real em PGlite descartável, controller e adaptador financeiro existentes, transporte MP simulado |
| Integridade 057 | 3/3 PASS | 1.202 arquivos da base oficial; cinco transições explícitas; migrations e HF02 preservados; mutações reais recusadas |
| Regressões selecionadas | 42/42 PASS | HF02 financeiro, pré-cadastro 056 e controle comercial anterior, nas fixtures originais |
| Navegador | 1/1 PASS | Usuário existente e novo; login/retomada; revisão; plano; condições; aceite jurídico; entrada no checkout sem liberar software |
| Build/typecheck | PASS | `npm run build` |
| Patch em checkout limpo | Ver log `pacote.log` | Preflight, aplicação, testes 057, build, reversão e restauração da base |

Matriz resumida: usuário novo/existente (01–02 + navegador); e-mail/sessão/perfil (03,12); expiração/revogação/finalidade (04); apropriação e isolamento (05,09–10,13–14); repetição/solicitações sobrepostas (06,09,14); rejeição histórica (07); snapshot e plano incompatível (08); consentimento e termos (08 + navegador); checkout abandonado/sem confirmação (09–10); confirmação financeira e reconciliação (11,14); sete dias e ausência de duplicação (14). O teste 11 confirma remapeamento dos serviços e ausência de pedidos, agenda, faturas e publicação demonstrativos na organização criada.

A migration também foi aplicada sobre uma solicitação histórica populada e submetida a falha transacional deliberada: rollback preservou o registro; aplicação normal preservou o histórico. Em desktop de 1440 px e celular de 390/360 px não houve overflow; revisão por teclado passou. As capturas foram inspecionadas localmente e não estão no pacote principal.

## Não testado e limites

- Não houve Mercado Pago real, webhook externo, SMTP, confirmação de e-mail real, Supabase/Neon/Render/Cloudflare ou alteração de credenciais. O formulário chega ao checkout existente; tokenização externa não é simulada como uma compra real.
- Solicitações sobrepostas foram executadas em `Promise.all` sobre a fila transacional da fixture. **Concorrência com conexões PostgreSQL nativas independentes não foi executada.** Os locks e o índice único existentes foram preservados.
- Linux/Node 24 foi utilizado. Windows e PowerShell estão documentados, mas não foram executados. LF/CRLF foi testado apenas para texto explicitamente autorizado; binários continuam byte a byte.
- O gate completo não foi repetido, conforme o escopo econômico. Os testes históricos não foram apagados, ignorados nem reescritos. Há asserções antigas de contagem fixa de migrations (51/52) em suites históricas, enquanto a cadeia atual passa a 54 arquivos; esta rodada não afirma PASS desse gate nem refaz sua reconciliação histórica. O teste de integridade 057 verifica a base oficial atual integralmente.
- Os 42 testes de regressão mantêm suas fixtures históricas; a regra nova e a migration 058 são exercitadas pelos 14 testes 057, não pela antiga expectativa de aprovação manual.
- Um convite antigo já apropriado por outra identidade ou explicitamente rejeitado exige tratamento excepcional/revogação e novo convite, sem sobreposição silenciosa. Configuração alterada pelo dono enquanto aguarda pagamento continua protegida pelo bloqueio original de materialização.

## Arquivos e preservação

Cinco arquivos existentes alterados: `Activation.tsx`, `api.ts` e `Management.tsx` em `src/platform-commercial/`; `src/acquisition/SelfService.tsx`; e a fixture local `scripts/commercial/browser-fixture-055.mjs` (ativação da migration apenas sob flag de teste 057).

Novos: migration 058, dois arquivos de testes 057, teste e configuração Playwright 057, dois manifests de integridade e três documentos desta entrega. Inventário exato e hashes estão no pacote. Código de `server/`, checkout financeiro, HF02, Auth global, estilos, Convites, configuração de demonstrações, dependências e migrations históricas permanecem preservados.

Situação: **pronto para revisão e homologação local do proprietário**, com pendências externas e de concorrência nativa explicitadas. Integração e publicação continuam condicionadas à autorização do proprietário.
