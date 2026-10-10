# Testes e evidências — implementação 030

Execução local em 21/09/2026, com dados fictícios. SQL PostgreSQL em PGlite; Chromium 153; Auth e integrações de transporte simulados nas fixtures. Não equivale a Supabase/PostgREST/Auth/Storage reais.

## Resultado final por conjunto

| Conjunto | Resultado | Evidência em `reports/implementation-030/` |
|---|---|---|
| Backend 030, isolamento e upgrade | 30/30 aprovados | `backend.json`, `backend-run.log`, `upgrade.json` |
| Calculadoras puras | 5/5 aprovados | `calculators.log` |
| Regressão dos módulos anteriores | 32/32 suítes com saída 0 | `regression.json`, `regression-*.log` |
| Contratos de interface | 45/45 casos aprovados após reteste | `browser-contract-full.json`, `browser-contract-final-focus.json` |
| Jornadas da demo no navegador | 62/62 casos aprovados após reteste | `browser-demo-full.json`, `browser-demo-final-focus.json` |
| Demo HTTP local | Aprovação do fluxo integrado | `demo-http.log` |
| TypeScript, build e canário de segredo no bundle | Aprovados; marcador de servidor ausente do bundle | `bundle-final.log` e `../phase-8-bundle-scan.json` |
| Inspeção RLS/FORCE RLS e privilégios de helpers | Nenhuma tabela sem ambas as proteções; nenhum alias privado exposto | `security-audit.log`, `backend.json` |
| Concorrência PostgreSQL nativa | **Não executada: 8 casos preparados, runner bloqueado antes dos testes** | `native-concurrency.log`; `tests/implementation-030-native.test.mjs` |

As contagens de navegador são casos únicos com seu último resultado. A execução integral de contratos terminou em 44 aprovados + 1 expectativa de texto desatualizada; o caso corrigido passou no reteste. A execução integral final da demo terminou em 61 aprovados + 1 expectativa antiga de Métricas; a jornada inteira de 34 etapas passou no reteste. `browser-final-summary.json` associa cada caso à evidência original e ao reteste, sem transformar os relatórios intermediários em execuções integralmente verdes.

As 32 suítes incluem segurança, configuração, empresa, consumidor, página/portfólio, Central, Comercial, Analytics, billing/provider, trial, onboarding, agenda/operações, multissegmento, acesso empresarial, ativação, ambiente empresarial, suporte 029, upgrades e ferramentas. A suíte multissegmento foi reexecutada isoladamente para completar seu registro final (`regression-multisegment-final.log`). Não somar números de suítes a números de casos como se fossem a mesma unidade.

## Cobertura específica

- Cobrança de R$ 170, recebimento de R$ 50, saldo de R$ 120; autorização individual para receber o restante, sem totais da empresa. Conta manual, conta gerada por nova aprovação, sinal/múltiplos recebimentos, quitação, vencimento, sobrepagamento negado, cancelamento, despesas, caixa e estorno imutável.
- Idempotência sequencial, conflito de payload, revisão concorrente lógica, mesmo JWT depois de revogação, duplicação negada e registros originais preservados. Esses testes não substituem corrida com conexões simultâneas.
- ADM, colaborador, atendente próprio, compartilhado, Super Admin, consumidor e anônimo; negações por RPC, rota e banco/RLS. A/B isolados; projeções de página sem solicitações/agenda/portfólio não autorizados; financeiro consolidado removido de métricas não autorizadas.
- Categorias migradas/reutilizadas/renomeadas/ordenadas/desativadas; exclusão em uso negada. Categoria da outra organização recusada.
- Capacidade ausente recusa atribuição compartilhada inclusive global; capacidade presente permite; downgrade suspende vínculo e conserva histórico. Concessão interna/isenta explícita sem trial ou assinatura artificial.
- Primeiro acesso normal, senha, aceite legal, CPF/CNPJ válido/inválido, CNPJ alfanumérico, hash/máscara, trial já utilizado e revisão excepcional. Nenhuma consulta governamental.
- Super Admin sem ADM: sessão empresarial global válida, onboarding, salvar/navegar/revalidar sem membership artificial; empresas com ADM continuam sujeitas ao suporte autorizado 029. Organização suspensa não é apresentada como conta sem confirmação de e-mail.
- Interface de Financeiro em desktop/tablet/celular, concessão/revogação, categorias, onboarding, página pública, consumidor→atendimento→proposta→aprovação→agenda→métricas, equipe e suporte. Screenshots `finance-desktop.png`, `finance-tablet.png`, `finance-mobile.png`, `permissions-desktop.png` foram inspecionados.

## Upgrade 029→030

Aplicação incremental da 030 sobre banco 029 populado. Snapshot anterior/posterior idêntico para organizações, membros, solicitações, propostas, progresso de onboarding **preenchido** e histórico de trial **preenchido**. O teste inclui uma empresa fictícia com trial e um tutorial iniciado e avançado antes da migration. As 29 migrations originais têm o mesmo SHA-256 da base. Não houve reset.

## Falhas encontradas e correções verificadas

1. Revalidação periódica de permissões recriava contexto e remontava formulários; estabilizado o contexto e as dependências de carregamento. Teste de rascunhos em seis módulos passou após foco e espera pelo refresh.
2. Suspensão de empresa podia terminar em mensagem falsa sobre a conta; estado empresarial agora é distinguido no servidor e na tela.
3. O registro cadastral inicial vazio da 030 bloqueava exclusão conservadora de empresa vazia; guard ajustado sem permitir apagar documento, concessão ou histórico.
4. Fixtures antigas não aplicavam a 030 ou não possuíam a capacidade comercial exigida. Foram atualizadas com concessões/contratos fictícios explícitos; nenhuma regra do produto foi enfraquecida.
5. Testes anteriores precisavam percorrer a nova verificação cadastral e validar indicadores financeiros reais. Atualizados para o fluxo normal e valores concretos, sem contornar a autorização.
6. Navegação financeira herdava direção vertical no desktop; CSS corrigido e evidências desktop/tablet/celular revisadas.

`browser-demo-before-fixes.json` preserva a execução inicial com cinco falhas. Logs intermediários `browser-contract.log`, `browser-regression.log` e outros diagnósticos não são a evidência final; houve sobreposição de gravação em um log durante execução anterior. Para resultado final, utilizar os JSONs identificados na tabela e seus retestes.

## Reprodução

```sh
npm ci
npm run build
npm run test:030
npm run test:030:calculators
node scripts/regression-030.mjs
npm run test:ui
npm run test:demo:browser
npm run test:demo
npm run check:bundle
npm run test:030:native
```

Configurar Chromium conforme README. O último comando precisa de PostgreSQL nativo em ambiente Linux compatível; cria somente cluster descartável local. Aqui, o mapeamento de usuário não root foi bloqueado antes de iniciar o servidor. Não existe resultado de aprovação de concorrência nativa. Homologação externa, restauração e integrações reais continuam em `pending.md`.
