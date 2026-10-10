# Preservação de desempenho — antes × depois

Antes: artefato histórico da base consolidada `reports/ux001/perf-preservation/measurements.json`, recebido com o projeto. Não foi reexecutado nesta rodada. Depois: `reports/team-availability/performance/measurements.json`, medido em 03/10/2026. Mesmo harness e Chromium 153.0.8010.0; build de produção, API/mídia com 120 ms de latência artificial e chunks JavaScript com 250 ms. Ambiente fictício/local; uma amostra por cenário, sem significado de benchmark estatístico ou SLA.

As durações incluem a espera do harness para a rede estabilizar. Não se atribui ganho ou piora aos pequenos desvios de tempo.

| Cenário | Requests antes → depois | Duração observada, ms | Assinaturas repetidas antes → depois | Overflow depois, px |
|---|---|---|---|---|
| root-open-cold | 9 → 9 | 1717 → 1625 | 0 → 0 | 0 |
| company-double-click | 15 → 15 | 2824 → 2836 | 2 → 2 | 0 |
| reuse-servicos | 1 → 1 | 869 → 871 | 0 → 0 | 0 |
| reuse-faq | 1 → 1 | 858 → 880 | 0 → 0 | 0 |
| reuse-manual | 2 → 2 | 1492 → 1408 | 0 → 0 | 0 |
| reuse-respostas | 1 → 1 | 856 → 873 | 0 → 0 | 0 |
| reuse-regras | 2 → 2 | 862 → 873 | 0 → 0 | 0 |
| billing | 3 → 4 | 1188 → 1178 | 0 → 0 | 0 |
| company-media | 9 → 9 | 1703 → 1733 | 0 → 0 | 0 |
| preview | 5 → 5 | 996 → 1006 | 0 → 0 | 0 |
| send-parallel | 3 → 3 | 1086 → 1106 | 0 → 0 | 0 |

A assinatura acrescenta `assisted_company_usage`, consulta necessária para a nova visualização de consumo; `billing_capabilities` permanece em uma chamada. A tela de pessoas usa os dados de disponibilidade incorporados à RPC `permissions_team`. Os testes de navegador verificam que a UI não chama `employee_availability_context` separadamente por pessoa.

No clique duplo, `/access/context` continua uma vez. As duas assinaturas repetidas são `access_session` e `permissions_context`, já registradas na base durante a revalidação da sessão; o trace também registra a saída temporária do shell nesse caminho empresarial. UX-002 permanece adiado, sem mudança em login/AuthProvider/revalidação. Não se afirma que todas as chamadas repetidas ou transições da base foram eliminadas.

Na montagem fria pelo Super Admin, o shell não desaparece e `onboarding_context` ocorre uma vez. O reuso de `company_context` mantém zero refetch nos cinco deslocamentos medidos. Downloads de mídia não duplicam arquivo, as quatro imagens da prévia entram concorrentemente e o pós-envio da Central atualiza contexto/fila em paralelo.

Resultado: **PASS** nas asserções originais de preservação, sem alterar o harness ou seus critérios. Arquivos: `checks.json`, `measurements.json`, `cold-trace.zip` e `regression-trace.zip` em `reports/team-availability/performance/`. O primeiro ensaio sem endpoints de demo falhou no login; está registrado em `reports/team-availability/perf-initial-setup.log`. O build de demo corrigiu a configuração do ensaio, sem mudança no produto.
