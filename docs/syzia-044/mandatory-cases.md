# Cobertura dos 42 critérios obrigatórios

Resultados efetivos dependem do `current-gate.json` desta entrega. Cada critério pode reunir múltiplas asserções; não se conta cada linha abaixo como um teste adicional. Caminhos JSON/PNG abaixo são relativos a `reports/syzia-044/`, salvo indicação `docs/`.

| Nº | Critério | Evidência executável/resultado |
|---|---|---|
| 1 | Avaliação sem proposta negada | focused.json · A1-absent |
| 2 | Proposta enviada não aprovada negada | focused.json · A1-sent |
| 3 | Proposta recusada negada | focused.json · A1-declined |
| 4 | Proposta aprovada permite reserva válida | focused.json · A1-approved; regression-041 11 |
| 5 | Conflito preserva aprovação | focused.json · A1-approved; regression-041 12 |
| 6 | Contratação direta preservada | focused.json · A1-direct; regression-041 02–03 |
| 7 | Manual legítimo preservado | focused.json · A1-manual-whatsapp/direct/referral/other |
| 8 | Manual não contorna pedido público | focused.json · A1-origin / A1-absent |
| 9 | Wrapper legada não contorna | focused.json · A1-legacy |
| 10 | RPC/API não contorna | focused.json · A1-boundary; browser.json · HTTP 044 |
| 11 | Negação não muda oportunidade | focused.json · A1-absent/sent/declined |
| 12 | Replay não duplica | focused.json · A1-direct / A1-manual-* |
| 13 | Isolamento A/B | focused.json · A1-tenant; regression-042 43 |
| 14 | Reserva mantém configuração histórica | focused.json · A2-history; upgrade.json |
| 15 | Remarcação usa buffer aumentado | focused.json · A2-buffer-0-30; browser.json · ficha 044 |
| 16 | Remarcação usa buffer reduzido | focused.json · A2-buffer-30-0 |
| 17 | Serviço separado do buffer | focused.json · A2-buffer-*; buffer-current.png |
| 18 | Conflito causado pelo buffer bloqueia | focused.json · A2-conflict |
| 19 | Falha preserva reserva | focused.json · A2-conflict/horizon/lead/grid/hours |
| 20 | Parte isolada usa buffer vigente | focused.json · A2-buffer-* |
| 21 | Replanejamento revalida buffers | focused.json · A2A3-replan; regression-042 34/47 |
| 22 | Capacidade/bloqueio/funcionamento | focused.json · A2-conflict/hours/lead/horizon/grid; regression-042 27/29/34 |
| 23 | Parte 2 não antecede Parte 1 | focused.json · A3-second |
| 24 | Parte 1 não sucede Parte 2 | focused.json · A3-first |
| 25 | Intermediária respeita anterior/posterior | focused.json · A3-middle |
| 26 | Remarcação válida funciona | focused.json · A3-valid; browser.json · ficha 044 |
| 27 | Tentativa inválida preserva Agenda | focused.json · A3-second/first/middle |
| 28 | Acompanhamento mantém ordem | focused.json · A3-valid; regression-042 30 |
| 29 | Agenda/ficha mantém ordem | focused.json · A3-valid; regression-042 31 |
| 30 | Replanejamento reorganiza conjunto | focused.json · A2A3-replan; regression-042 33 |
| 31 | Histórico preservado | upgrade.json; focused.json · A2A3-replan; regression-042 33/36 |
| 32 | Cancelamento continua correto | focused.json · A2A3-replan; regression-042 35/36 |
| 33 | Gate oficial executa | current-gate.json |
| 34 | Sucesso quando vigentes passam | current-gate.json · todas as etapas |
| 35 | Falha controlada retorna não-zero | gate-controlled-failure.json · filho 42, runner 1; gate-gate-contracts.log |
| 36 | Documento lista suítes vigentes | docs/testing/current-regression-gate.md; gate-gate-contracts.log |
| 37 | Históricos preservados | docs/testing/preserved-042-sha256.json; gate-gate-contracts.log |
| 38 | Requisitos antigos válidos cobertos | docs/testing/history-current-map.json/md; regressões atuais |
| 39 | Substituições aprovadas documentadas | docs/testing/history-current-map.json/md; adaptadores explícitos |
| 40 | Build/typecheck | gate-build.log; bundle-build.txt; bundle-bundle-scan.json |
| 41 | Migrations/upgrade/integridade | upgrade.json; gate-gate-contracts.log |
| 42 | Fluxos 040/041/042 preservados | regression-040/041/042.json; browser.json; onboarding.json |
