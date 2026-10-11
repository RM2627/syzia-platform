# SYZIA 049 — Resultado dos testes

## Resultado final da base limpa

**PASS — 21/21 etapas do gate**, Linux x86_64, v24.19.0, npm, PGlite/HTTP local e Chromium. Início: 2026-10-11T00:47:45.168Z. Fim: 2026-10-11T01:00:08.539Z.

Comandos executados em diretório novo após extrair a 048 e sobrepor o ZIP 049:

```sh
npm ci
npm run build
npm run test:current-gate
```

Instalação e build/typecheck passaram. O gate inclui 35 testes focados 049, 24 da 048 e 33 de billing 047, todos aprovados, zero falha/skip nessas suítes Linux. Inclui também quatro casos browser da 049, regressões 040–046, onboarding, Agenda, Atendimento, Comercial, Financeiro, Equipe, permissões, sessão e UX-001. A tabela detalha cada etapa; números são execuções por comando, não uma contagem inventada de requisitos únicos.

| Etapa | Resultado | Casos reportados | Skips reportados | Duração |
| --- | --- | --- | --- | --- |
| focused-049 | PASS | 35 | 0 | 24.5 s |
| focused-048 | PASS | 24 | 0 | 14.7 s |
| billing-047 | PASS | 33 | 0 | 20.8 s |
| gate-contracts | PASS | 3 | 0 | 0.4 s |
| flexible-upgrade | PASS | 1 verificação do script | 0 | 5.5 s |
| flexible-support | PASS | 20 verificações do script | 0 | 8.9 s |
| team-upgrade | PASS | 1 verificação do script | 0 | 5.0 s |
| team-availability | PASS | 26 verificações do script | 0 | 10.3 s |
| ux001-security | PASS | 6 verificações do script | 0 | 5.7 s |
| focused | PASS | 28 verificações do script | 0 | 9.4 s |
| upgrade | PASS | validação sem contagem de casos | 0 | 5.4 s |
| regression-040-042 | PASS | 130 verificações do script | 0 | 31.0 s |
| gateways | PASS | 62 | 0 | 0.8 s |
| build | PASS | validação sem contagem de casos | 0 | 1.3 s |
| browser | PASS | 30 casos browser | 0 | 330.4 s |
| team-browser | PASS | 8 casos browser | 0 | 48.4 s |
| ux001-browser | PASS | 10 casos browser | 0 | 80.2 s |
| browser-049 | PASS | 4 casos browser | 0 | 32.9 s |
| browser-048 | PASS | 1 caso browser | 0 | 18.9 s |
| billing-browser | PASS | 1 caso browser | 0 | 14.2 s |
| flexible-browser | PASS | 9 casos browser | 0 | 74.7 s |

O grupo de navegação registra 82 checkpoints adicionais em desktop/mobile dentro de seu caso Playwright. O teste controlado do runner provoca saída 42 em um processo filho e verifica relatório FAIL; isso é uma asserção de sucesso do gate, não falha oculta. O log completo e o JSON do gate estão no pacote de evidências 049.

## Matriz focada 049

| Grupo | Cobertura | Resultado local |
| --- | --- | --- |
| F (5 casos) | Três eventos, HMAC, query/body/request-id, recurso oficial simulado, repetição, harness OFF | PASS |
| H/S HTTP (3) | Encerramento portátil, emissão/liberação de nonce, email/CAPTCHA/rate preservados | PASS |
| I (2) | 44 migrations anteriores/core billing/unified intactos e lockfile PDF autorizado | PASS |
| O01–O04 | Presença idempotente, isolamento, remarcação/histórico, passado/concluído/cancelado | PASS |
| D01–D05 | Preço/versão/estado, desconto, acesso A/B, comprovante inexistente/cancelado, mídia privada/uso único/expiração | PASS |
| C01–C04 | Lista vazia/vários itens, persistência, progresso, revisão/abas, remoção lógica, grants e serviço encerrado | PASS |
| U01/U02 | Recebidas/próprias, leitura individual, refresh, cursor sem regressão e isolamento | PASS |
| T01/T02 | Telefone BR/internacional, erro backend, consentimento/legado e tenant | PASS |
| S01–S03/S06 | RLS/FORCE RLS, nonce falso/ausente/repetido/expirado, vínculo, anon e funcionário reservado | PASS |
| X01/T03/D06 (3) | Singular/plural/zero/ilimitado, WhatsApp, PDF multipágina com acentos e texto longo | PASS |
| G01 (1) | Upgrade populado: registros e proteções existentes preservados; backfill de mensagens | PASS |
| B01–B04 (4) | Fluxos reais de UI, downloads/logo, fotos, checklist/refresh, WhatsApp, Enter/Shift/IME/touch, autoscroll/retry, polling | PASS |

## Antes × depois e correções verificadas

Duas execuções intermediárias detectaram problemas antes do fechamento: suporte flexível teve 7 aprovados/2 falhas por seletor legado; navegador 049 teve 3 aprovados/1 falha por contagem síncrona no reenvio. Ambas foram corrigidas e reexecutadas. Logs diagnósticos dessas duas falhas acompanham as evidências, separados do resultado final PASS.

- Mensagens antigas eram imutáveis: o primeiro ensaio de backfill recusou sua alteração. A implementação final usa tabela auxiliar e não modifica histórico; G01 compara os registros originais.
- Presença/leitura/checklist não tinham contratos persistentes. A 049 adiciona dados privados, revisão, idempotência, histórico e interfaces, mantendo os estados comerciais separados.
- Reserva de imagens após confirmação era possível em parte dos pedidos diretos, apesar do bloqueio da UI. Reserva/gateway passaram a consultar também agendamento confirmado; fotos já existentes continuam acessíveis.
- Label de composição e seleção da versão inicial para WhatsApp foram ajustados nos testes reais de UI. Estimativa permanece explicitamente estimativa.
- O teste de checkbox passou a aguardar a resposta persistida após o clique; não presume gravação síncrona. O teste de reenvio aguarda exatamente uma mensagem renderizada após a consulta assíncrona, em vez de ler a contagem imediatamente após limpar o campo. O relógio virtual do teste de polling é instalado antes de montar os timers. Nenhuma asserção de produto foi removida.
- A regressão 046 detectou a retirada de `.c-chat-message` no novo histórico; a mensagem constava do snapshot da página, mas o seletor legado não a identificava. A classe e o vínculo ao tema do consumidor foram preservados no componente; o teste original permaneceu intacto e passou após correção.
- Na revisão visual, aumentou-se a separação entre logo e nome da empresa. PDFs foram renderizados e examinados, incluindo quebra de página; não houve teste em impressora física.
- O lock transacional anterior ao backfill evita uma janela de inserção sem sequência durante a migration. Quantidade × preço é multiplicada como bigint no snapshot PDF, evitando overflow de integer.

## Sobreposição e pacote

O ZIP foi extraído sobre uma 048 nova, sem pasta foundation duplicada. Sentinelas locais `.env`, `.env.server`, `.env.server.backup` e `syzia-plan-mapping.local.json` permaneceram byte a byte. Dependências foram instaladas novamente nessa extração. Os artefatos gerados por testes ficaram fora da base principal. No fechamento, o conteúdo de execução/testes do ZIP foi comparado por hash com o diretório validado; apenas relatórios finais foram completados após o gate.

## Windows e externo

**Windows não foi executado neste Work.** O Node documenta que `child.kill('SIGTERM')` no Windows encerra abruptamente. 048-H08 continua com asserção estrita e passou em Linux; no Windows recebe skip específico e explicado, acompanhado de 049-H01 portátil testando `stop()`, drenagem e saída do processo. Não afirmamos PASS de SIGTERM Windows.

**PENDENTE — AÇÃO DO PROPRIETÁRIO:** MP-01 real; Auth Hook/SMTP hospedados; aplicação da migration no projeto real; PostgreSQL real com sessões físicas concorrentes; Safari/iOS e dispositivos físicos. Não foram usados credenciais reais, deploy ou SQL remoto. O ensaio offline dos três planos terminou com zero chamadas externas; é prova local, não homologação do Mercado Pago.

Referência para sinais Windows: https://nodejs.org/api/child_process.html#subprocesskillsignal .
