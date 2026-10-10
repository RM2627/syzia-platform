# Matriz antes × depois

Build de produção sobre a fixture SQL/HTTP sintética da 044; Chromium 153. Latência acrescentada: 120 ms por API/mídia e 250 ms por chunk JS. Desktop 1440 px; mobile 390 px. `Tempo` é a janela de estabilização do instrumento (inclui 650 ms sem tráfego), não latência pura nem percentil de produção. As medições são execuções pontuais, sem intervalo estatístico.

`G` = episódios de status de carregamento sem shell visível; inclui bootstrap/login quando há recarga de documento. Não conta quatro blocos locais da Home como quatro loaders globais. `R` = requests observadas à API/servidor de mídia; `RPC` = subconjunto de RPCs. Polling e atividade de sessão podem variar R sem alteração funcional.

| Fluxo / sonda | Largura | G antes → depois | R antes → depois | RPC antes → depois | Tempo antes → depois | Resultado / evidência |
|---|---:|---:|---:|---:|---|---|
| root-open-cold | 1440 | 1 → 0 | 10 → 9 | 10 → 9 | 1.70 s → 1.62 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| login-1440 | 1440 | 3 → 2 | 18 → 17 | 16 → 15 | 3.60 s → 3.64 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| open-company-1440 | 1440 | 2 → 1 | 16 → 15 | 14 → 13 | 2.81 s → 2.84 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-agenda-1440 | 1440 | 0 → 0 | 3 → 3 | 3 → 3 | 0.86 s → 0.87 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| agenda-week-1440 | 1440 | 0 → 0 | 1 → 1 | 1 → 1 | 0.86 s → 0.88 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| agenda-month-1440 | 1440 | 0 → 0 | 1 → 1 | 1 → 1 | 0.87 s → 0.86 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-pendencias-1440 | 1440 | 0 → 0 | 3 → 3 | 3 → 3 | 1.90 s → 1.60 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-atendimento-1440 | 1440 | 0 → 0 | 1 → 1 | 1 → 1 | 0.87 s → 0.89 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| ticket-1-1440 | 1440 | 0 → 0 | 2 → 2 | 2 → 2 | 0.96 s → 0.97 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| ticket-2-1440 | 1440 | 0 → 0 | 2 → 2 | 2 → 2 | — → — | UX-001: abertura muda rota/fila; troca efetiva medida em `ticket-switch-*`. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-clientes-1440 | 1440 | 2 → 1 | 8 → 7 | 8 → 7 | 2.16 s → 2.16 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-comercial-1440 | 1440 | 0 → 0 | 3 → 3 | 3 → 3 | 1.19 s → 1.21 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-orcamentos-1440 | 1440 | 0 → 0 | 2 → 2 | 2 → 2 | 0.91 s → 0.89 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-metricas-1440 | 1440 | 0 → 0 | 3 → 4 | 3 → 4 | 1.17 s → 2.04 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-financeiro-1440 | 1440 | 0 → 0 | 4 → 3 | 4 → 3 | 0.96 s → 0.90 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-assinatura-1440 | 1440 | 0 → 0 | 4 → 4 | 4 → 4 | 1.18 s → 1.18 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-acessos-1440 | 1440 | 0 → 0 | 9 → 9 | 4 → 4 | 1.50 s → 1.54 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-pagina-1440 | 1440 | 0 → 0 | 10 → 8 | 5 → 4 | 1.53 s → 1.40 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-configuracao-1440 | 1440 | 0 → 0 | 2 → 7 | 2 → 7 | 1.19 s → 2.48 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-servicos-1440 | 1440 | 0 → 0 | 5 → 1 | 5 → 1 | 1.07 s → 0.91 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-manual-1440 | 1440 | 0 → 0 | 6 → 1 | 6 → 1 | 1.70 s → 0.89 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-faq-1440 | 1440 | 0 → 0 | 2 → 1 | 2 → 1 | 0.86 s → 0.90 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-respostas-1440 | 1440 | 0 → 0 | 2 → 3 | 2 → 3 | 0.87 s → 0.90 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-regras-1440 | 1440 | 0 → 0 | 2 → 1 | 2 → 1 | 0.86 s → 0.87 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-ajuda-1440 | 1440 | 0 → 0 | 2 → 1 | 2 → 1 | 0.86 s → 0.88 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-home-1440 | 1440 | 0 → 0 | 6 → 6 | 6 → 6 | 0.95 s → 0.95 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| public-1440 | 1440 | 1 → 1 | 5 → 5 | 1 → 1 | 1.54 s → 1.66 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| public-services-1440 | 1440 | 0 → 0 | 0 → 0 | 0 → 0 | 0.16 s → 0.17 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| public-request-1440 | 1440 | 0 → 0 | 0 → 0 | 0 → 0 | 0.20 s → 0.21 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| login-390 | 390 | 3 → 2 | 18 → 17 | 16 → 15 | 3.59 s → 3.64 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| open-company-390 | 390 | 2 → 1 | 16 → 15 | 14 → 13 | 2.82 s → 2.86 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-agenda-390 | 390 | 0 → 0 | 3 → 3 | 3 → 3 | 0.87 s → 0.88 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| agenda-week-390 | 390 | 0 → 0 | 1 → 1 | 1 → 1 | 0.87 s → 0.89 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| agenda-month-390 | 390 | 0 → 0 | 1 → 1 | 1 → 1 | 0.86 s → 0.88 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-pendencias-390 | 390 | 0 → 0 | 3 → 3 | 3 → 3 | 1.17 s → 1.61 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-atendimento-390 | 390 | 0 → 0 | 1 → 1 | 1 → 1 | 0.87 s → 0.87 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| ticket-1-390 | 390 | 0 → 0 | 2 → 2 | 2 → 2 | 0.96 s → 0.99 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| ticket-2-390 | 390 | 0 → 0 | 2 → 2 | 2 → 2 | — → — | UX-001: abertura muda rota/fila; troca efetiva medida em `ticket-switch-*`. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-clientes-390 | 390 | 2 → 1 | 8 → 7 | 8 → 7 | 2.15 s → 2.18 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-comercial-390 | 390 | 0 → 0 | 3 → 3 | 3 → 3 | 1.19 s → 1.20 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-orcamentos-390 | 390 | 0 → 0 | 2 → 2 | 2 → 2 | 0.86 s → 0.89 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-metricas-390 | 390 | 0 → 0 | 3 → 3 | 3 → 3 | 1.20 s → 1.19 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-financeiro-390 | 390 | 0 → 0 | 4 → 4 | 4 → 4 | 1.27 s → 0.86 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-assinatura-390 | 390 | 0 → 0 | 5 → 3 | 5 → 3 | 1.18 s → 1.18 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-acessos-390 | 390 | 0 → 0 | 8 → 9 | 3 → 4 | 1.51 s → 1.52 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-pagina-390 | 390 | 0 → 0 | 10 → 9 | 5 → 5 | 1.70 s → 1.68 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-configuracao-390 | 390 | 0 → 0 | 3 → 2 | 3 → 2 | 1.18 s → 1.19 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-servicos-390 | 390 | 0 → 0 | 4 → 2 | 4 → 2 | 1.07 s → 0.88 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-manual-390 | 390 | 0 → 0 | 6 → 1 | 6 → 1 | 2.31 s → 0.86 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-faq-390 | 390 | 0 → 0 | 2 → 5 | 2 → 5 | 0.87 s → 1.57 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-respostas-390 | 390 | 0 → 0 | 3 → 1 | 3 → 1 | 0.88 s → 0.87 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-regras-390 | 390 | 0 → 0 | 2 → 1 | 2 → 1 | 0.86 s → 0.86 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-ajuda-390 | 390 | 0 → 0 | 1 → 2 | 1 → 2 | 0.86 s → 0.87 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| route-home-390 | 390 | 0 → 0 | 6 → 6 | 6 → 6 | 0.97 s → 0.97 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after/measurements.json) · [Antes](reports/ux-performance/before/measurements.json) |
| public-390 | 390 | 1 → 1 | 5 → 5 | 1 → 1 | 1.70 s → 1.67 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-supplement/measurements.json) · [Antes](reports/ux-performance/before-supplement/measurements.json) |
| public-services-390 | 390 | 0 → 0 | 0 → 0 | 0 → 0 | 0.16 s → 0.17 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-supplement/measurements.json) · [Antes](reports/ux-performance/before-supplement/measurements.json) |
| public-request-390 | 390 | 0 → 0 | 0 → 0 | 0 → 0 | 0.22 s → 0.21 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-supplement/measurements.json) · [Antes](reports/ux-performance/before-supplement/measurements.json) |
| ticket-open-1440 | 1440 | 0 → 0 | 2 → 2 | 2 → 2 | 0.97 s → 1.00 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| claim-1440 | 1440 | 0 → 0 | 3 → 3 | 3 → 3 | 1.19 s → 1.09 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| send-message-1440 | 1440 | 0 → 0 | 4 → 4 | 4 → 4 | 1.20 s → 1.14 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| ticket-switch-1440 | 1440 | 0 → 0 | 1 → 1 | 1 → 1 | 0.86 s → 0.90 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| client-context-1440 | 1440 | 0 → 0 | 0 → 0 | 0 → 0 | 0.16 s → 0.16 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| quote-open-1440 | 1440 | 0 → 0 | 3 → 3 | 3 → 3 | 1.08 s → 1.09 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| page-preview-1440 | 1440 | 0 → 0 | 6 → 6 | 2 → 2 | 1.40 s → 1.01 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| ticket-open-390 | 390 | 0 → 0 | 2 → 2 | 2 → 2 | 0.96 s → 0.97 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| claim-390 | 390 | 0 → 0 | 3 → 3 | 3 → 3 | 1.19 s → 1.09 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| send-message-390 | 390 | 0 → 0 | 4 → 4 | 4 → 4 | 1.19 s → 1.10 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| ticket-switch-390 | 390 | 0 → 0 | 1 → 1 | 1 → 1 | 0.89 s → 0.88 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| client-context-390 | 390 | 0 → 0 | 0 → 0 | 0 → 0 | 0.14 s → 0.16 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| quote-open-390 | 390 | 0 → 0 | 3 → 3 | 3 → 3 | 1.08 s → 1.00 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |
| page-preview-390 | 390 | 0 → 0 | 6 → 6 | 2 → 2 | 1.42 s → 1.00 s | Registrado; sem overflow horizontal. [Depois](reports/ux-performance/after-actions/measurements.json) · [Antes](reports/ux-performance/before-actions/measurements.json) |

## Regressões focadas adicionais

| Cenário | Resultado | Evidência |
|---|---|---|
| home-isolated-block-failure | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| home-block-retry | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| category-save-refresh | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| configuration-reuse | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| open-double-click | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| responsive-agenda-320 | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| responsive-clientes-320 | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| responsive-atendimento-320 | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| responsive-orcamentos-320 | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| responsive-agenda-768 | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| responsive-clientes-768 | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| responsive-atendimento-768 | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |
| responsive-orcamentos-768 | PASS (asserções executadas) | [Dados](reports/ux-performance/after-guards/measurements.json) |

## Cobertura dos 30 fluxos da especificação

“Navegador/gate” significa que o fluxo foi exercitado pela regressão vigente, sem cronometragem específica antes/depois nesta rodada. Não é apresentado como benchmark. As 30 specs do navegador incluem uma spec de navegação com subcasos desktop/mobile.

| Nº | Fluxo solicitado | Evidência desta rodada | Limite da medição |
|---:|---|---|---|
| 1 | Login → empresa → Home | login-*; gate: Login por identidade | Sessão + destino; UX-002 pendente |
| 2 | Minhas empresas → Abrir empresa | root-open-cold; open-company-* | Produção fria; shell e RPCs instrumentados |
| 3 | Trocar empresa/contexto | gate: Login uma/múltiplas empresas, isolamento/sessões; chave explícita de PermissionProvider | Sem benchmark isolado A→B com conta real |
| 4 | Home → Agenda | route-agenda-* | Clique real quando link visível |
| 5 | Home → Precisa da sua atenção | route-pendencias-*; gate Home e falha isolada | Painel de pendências e links existentes |
| 6 | Home → Atendimento | route-atendimento-* | UX-001 preservado para aprovação |
| 7 | Home → Cliente | route-clientes-*; gate Home | Lista/CTA e consulta de contexto do cliente |
| 8 | Agenda: data/visualização | agenda-week-*; agenda-month-*; gate remarcação | Disponibilidade sempre revalidada |
| 9 | Consultar disponibilidade | gate 042: serviço contínuo e divisível | Sem cronometragem antes/depois específica |
| 10 | Abrir/trocar tickets | ticket-open-*, ticket-switch-*; UX-001 | Exige reselecionar Todos após rota global |
| 11 | Assumir atendimento | claim-*; gate colaborador sem grants | Fixture com presença Disponível |
| 12 | Enviar mensagem | send-message-* | Comando seguido de duas leituras independentes |
| 13 | Cliente/histórico | client-context-*; gate navegação e ficha | Sem novo histórico/fluxo criado |
| 14 | Comercial/oportunidade | route-comercial-*; gate retorno abre oportunidade | Sem carga de alto volume |
| 15 | Abrir/montar proposta | quote-open-*; gate Calculadora | Envio e aprovação no gate |
| 16 | Visualizar como cliente/enviar proposta | gate 042 Calculadora e aprovação | Não confundir com page-preview-* (página empresarial) |
| 17 | Acompanhamento do consumidor | gate 040/042 consumidor/execução | Sem benchmark remoto |
| 18 | Aprovar proposta | gate 042 Calculadora; SQL 044 aprovação | Sem repetição de auditoria funcional mestre |
| 19 | Consultar horários | gate 042 contínuo/divisível; 040 FAQ→horários | Horário obsoleto não cacheado |
| 20 | Pessoas e acessos | route-acessos-*; gate Equipe/Identidades | Regras intactas |
| 21 | Serviços | route-servicos-*; category-save-refresh | Categoria reutiliza snapshot autorizado |
| 22 | Página pública → serviço → solicitação | public-*, public-services-*, public-request-*; gate consumidor | Latência local artificial |
| 23 | Métricas | route-metricas-*; gate navegação | Filtros/SQL não alterados |
| 24 | Financeiro | route-financeiro-*; gate navegação | Sem alteração de regra financeira |
| 25 | Plano/assinatura | route-assinatura-*; gate planos/homologação | Consulta de capacidades 2→1; mesmas decisões |
| 26 | Configurações | route-configuracao-*; configuration-reuse | Contexto reaproveitado na mesma montagem/empresa |
| 27 | Manual/FAQ/respostas/regras | route-manual/faq/respostas/regras-*; gate Manual | Polling e refresh após comandos mantidos |
| 28 | Voltar após edição | category-save-refresh; configuration-reuse; gate rascunhos/mídia | Sem cache persistente entre telas desmontadas |
| 29 | Mobile consumidor | public-*-390; gate FAQ, proposta, execução, marca e enquadramento | Browser em viewport mobile; sem aparelho físico/teclado nativo |
| 30 | Mobile empresarial | rotas 390; guards 320/768; gate 390 | Viewport e scroll; sem hardware móvel real |

Evidência do gate: [resultado](reports/ux-performance/gate-final/current-gate.json), [navegador](reports/ux-performance/gate-final/browser.json), [subcasos de navegação](reports/ux-performance/gate-final/ui/resultados.json). As sondas `ticket-2-*` preservam o achado de navegação; a troca funcional posterior aparece em `ticket-switch-*`, não foi tratada como PASS retroativo.
