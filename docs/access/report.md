# Relatório técnico — revisão de acesso empresarial VIRELOQ

Data: 19/09/2026. Base: última entrega completa consolidada com correção de convites, SHA-256 `fc3c6c231b9aede395fda75ba6a5c1707a256b0e5fc1cbe8499353dd66cdfe41` (ver valor canônico em `reports/access-consolidation.json`). Esta é revisão autorizada do produto existente, não nova fase.

**DESENVOLVIMENTO LOCAL concluído para entrega; HOMOLOGAÇÃO EXTERNA PENDENTE.** Sem Supabase real, deploy, dados reais, provedor contratado ou vídeo. O ZIP é cumulativo; configurações preenchidas do proprietário não foram fornecidas nem recriadas.

## 1. Arquitetura e Auth (itens 1–3)

Código empresarial + username é resolvido somente na Platform API, que usa Supabase Auth para verificar a senha e emitir sessão normal. Identificador interno aleatório no formato de e-mail `.invalid` não precisa de caixa postal/SMTP. É técnico, não aparece como identidade operacional e não prova posse do e-mail de contato. Senhas nunca são armazenadas pela aplicação. Token é validado antes de registrar sessão empresarial no banco. Uma sessão Auth emitida diretamente não contorna escopo, geração, estado ou inatividade.

Auth e SQL não compartilham transação: prova de ativação é consumida transacionalmente, a conta fica bloqueada durante a alteração e um marcador de operação aprovado protege contra gravação tardia/fora de ordem do provedor. Falhas incertas exigem recuperação administrativa; não se presume sucesso.

Limitação real: um Auth ID legado tem uma senha única, mesmo com vários memberships. Não criar senhas paralelas nem reatribuir históricos. Alternativa escolhida: usernames/escopo por empresa, recuperação dessas identidades compartilhadas somente pelo Super Admin. Contas novas entre empresas recebem IDs independentes. Decisão e alternativas em `architecture.md`.

## 2. Schema e migration (itens 4–5)

Única migration nova: **`202609190026_enterprise_access.sql`**, incremental e transacional. **001–025 byte-identical** à base completa, verificação SHA-256 entregue. Não apagar/recriar organizations, profiles, memberships, Auth, trial ou billing. Nenhuma migration 027.

| Objeto novo | Finalidade |
|---|---|
| private.access_policy | Padrões/limites de inatividade, aviso e código |
| private.enterprise_codes | Código empresarial único/estável e regra legal de transição |
| private.enterprise_accounts | Username por empresa, contato, papel, estado, geração, hashes efêmeros e idempotência |
| private.access_enforced_users | Identidades que exigem gateway/sessão registrada |
| private.enterprise_sessions | Escopo e geração atuais, última atividade e revogação |
| private.access_limits | Contadores temporários persistentes para abuso |
| private.legal_acceptances | Aceite institucional por versão/grupo, organização, usuário e data |
| public.legal_documents | Termos/Privacidade versionados e minutas públicas |

As oito tabelas novas têm RLS e FORCE RLS. Tabelas privadas sem acesso direto de clientes/service_role; operações por funções allowlisted. `legal_read`: somente SELECT anon/authenticated de documentos. Unicidade de código, organização+username, organização+user, ator+request_key; papel restrito; admin exige e-mail; username ASCII minúsculo validado; limites configuráveis com bounds; documento atual único por tipo; versões imutáveis. Triggers: código da organização, invalidação por alteração de membership e imutabilidade legal. Inventário efetivo de funções/grants: `reports/access-sql-inventory.json`.

RPCs autenticados: `access_reserve`, `access_resume`, `access_team`, `access_manage`, `access_session`, `access_legal_accept`, `access_policy_set`. Internos service-only: `access_rate`, `access_finish_provision`, `access_lookup`, `access_verify_code`, `access_begin_activation`, `access_finish_activation`, `access_register_session`, `access_reset`, `access_media`. Hook Auth: `access_before_user_created`, reservado a `supabase_auth_admin` quando o papel existir. Helpers privados de sessão/escopo envolvem a autorização anterior sem abrir dados.

## 3. Identidade e transição (itens 6–8)

Super Admin existente conserva conta e senha: mesma `/entrar`, opção da operação VIRELOQ, sem empresa fictícia. Tokens anteriores devem reautenticar após upgrade. Organizações ganham código aleatório de 12 caracteres hexadecimais (48bits), diferente de ID/slug, garantido único no banco; não é segredo. Username sugerido nome.sobrenome, normalizado/validado no servidor e banco, editável antes de criar, único por organização e sem fusão por telefone/e-mail. Colisões exigem correção explícita.

Usuários existentes são adotados por ação autorizada, preservando Auth ID e membership. Nenhum username conflitante é decidido silenciosamente. Conta Auth adotada ainda não confirmada recebe identificador técnico; contato permanece separado/não verificado. Identidades globais não são convertidas automaticamente em empresariais.

## 4. Acesso e equipe (itens 9–15)

Código temporário: 128bits criptográficos, SHA-256 somente no banco, 48h configuráveis, cinco tentativas padrão, revogação e uso único. Validação gera prova de 256bits, apenas hash persistido, cinco minutos; código/prova em claro só trafegam no fluxo autorizado, nunca em logs. Código exibido uma vez para cópia ao destinatário. Root cria empresa+primeiro admin; gestor cria sua equipe. Funcionário dispensa e-mail/telefone; administrador exige e-mail de contato válido.

`/ativar-acesso`: validar código → criar/confirmar senha → autenticar → gate legal antes da operação. `/entrar`: código/username/senha com erro genérico para dados incorretos, empresa lembrada só código/nome. `Redefinir acesso` gera novo código, invalida sessões/código anterior, sem revelar senha. Primeira administração e identidade compartilhada exigem Super Admin para recuperação. Preparação interrompida pode ser retomada sem duplicar Auth/membership. Desativação bloqueia, reativação exige novo código; alteração de papel preserva Fundação/último administrador/limites e invalida sessão anterior. Administradores empresariais não concedem papéis globais.

## 5. Sessão e experiência (itens 16–17)

Inatividade padrão30min, aviso60s; política global segura e configurável. Banco rejeita JWT ainda válido após idle, revogação, suspensão ou mudança de geração. Polling/foco/refresh não renovam; clique/teclado/toque e Continuar conectado renovam. Abas da mesma sessão coordenam timestamp sem segredo; logout limpa ambas e desmonta rascunhos. Troca de identidade não herda dados de outra empresa. Sem rede, a UI não presume autorização; revogação remota imediata depende de conectividade, com limite server-side mantido.

Login/aceite revisados em desktop/mobile; checkboxes compactos, links legais com contraste em fundo noturno, identidade VIRELOQ preservada. Pessoas e acessos mantém gestão existente, histórico e instruções sem caminhos paralelos.

## 6. Termos, Privacidade e convites (itens 18–21)

Documentos públicos em `/termos` e `/privacidade`. **Minutas**, com fornecedor/contatos/retenção/condições comerciais para revisão do proprietário; nenhuma conclusão jurídica ou certificação presumida. Aceite institucional pelo admin grava versões, grupos, data e responsável; funcionários não são contratantes. Gate server-side impede contorno por URL/RPC em novas empresas. Mudança material pode exigir novo aceite; editorial conserva grupo. Legal e privacidade mostra histórico e responsável. Empresas preexistentes ficam em transição, sem aceite inventado; decisão do proprietário para exigir novo documento.

025 preservada. Convites antigos podem ser consultados/revogados em Pessoas e acessos. Criação/envio/aceite legados ficam sem grants ativos; `/aceitar-convite` e callbacks antigos mostram orientação, sem formulário de senha inútil. Endpoint de envio da API real desativado. Templates/infraestrutura/testes históricos permanecem identificados como legados. Não existem dois fluxos ativos.

## 7. Arquivos (item 22)

Implementação concentrada em `src/access/EnterpriseAccess.tsx`, `Legal.tsx`, `IdleSession.tsx`, `src/FoundationApp.tsx`, complemento de `src/brand/vireloq.css`, `server/enterprise-access.mjs`, `server/platform.mjs`, `server/attachments.mjs`, migration026 e demo. Testes novos `enterprise-access*`; fixtures/contratos de login das regressões adaptados, contagens de tabelas atualizadas para69 públicas e policy legal explicitamente verificada. Testes browser antigos exclusivos de convite/login por e-mail preservados em `tests/legacy/`.

README/AGENTS/exemplos/documentação atualizados; nenhum lockfile/dependência alterado. Inventário integral dos arquivos alterados/adicionados/preservados é gerado em `reports/access-consolidation.json`; MANIFEST cobre todo ZIP. Guias, SQL de inspeção/modelo legal, código, assets e scripts históricos necessários permanecem.

## 8. Validação executada (itens 23–24)

Resultados canônicos em `reports/access-validation-summary.json` e arquivos referenciados. Testes locais são SQL real em PostgreSQL WASM/PGlite com fixture Auth, adapters Node e Chromium sobre HTTP local, **não GoTrue/PostgREST/Storage reais**.

- **42 testes SQL novos**, **5 de upgrade025→026**, **18 Node/adapter/HTTP**: aprovados, incluindo isolamento, grants, códigos, autorização, recuperação, reserva retomável, identidade compartilhada, sessão, mídia e legal.
- **29 comandos de regressão** anteriores: todos com exit0 (`reports/access-regression/execution.json`), cobrindo Fundação, Empresa, Consumidor, Central, Comercial, Analytics, trial/billing, imagens, publicação, onboarding, operação, ferramentas e configurações.
- **43 testes de navegador de módulos** aprovados (`access-module-browser-results.json`).
- **47 testes completos da demo** aprovados (`access-demo-full-results.json`); revisão visual/sessão acrescentou caso de rascunho após logout e repetiu jornadas essenciais. O conjunto atual da demo possui **48 casos únicos**; execuções repetidas não são somadas como novos testes.
- Typecheck/build de produção, bundle com marcador fictício server-only ausente, integridade histórica: aprovados. Nenhuma credencial real usada.
- Inspeção visual: login mobile/desktop, aceite mobile/desktop, gestão mobile/desktop; imagens em `reports/access/` e `reports/vireloq/`. Portfólio/página tablet/mobile/desktop também na regressão da demo.

Falhas encontradas e corrigidas: whitelist da ponte de teste não contemplava novos RPCs; inventários esperavam68 tabelas; grant indevido de helper privado foi detectado pela regressão e removido; hard reload após login causava corrida com consulta de sessão interrompida (navegação interna corrigiu); gateway histórico de mídia descartava session_id (wrapper autorizado preserva contexto); testes repetidos atingiam rate limit (janelas isoladas somente no runner de demo, limites do produto intactos); teste trial usava formulário de convite descontinuado (adaptado à ativação); aceites mobile estavam na mesma linha e com contraste insuficiente (layout compacto); múltiplos memberships legados exigem recuperação global para não permitir tomada de identidade por outro tenant. Nenhuma correção exigiu relaxar RLS/constraints.

## 9. Limites e pendências externas (itens 25–26)

**Não executados:** Supabase Auth real, emissão/assinatura/refresh real e session_id, Before User Created hook real, PostgREST, Storage/URLs temporárias reais, CAPTCHA/proxy/limites reais, MFA se configurado, concorrência de conexões nativas e restauração real. O runner PostgreSQL nativo não iniciou por restrição de UID não-root neste executor; cinco testes independentes preparados, nenhum resultado nativo declarado. Interleaving com adapter/SQL serializado não substitui teste real de concorrência.

A operação entre Auth e SQL exige homologar falhas/respostas tardias; o protocolo falha fechado, mas é preciso validar o comportamento efetivo do provedor. Identidades legadas compartilhadas exigem suporte Super Admin; códigos perdidos não são recuperáveis, só regeneráveis. Política de aceite para empresas anteriores e textos finais exigem decisão do proprietário. A API confia somente no IP do socket; implantação futura com proxy deve revisar essa estratégia. Sem pagamento real ou SMTP homologado nesta revisão.

Atualização: `docs/access/upgrade.md` — preservar env locais, aplicar apenas026, reiniciar Vite/Platform API/gateway, validar root existente, adotar usernames, ativar e testar. Matriz completa: `external-homologation.md`. Não foi solicitado nem executado acesso externo nesta tarefa.

## 10. Preservações e parada (itens 27–30)

Trial, elegibilidade/histórico, assinatura/billing, quotas, marca VIRELOQ e marca pública das empresas preservados. Login/provisionamento/reset não concedem trial nem criam cobrança. Página pública/portfólio continuam a mesma estrutura. Não houve deploy, checkout real, provedor contratado ou dado real. **Vídeo não produzido, editado, renderizado ou retomado.** Planejamento anterior preservado.

Entrega pronta para o proprietário atualizar o ambiente dedicado e realizar homologação externa; **não é declaração de homologação real ou prontidão de produção**. Parar após entrega; nenhuma fase nova ou homologação automática.
