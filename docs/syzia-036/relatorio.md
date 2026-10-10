# SYZIA 036 — primeiro acesso e login

Base exclusiva: consolidado 035, SHA-256 `28f9968dac06cf80ce4dda66f168ca356b67356cd6cbd80ec1a01ef4610f54ff`. Desenvolvimento local concluído; aguardar homologação do proprietário. Nenhum reset, deploy ou serviço real foi executado.

## Diagnóstico e limite da conclusão

Os request_ids `7d1af94c-639e-40a5-9591-0693e3a4c6d9` e `29e82904-c6b9-4c6e-ac0a-9eaa0cbf755f` foram preservados. Ambos registram somente `activation_invalid`/400. **A causa exata dessas duas tentativas não pode ser determinada pelos registros fornecidos.** Não houve acesso aos eventos Auth nem ao estado do banco daquele momento.

A inspeção e reprodução da 035 identificaram uma fragilidade concreta: o verificador precisava encontrar simultaneamente código empresarial/contexto e username, antes de conferir o hash temporário. O link preenchia esses campos, mas a tela removia o fragmento ao montar; recarregar perdia o preenchimento. Com o mesmo código válido, contexto correto funciona; contexto errado, username errado ou campos vazios falham. Isso reproduz caminhos para `activation_invalid`, sem provar qual ocorreu nos dois eventos históricos. Evidência: `reports/syzia-036/diagnostico-035.json`; reprodução descartável: `npm run diagnose:036`.

| Condição analisada | Resultado da análise/correção |
|---|---|
| Código/hash | Emissão mantém 128 bits aleatórios; verificação normaliza hífens/caixa, calcula SHA-256 e compara no ciclo existente. Código recém-emitido validado e ativado nos testes. |
| Expiração, tentativas, uso anterior | Política existente preservada; recusa testada para expirado, usado e limite de tentativas. |
| Reemissão/revisão | Link e código novos vinculados atomicamente à geração; anteriores recusados. Reset pelo protocolo legado também invalida o link pela geração. |
| Preparação e identidade Auth | Reserva, retomada e identidade preservadas; estados incompatíveis, perfil/identidade ou vínculo bloqueados são recusados. |
| Username, organização e link | Links novos identificam a preparação internamente. O titular não digita empresa nem username. Links 034/035 ainda resolvem o contexto ocultamente. |
| Prova/RPC/concorrência | Mesmas RPCs de início/fim da ativação, lock transacional e prova de cinco minutos. Prova substituída, vencida e reutilizada recusadas. Concorrência PostgreSQL nativa permanece pendente. |

## Primeiro acesso e instruções

O administrador conclui o provisionamento ou retoma a mesma reserva e recebe **código temporário + link**. A tela solicita apenas o código; após validá-lo, solicita nova senha e confirmação. Ao concluir, orienta entrar pelo login normal. Copiar instruções, Copiar código e Copiar link continuam disponíveis. Entrega manual é padrão; SMTP é opcional e usa o mesmo link.

O seletor do link tem 256 bits aleatórios, em base64url, no fragmento `/ativar-acesso#access=…`. Não contém UUID, organização, username, hash, código temporário ou chave do servidor. O banco armazena somente SHA-256 do seletor e a geração associada. **O link identifica; o código comprova.** Nenhum dos dois, isoladamente, ativa a conta. Código e seletor em texto puro são retornados apenas na emissão autorizada, sem persistência no banco ou logs.

O fragmento permanece enquanto necessário para recarregar a tela. A troca de link na mesma aba monta um novo contexto e descarta a prova anterior; esse caso foi encontrado e corrigido durante o teste de celular. Após sucesso, o fragmento é removido. A prova fica somente na memória da tela.

As causas conhecidas passam a ser classificadas no log sanitizado: código inválido/expirado/usado, limite de tentativas, preparação incompatível, link inválido/substituído/obrigatório e prova inválida. A resposta pública permanece genérica, com orientação para usar link e código da mesma emissão. Não revela existência de pessoas ou empresas. Falhas do provider ao definir senha preservam `activation_uncertain`, agora com diagnóstico Auth sanitizado.

## Login e usernames repetidos

O login mostra somente **E-mail ou usuário** e **Senha**, preservando CAPTCHA quando configurado. Usa o resolvedor de identidade e o Supabase Auth existentes; não cria autenticação paralela.

- Uma empresa permitida: ambiente empresarial, respeitando suas permissões.
- Mais de uma: seleção de contexto depois da autenticação.
- Equipe SYZIA: ambiente global permitido; Super Admin: Administração SYZIA.
- Mesmo username em A/B para a mesma identidade: resolve uma pessoa; seleção posterior permite somente seus vínculos.
- Mesmo username em A/B para pessoas distintas: falha genérica e orientação para usar e-mail de contato. Não testa a senha contra múltiplas pessoas e não lista empresas antes da autenticação. O administrador pode conferir o contato pelos controles existentes; não se impõe unicidade global aos usernames.

RPCs/RLS, permissões, auditoria e regras de suporte às empresas permanecem existentes. Nenhum membership artificial foi criado. O teste autenticado de A recusou seleção da conta B, gestão de B e leitura da organização B.

## Migration e compatibilidade

Foi indispensável adicionar `202609250036_activation_links.sql`: os hashes atuais do código e da prova têm ciclos diferentes; reutilizá-los como identificador estável do link conflitaria com validação, uso único e reemissão. A migration adiciona dois campos opcionais e um índice, além de funções pequenas que envolvem as operações existentes. Os novos pontos públicos de RPC têm EXECUTE somente para `service_role`; helpers privados não ficam acessíveis a clientes.

As 33 migrations anteriores permanecem byte a byte intactas. Não existem migrations 034/035; os números dessas rodadas eram de entrega. A 036 não faz backfill, não recria pessoas, não altera memberships e não muda dados operacionais.

| Situação anterior | Comportamento na 036 |
|---|---|
| Usuário ativo | Continua com a senha e identidade existentes. Login por e-mail/username. |
| Preparação reservada | Retomar conclui a mesma identidade e emite link/código novos. |
| Preparação pendente com link 034/035 completo | Funciona sem digitar os campos de contexto; mantém expiração e tentativas originais. |
| Código sem link ou link perdido | Gerar novas instruções pela ação existente, preservando a pessoa. |
| Reemissão | Usar sempre o par mais recente; link antigo não se combina com código novo. |
| Múltiplos vínculos | Mantida identidade Auth única e sincronização existente após ativação. |

## Validação executada

| Suíte | Aprovados |
|---|---:|
| SQL 036 — upgrade, ciclo, identidade, contexto, isolamento, grants e rollback | 27 |
| Regressão SQL 034 — provisionamento, retomada e recuperação | 8 |
| Regressão SQL 035 — sessão, reserva e retomada | 4 |
| HTTP/servidor/utilitários — diagnósticos, Auth, cópias e SMTP local | 60 |
| Navegador Chromium — pessoa/empresa, login/contextos e celular | 4 |
| **Total de casos executados** | **103** |

Zero falhas finais, casos ignorados ou flaky. Typecheck, build e inspeção do bundle com marcador server-only aprovados. Capturas de login/ativação desktop e celular foram inspecionadas. Evidências em `reports/syzia-036/`; `validation-summary.json` aponta os resultados. A auditoria mestre não foi repetida.

Ambiente: PGlite com SQL/RPCs reais; adaptador Auth fictício; Supabase JS SDK sobre HTTP local nos testes de provider; Playwright/Chromium com interface atual e fixture descartável. SMTP foi serializado/testado localmente, sem envio externo. Isso não equivale a Supabase/Auth/PostgREST ou SMTP reais.

## Arquivos e preservação

Código funcional alterado: `server/enterprise-access.mjs`, `server/access-mail.mjs`, `src/access/EnterpriseAccess.tsx` e `src/access/access-instructions.ts`. Migration nova, testes/fixtures de acesso, comandos de execução/empacotamento, README/AGENTS e documentação acompanham a entrega. `scripts/dev-consumer-demo.mjs` apenas passa a carregar a migration para os testes locais; não altera apresentação ou dados da demo.

Inventário completo de arquivos novos/alterados: `reports/syzia-036/release-inventory.json`. Todos os arquivos da base estão presentes. Marca, landing, capa, mídia, módulos financeiros, billing, planos, aquisição e onboarding empresarial foram preservados. Nenhuma dependência foi adicionada; lockfile preservado.

## Pendências para o proprietário

Aplicar o upgrade coordenado conforme o guia e homologar o par link/código no ambiente de teste do proprietário. A atribuição histórica exata dos dois request_ids continua pendente dos registros correspondentes, assim como Auth/PostgREST reais, política de senha do provider, SMTP real opcional e concorrência PostgreSQL nativa. Não declarar esses itens homologados com base nesta execução local.

O critério de código válido e os fluxos solicitados passaram localmente. O critério de **causa exata dos dois eventos históricos** permanece sem comprovação. Entregar e parar para homologação do proprietário.
