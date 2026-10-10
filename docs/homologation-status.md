> Registro histórico. A autorização posterior inclui a Fase 5; estado atual em `phase-5-report.md`. Homologação real continua pendente. Não interpretar limites de fase abaixo como o estado atual do desenvolvimento.

# Relatório de homologação da Fundação — situação da entrega

> Documento histórico da Fundação. A autorização posterior permite desenvolver a Fase 3 sem declarar homologação externa concluída. Estado atual em `docs/phase-3-report.md` e `docs/project-boundaries.md`; Fase 4 não autorizada.
Data: 15/09/2026. Escopo: Fase 2 — Fundação. **Homologação real ainda não concluída. Fase 3 não iniciada e não autorizada.**

## Ambiente utilizado e limites

Nesta etapa foi utilizado somente o ambiente local de desenvolvimento, com Node.js e PostgreSQL WASM/PGlite para validar as ferramentas. Não há um projeto Supabase dedicado conectado nem credenciais de teste configuradas neste ambiente. Nenhum serviço foi contratado, ativado ou publicado. Nenhum dado real de cliente foi utilizado.

## Migrations

As três migrations estão incluídas, nesta ordem:

1. `202609150001_foundation.sql`
2. `202609150002_authorization.sql`
3. `202609150003_commands.sql`

**Migrations efetivamente aplicadas em Supabase real nesta etapa: nenhuma.** As três foram aplicadas apenas na base local descartável do teste das ferramentas. Nenhuma migration, tabela, policy ou regra de autorização da aplicação foi alterada neste complemento. O inventário SQL preparado permitirá conferir tabelas, RLS, policies, grants, funções e constraints no ambiente real.

## Configurações e ferramentas entregues

Guia de Supabase Auth com aplicação local, Site URL, redirects, confirmação de e-mail, recuperação de senha e proteção de abuso; modelo de configuração sem segredos; preparação restrita de duas empresas fictícias e seis contas de teste; testes HTTP/PostgREST; roteiros de concorrência com conexões independentes; estratégia de backup/restauração; modelo para registrar as evidências externas. As configurações externas estão documentadas, mas não foram aplicadas.

A regra permanente de desenvolver e entregar arquivos, com publicação sob responsabilidade exclusiva de Marcelo, está em `AGENTS.md`, README e documentação do projeto.

## Testes executados nesta etapa

Comando: `npm run test:homologation-tools` (executor equivalente: `node --test tests/homologation/tooling.test.mjs`). Resultado: **10 passaram; 0 falharam; 0 ignorados**. Evidência: `reports/homologation-tooling.tap`.

| Teste local | Resultado |
|---|---|
| Configuração explícita válida de homologação | PASS |
| Recusa de ambiente sem confirmação de dados fictícios | PASS |
| Recusa de referência e URL de projetos diferentes | PASS |
| Recusa de HTTP, caminho extra ou domínio externo | PASS |
| Recusa de service role e secret key na configuração do runner | PASS |
| Recusa de contas repetidas e placeholders | PASS |
| Recusa de IDs de empresas iguais | PASS |
| Relatório não copia mensagens sensíveis do provedor | PASS |
| Ausência de configuração encerra o runner antes de autenticar | PASS |
| Fixture, inspeção e bloqueio de base fora do recorte funcionam em PostgreSQL WASM, preservando RLS | PASS |

Os relatórios anteriores de 68 testes de segurança, 12 testes de interface com respostas simuladas e 3 verificações de configuração continuam no pacote. Não foram executados novamente neste complemento, pois o código-fonte da aplicação e suas migrations permaneceram iguais. Esses resultados não substituem testes com Auth real.

## Itens de homologação externa

| Item solicitado | Resultado nesta etapa | Motivo e próximo passo |
|---|---|---|
| 1. Conectar projeto Supabase dedicado | NÃO EXECUTADO | Projeto/conta não configurados; Marcelo segue o guia em ambiente exclusivo de teste. |
| 2. Aplicar três migrations | NÃO EXECUTADO | Depende do projeto; aplicar na ordem e guardar inventário/hashes. |
| 3. Bootstrap restrito de superadmin | NÃO EXECUTADO | Depende de UUID de conta real de teste confirmada; script incluído. |
| 4. Configurar Auth | NÃO EXECUTADO | Depende de acesso ao projeto e configuração de envio de e-mail; parâmetros documentados. |
| 5. Cadastro, confirmação, login, logout e recuperação | NÃO EXECUTADO | Dependem de Auth real e caixas de e-mail de teste controladas pelo operador. |
| 6. Isolamento/autorização HTTP com JWT válido | NÃO EXECUTADO | Runner preparado; faltam seis contas e duas empresas fictícias no projeto dedicado. |
| 7. Concorrência com conexões independentes | NÃO EXECUTADO | Roteiros preparados; registrar PIDs distintos e sobreposição das transações. PostgreSQL nativo também não ficou disponível no ambiente local anterior. |
| 8. Suspensão/revogação com sessões existentes | NÃO EXECUTADO em ambiente real | Runner conserva os access tokens para repetir operações após alterações. |
| 9. Chaves privilegiadas no frontend | Verificações locais anteriores preservadas; verificação do ambiente real PENDENTE | Conferir a configuração final e o build real seguindo o guia; nunca fornecer service role ao frontend. |
| 10. Proteção de abuso | NÃO EXECUTADO em ambiente real | Conferir limites/Auth/SMTP. CAPTCHA ainda não está integrado ao frontend; se exigido, registrar bloqueio e tratar como correção da Fundação sem desativar a proteção. |
| 11. Backup/restauração | Estratégia DOCUMENTADA; restauração NÃO EXECUTADA | Não há origem nem destino isolado configurado; escolher método compatível e ambiente de restauração já disponível sem ativar serviço pago. |

## Falhas, correções e pendências

Nenhuma falha permaneceu nos dez testes locais. Não há falha remota constatada nem correção remota efetuada, pois não houve execução externa. As ferramentas incluem recusa de ambiente incoerente, chaves privilegiadas e dados fora do recorte de teste. Esses controles não flexibilizam RLS ou constraints.

Pendências: configurar projeto dedicado e contas fictícias; executar o guia; coletar evidências de todos os itens externos; resolver eventuais falhas, inclusive compatibilidade de CAPTCHA quando aplicável; executar e documentar restauração segura ou registrar justificativa e decisão explícita sobre a pendência. Credenciais devem permanecer exclusivamente no ambiente local do operador, fora do pacote e do versionamento.

## Decisão

**A Fundação ainda não pode ser considerada homologada em Supabase real para início da Fase 3.** A implementação local está aprovada pelo usuário, mas faltam as evidências externas acima. Após a homologação, o avanço continua dependendo da aprovação expressa de Marcelo. Nenhum deploy ou lançamento foi realizado.
