# Índice de evidências — 046

Todas as evidências são locais e usam dados fictícios. A referência final é `reports/flexible-support/current-gate.json`; o identificador interno `044` é o do runner cumulativo, não a versão do produto validado.

## Resultados verificáveis

| Artefato | Conteúdo |
|---|---|
| `reports/flexible-support/focused.json` | Vinte casos SQL da 046, com resultado individual |
| `reports/flexible-support/upgrade.json` | Comparação de 125 tabelas populadas e dez funções críticas |
| `reports/flexible-support/browser.json` | Nove casos desktop/mobile, sem retries, com resultados e tempos |
| `reports/flexible-support/current-gate.json` | Etapas, comandos, códigos de saída e duração do gate final |
| `reports/flexible-support/current-gate/` | Saídas atuais do runner, incluindo testes 045 e regressões preservadas |
| `reports/flexible-support/performance/checks.json` | Verificações de preservação de desempenho |
| `reports/flexible-support/performance/measurements.json` | Requests, duração, frames, alertas e overflow do ensaio sintético |
| `reports/flexible-support/integrity.json` | Comparação dos arquivos originais com a base 045 |
| `reports/flexible-support/history-preservation.json` | Caminhos copiados da execução atual e relatórios históricos restaurados |

Os caminhos de log dentro do JSON do gate referem-se à raiz de execução. No pacote entregue, adicione `reports/flexible-support/current-gate/` ao caminho indicado para consultar a cópia desta rodada. O runner continua escrevendo nos caminhos tradicionais quando o proprietário o executa novamente.

## Capturas novas

Em `reports/flexible-support/screenshots/`:

- `policy-flexible-{1440,390,320}.png`: política flexível ativa sem grade obrigatória.
- `policy-scheduled-{1440,390,320}.png`: grade, timezone e mensagem preservados no modo programado.
- `plans-{1440,390,320}.png`: benefício e explicação do suporte compartilhado.
- `company-{1440,390}.png`: consulta empresarial, sem editor global.
- `queue-unavailable-{1440,390}.png`: ticket aguardando apoio e assunção indisponível com presença em pausa.
- `claimed-{1440,390}.png`: assunção por integrante disponível e autorizado.
- `consumer-waiting-{1440,390}.png`: mensagem sem prazo e conteúdo preservado após recarregar, com equipe offline.

Os horários, quantidades e preços presentes nas capturas são fixtures de teste e não são definições comerciais da SYZIA. Foram inspecionadas visualmente as telas alteradas, incluindo largura 320; os nove testes verificam também ausência de overflow horizontal.

Os traces Playwright da 046 ficam em `reports/flexible-support/traces/`. Os traces do ensaio de desempenho ficam junto às medições. Eles incluem rede e snapshots da demo fictícia; podem ser abertos com o visualizador local de traces do Playwright já usado pelo projeto.

## Diagnósticos e limites

`reports/flexible-support/diagnostics/gate-initial/` conserva a primeira execução interrompida no caso histórico de métricas por diferença entre dia UTC e dia empresarial. Ela não é o resultado final. O teste intencional `gate-controlled-failure.json` confirma que o runner retorna falha quando uma etapa falha; também não é um bug funcional pendente.

`reports/flexible-support/diagnostics/gate-label/` conserva a execução que detectou o rótulo alterado em Pessoas e acessos, corrigido pela restauração integral daquele arquivo da 045, sem modificar o teste.

Logs com sufixo inicial ou regressão exploratória mostram preparação e diagnóstico anteriores ao gate final. Não substituem a execução final completa. Warnings da demo/Auth fictício e negações esperadas são distinguidos de falhas de assertion.

Não foram exercitados serviços externos, credenciais reais, escala de produção, concorrência independente no PostgreSQL nativo nem restauração real. Esses limites continuam pendentes de homologação externa. Não houve deploy ou publicação.
