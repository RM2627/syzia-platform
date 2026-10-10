# Relatório — correção incremental de ativação e gestão empresarial

Entrega cumulativa VIRELOQ, 20/09/2026. Base: última versão completa com a migration 026. Escopo autorizado: `request.txt`. **Desenvolvimento local concluído; nova homologação externa pendente.** Não é nova fase. Vídeo permanece suspenso.

## Resultado e causa-raiz

A empresa agora pode ser criada com ou sem administrador. A criação com administrador continua utilizando a reserva idempotente e o provisionamento seguro da 026; primeiro acesso ativa a identidade existente. A listagem distingue operação habilitada de preparação/ativação do administrador.

A falha de experiência foi confirmada: organização/reserva, criação Auth e finalização são etapas distintas; a interface recebia erro genérico e não atualizava a lista quando uma etapa posterior falhava. Além disso, qualquer ausência de usuário na resposta de consulta Auth era tratada como inexistência, inclusive falha do provedor. Agora a consulta falha de maneira segura, a etapa é identificada e o fluxo pode ser retomado.

**Não foi possível determinar qual chamada externa causou a tentativa real relatada pelo proprietário**, pois sua resposta/logs não foram fornecidos. Foram reproduzidas localmente falhas de consulta Auth, criação Auth e finalização. Não atribuímos a falha real a SMTP ou a uma configuração específica sem evidência. A auditoria prévia está em `audit.md`.

## Os 23 pontos solicitados

| # | Item | Resultado |
|---|---|---|
| 1 | Causa da falha parcial | Separação entre transações/serviços sem feedback adequado, classificação insuficiente de consulta Auth e atualização de lista apenas no sucesso. Causa externa pontual ainda não comprovada. |
| 2 | Correção | Erros seguros com etapa/organização autorizada, estado persistido consultável, retomada da reserva e verificação de identidade existente. |
| 3 | Criação sem ADM | Novo comando global idempotente cria somente organização/código; nenhum Auth/profile/membership artificial. |
| 4 | Estado | Aguardando administrador / Sob gestão da VIRELOQ. Reservas não concluídas aparecem como Configuração incompleta. |
| 5 | Acesso global | Super Admin abre a gestão existente da empresa, inclusive sem administrador e após suspensão. Nenhum membership artificial e nenhuma ampliação indiscriminada dos módulos empresariais. |
| 6 | Slug | Sugestão normalizada a partir do nome, atualização automática enquanto não editado, edição manual preservada, prévia `/empresa/slug`, validação e unicidade no banco. |
| 7 | Código empresarial | Reutiliza geração única da 026; exibido na confirmação, listagem e acessos. É distinto do slug e não é senha. |
| 8 | Primeiro ADM | Nome, sobrenome, username sugerido/editável, e-mail obrigatório e telefone opcional; pode ser definido na criação ou posteriormente. |
| 9 | Identidade prévia | Auth user, profile e membership existem antes do primeiro acesso; testes verificam os mesmos IDs após ativação e ausência de segundo vínculo/papel global. |
| 10 | Código temporário | Geração forte, hash persistido, 48 horas/cinco tentativas por padrão conforme política 026; emissão mostrada uma vez ao operador autorizado. |
| 11 | Senha pessoal | `/entrar` aceita senha ou código de primeiro acesso; somente código válido abre criação/confirmação da senha. Legal/onboarding existentes preservados. |
| 12 | E-mail | Tentativa automática para administradores após provisionamento. Adapter SMTP independente do Auth, com TLS obrigatório e segredos só no servidor. |
| 13 | Falha SMTP | Não desfaz organização, Auth, profile, membership nem código. Aviso explícito e Copiar instruções continuam disponíveis. |
| 14 | Reenvio | Para administrador pendente, autorizado e elegível; gera novo código, invalida anterior, preserva identidade. Intervalo 60 s e cinco tentativas/hora por acesso. |
| 15 | Retomada | Continuar configuração usa a reserva existente. Se já concluído, não cria outra identidade; novas instruções seguem recuperação/reenvio autorizado. |
| 16 | Auditoria | Menu/rota globais permanecem exclusivos; nova RPC global exige Super Admin ativo. Histórico próprio fica separado, sujeito à RLS existente. |
| 17 | Desativar/Reativar | Reutiliza comando da Fundação. Suspensão revoga sessões empresariais existentes; reativação exige login novo, preservando IDs/trial/histórico. |
| 18 | Exclusão | Super Admin, nome exato digitado em diálogo e validação transacional. Apenas organização vazia elegível; acessos reservados/provisionados e histórico relevante impedem exclusão. Auditoria permanece imutável. |
| 19 | Trial | Nenhuma concessão/reset neste fluxo. Exclusão recusada se houver dados de elegibilidade, trial ou billing. Nenhuma chave consumida/fingerprint é apagada. |
| 20 | Migrations | 001–026 preservadas byte-identical. Adicionada somente `202609200027_organization_activation.sql`. Não requer reset nem reaplicação histórica. |
| 21 | Testes | SQL real em PGlite, upgrade 026→027, adapters Auth/SMTP, serialização de e-mail, interface, demo HTTP, regressões e bundle. Detalhes abaixo. |
| 22 | Resultados | Validações locais finais aprovadas. Uma falha de teste de inventário foi corrigida; uma falha transitória de interface foi repetida isoladamente com sucesso. Evidências completas incluídas. |
| 23 | Pendências reais | Aplicação da 027, Auth/PostgREST, SMTP/recebimento, RLS/JWT reais e concorrência com conexões independentes a validar pelo proprietário. |

## Banco, autorização e integridade

A 027 acrescenta três tabelas privadas, todas com **RLS e FORCE RLS**, sem grants de leitura/escrita para navegador:

- `private.organization_retention`: mantém identificadores de organizações e registro de exclusão; permite auditoria histórica sem apagar eventos.
- `private.organization_creation_requests`: idempotência da criação sem administrador. Após exclusão, a chave anterior não pode recriar silenciosamente uma organização.
- `private.access_deliveries`: tentativa atual, último aceite SMTP, resultado seguro, intervalo e limite de envio. Não contém código temporário em claro.

RPCs autenticadas novas: `access_create_organization`, `access_organizations`, `access_delete_organization`, `foundation_global_audit`. Todas exigem Super Admin ativo no banco. `access_reserve` mantém a implementação 026 por wrapper e impede reserva em empresa suspensa. `access_team` mantém sua autorização e acrescenta apenas metadados de entrega. As versões internas `access_reserve_026` e `access_team_026` não podem ser chamadas pelo navegador.

RPCs novas exclusivas de servidor: `access_delivery_prepare` e `access_delivery_finish`. A preparação revalida operador/estado, serializa a emissão e utiliza a recuperação 026. Confirmações atrasadas de tentativa anterior não sobrescrevem a tentativa atual. Eventos de tentativa/resultado são auditados sem conteúdo de mensagem ou segredo.

Novos helpers privados: `organization_retain`, `organization_delete_blocked`, `organization_revoke_sessions`. Novos triggers nas organizações registram identificador permanente e revogam sessões na suspensão. **Nenhuma policy de leitura pública ou isolamento empresarial foi relaxada.** A RLS de auditoria da própria empresa foi preservada; a RPC global acrescenta autorização explícita.

A FK de auditoria passa da organização viva para o registro privado permanente de identificadores, com `ON DELETE RESTRICT`. Isso preserva integridade e histórico append-only quando uma organização vazia é excluída. Não há cascade de clientes, acessos, trial, financeiro ou auditoria. Dados em tabelas empresariais atuais ou futuras tornam a exclusão inelegível; a verificação ocorre novamente dentro da transação protegida pelo lock da Fundação.

Por segurança, **uma reserva de acesso já impede exclusão**, mesmo antes de o Auth concluir. Isso evita que uma criação Auth concorrente deixe identidade órfã. Nesse caso, desative a empresa; não há limpeza automática de Auth ou remoção de histórico para forçar elegibilidade.

## API e interface

A Platform API acrescenta `/access/create-organization` e `/access/resend`, mantendo os endpoints anteriores. A resposta de erro pode conter somente etapa permitida e IDs da reserva autorizada; logs não recebem senha, código, destinatário, payload bruto de Auth/SMTP ou chave de serviço.

Códigos relevantes: `slug_conflict`, `slug_invalid`, `company_code_unavailable`, `administrator_email_required`, `provisioning_incomplete`, `temporary_code_unavailable`, `access_already_provisioned`, `delivery_cooldown`, `delivery_rate_limited`, `organization_deleted`, `organization_confirmation_required`, `organization_history_requires_preservation`. Entrega usa `accepted`, `email_not_configured`, `email_delivery_failed`, `email_rate_limited`, `email_temporary_failure` ou `delivery_status_unknown`.

O componente `OrganizationAdmin` concentra listagem, criação, estados e ações de ciclo de vida. `EnterpriseAccess` incorpora primeiro login unificado, instruções, reenvio e definição posterior do administrador. `FoundationApp` reutiliza a gestão global e consulta a RPC específica de auditoria. O branding VIRELOQ permanece inalterado; CSS adicional limita-se à disposição dos elementos afetados.

Foi corrigida a reutilização de um input de senha ao trocar de etapa no React: o formulário de criação de senha recebe uma nova identidade e inicia com ambos os campos vazios. Uma falha de login posterior à definição de senha orienta entrar com a senha já criada, sem tentar consumir a mesma prova novamente. O CAPTCHA configurado pode ser apresentado novamente na etapa de senha; não foi removido.

A cópia de instruções usa a origem atual da aplicação. O e-mail usa a origem configurada no servidor. Não há domínio fixo, token em URL ou reintrodução de convite por e-mail. Nenhuma senha, código temporário ou prova de ativação é persistida pela aplicação no frontend. A sessão Auth técnica e a opção não secreta Lembrar empresa seguem a arquitetura existente.

## Testes efetivamente executados — TESTADO LOCALMENTE

Ambiente: Node 24.19.0, npm 11.9.0, PostgreSQL via PGlite, Chromium/Playwright e demo HTTP em loopback. Auth/SMTP/Storage externos substituídos pelos adapters/fixtures locais já documentados. Somente dados fictícios.

| Validação | Resultado final |
|---|---|
| Nova suíte SQL/upgrade 026→027 | **27/27 aprovados**. |
| Nova suíte de servidor/SMTP controlado | **18/18 aprovados**. |
| Regressão enterprise access 026 | **42 SQL + 5 upgrade + 18 servidor aprovados**. |
| Comandos de regressão cumulativa | **31 comandos com resultados finais aprovados**, listados em `reports/organization-activation/validation-summary.json`. |
| Demo completa no navegador | **52/52 aprovados**. |
| Suíte de interface dos módulos | **43 casos aprovados ao final**: 42 na execução completa e 1 na repetição isolada. |
| Revalidação final dos acessos/interfaces alterados | **12/12 aprovados**; não somados como casos novos. |
| Build/typecheck e inspeção do bundle | Aprovados; marcador de segredo server-side ausente no frontend. |
| Integridade histórica | 26 hashes SHA-256 comparados com a entrega completa anterior; todos iguais. |
| Dependências | Adicionado somente Nodemailer 10.0.10; nenhuma versão anterior do lockfile alterada/removida. |

As regressões cobrem Fundação/isolamento, empresa, onboarding, operação, página pública, portfólio, multissegmento, consumidor, serviços, solicitações, orçamentos, agenda, Central, Comercial, métricas, trial, billing, ferramentas, mídia/imagens, configurações e scripts de homologação. Testar as ferramentas localmente não significa ter executado seus comandos remotos.

Evidências: `reports/activation-regression/`, `reports/organization-activation/`, `reports/organization-activation-sql.json` e relatórios preservados das fases anteriores. Capturas desktop/mobile estão na pasta de evidências desta correção.

### Falhas encontradas durante a validação

- O teste de inventário da Fundação esperava 14 RPCs; a nova RPC global elevou para 15. A contagem foi atualizada mantendo a verificação de que **nenhuma** permite execução anônima. Reexecução aprovada.
- Seletores dos novos testes inicialmente encontravam campos/títulos homônimos; foram restringidos ao formulário/título correto. Não foi removida nenhuma asserção de segurança.
- A troca entre login e ativação reutilizava input preenchido; corrigida com formulário separado por etapa e regressão exigindo ambos os campos vazios.
- Os cartões de acesso ficaram estreitos para os novos botões; layout ajustado e inspecionado em desktop/mobile. As instruções emitidas passam a ocupar o lugar do próximo formulário, para não ficarem escondidas abaixo dele.
- Na primeira rodada de interface, o teste de rascunho da Central falhou durante uma execução concomitante com atualizações locais do frontend. Repetido isoladamente, passou. O teste completo de rascunhos da demo também passou. Não foi alterado código da Central para contornar a ocorrência. Os logs de ambas as execuções foram mantidos; não se declara que a primeira rodada foi integralmente verde.

## Limitações e PENDENTE DE HOMOLOGAÇÃO EXTERNA

- Nenhuma conexão com Supabase real, Auth real, SMTP real ou serviços pagos foi feita nesta tarefa. O sucesso do Super Admin na 026 é informação fornecida pelo proprietário.
- O SMTP está desabilitado por padrão. Sem configuração, a aplicação cria o acesso e informa que não enviou o e-mail. Aceite SMTP, quando configurado, não comprova recebimento/leitura.
- `test:access:native` e `test:activation:native` não puderam iniciar PostgreSQL nativo: o ambiente não permite mapear usuário não root. O runner encerrou com código 2, antes da execução. Scripts com conexões independentes foram preservados/preparados; **não declarar concorrência nativa homologada**.
- A exclusão é deliberadamente limitada à empresa vazia sem acessos/histórico. Empresas com reserva ou dados relevantes são desativadas. Não há remoção em cascata nem limpeza de identidades.
- Este trabalho não aprova juridicamente os documentos existentes nem altera condições comerciais, gateway ou cobrança. Não redefine política de trial.

## Arquivos e atualização

Principais arquivos novos: migration 027; `server/access-mail.mjs`; `src/access/OrganizationAdmin.tsx`; três suítes `tests/organization-activation*.mjs`; `tests/demo-browser/organization-activation.spec.ts`; `scripts/verify-activation-migrations.mjs`; inspeção SQL de homologação; documentação desta pasta.

Arquivos existentes alterados: `server/enterprise-access.mjs`, `server/platform.mjs`, `src/access/EnterpriseAccess.tsx`, `src/FoundationApp.tsx`, `src/brand/vireloq.css`, `scripts/dev-consumer-demo.mjs`, `scripts/test-native.mjs`, testes/auxiliares diretamente afetados, `.env.server.example`, `package.json`, lockfile, README e AGENTS. O inventário de comparação registra todos os caminhos alterados; o MANIFEST registra hashes do pacote completo.

O ZIP é **completo e cumulativo**, com código/assets/migrations desde 001/scripts/tests/fixtures/guias/relatórios e exemplos de configuração. Não inclui dependências instaladas, build regenerável nem `.env`/`.env.server` preenchidos. Nenhum arquivo da versão-base foi omitido. Use `upgrade.md`: preserve suas configurações e aplique **somente 027**, sem reset.

**Conclusão:** correção disponível para a próxima homologação do proprietário. Não houve publicação, deploy, cobrança, envio real de e-mail nem produção de vídeo. Parar após esta entrega e aguardar autorização.
