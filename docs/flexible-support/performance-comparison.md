# Preservação de desempenho — 045 × 046

Antes: medições históricas da 045 em `reports/team-availability/performance/measurements.json`, preservadas byte a byte. Depois: novo ensaio no build de produção local da 046 em `reports/flexible-support/performance/measurements.json`. Mesmo script `scripts/ux001/perf-preservation.mjs`, Chromium 153, latência sintética de 120 ms/API e 250 ms/chunk.

São observações únicas por cenário, com dados fictícios e esperas instrumentadas. A duração cobre a janela do ensaio, não é TTI, percentil, benchmark de servidor ou promessa de tempo real. Não foi reexecutada nem reconstruída a base antiga. Variações pequenas de duração não provam ganho ou regressão.

| Cenário | Requests 045 → 046 | Assinaturas repetidas 045 → 046 | Duração do ensaio em ms 045 → 046 |
|---|---:|---:|---:|
| Abrir empresa, Super Admin, frio | 9 → 9 | 0 → 0 | 1625 → 1592 |
| Abrir empresa com clique duplo | 15 → 15 | 2 → 2 | 2836 → 2825 |
| Serviços: contexto reaproveitado | 1 → 1 | 0 → 0 | 871 → 875 |
| FAQ: contexto reaproveitado | 1 → 1 | 0 → 0 | 880 → 873 |
| Manual: contexto reaproveitado | 2 → 2 | 0 → 0 | 1408 → 1394 |
| Respostas: contexto reaproveitado | 1 → 1 | 0 → 0 | 873 → 856 |
| Regras: contexto reaproveitado | 2 → 2 | 0 → 0 | 873 → 870 |
| Plano/assinatura | 4 → 4 | 0 → 0 | 1178 → 1173 |
| Mídias empresariais | 9 → 9 | 0 → 0 | 1733 → 1800 |
| Prévia pública | 5 → 5 | 0 → 0 | 1006 → 990 |
| Enviar mensagem na Central | 3 → 3 | 0 → 0 | 1106 → 1111 |

As verificações PASS mantêm: shell presente na abertura fria do Super Admin; uma chamada `onboarding_context`; uma chamada `/access/context` no clique duplo; zero recargas de `company_context` entre seções reaproveitadas; uma chamada de capabilities; downloads sem repetição; quatro imagens da prévia iniciadas em paralelo; contexto e fila atualizados paralelamente após o comando de mensagem. Nenhum alerta final ou overflow foi encontrado nos cenários medidos.

O fluxo empresarial ainda inclui a revalidação de sessão e assinaturas repetidas registradas na 045. **UX-002 continua adiado**, sem alteração de AuthProvider/revalidação. A 046 não é apresentada como eliminação global de requests duplicadas.

Os campos de disponibilidade foram agregados ao `central_context` e ao retorno já existente do consumidor; a ficha recebe a presença já carregada na Central. Não foi acrescentado polling ou chamada HTTP por integrante. A tela de consumo reutiliza a consulta da 045. Os demais ganhos de PERF-001–013 e a navegação UX-001 mantêm sua implementação, com regressão e integridade documentadas no relatório.

Para reproduzir, gere um build separado da demo com `VITE_SUPABASE_URL`, `VITE_ATTACHMENT_GATEWAY_URL` e `VITE_PLATFORM_API_URL` apontando para `http://127.0.0.1:54321`, a chave fictícia da fixture, `VITE_LOCAL_DEMO=true` e `VITE_TURNSTILE_SITE_KEY` vazio. Use `vite build --outDir dist-flexible-demo`, depois `AUDIT_DIST=dist-flexible-demo FOUNDATION_CHROMIUM_PATH=<chromium> node scripts/ux001/run-local.mjs scripts/ux001/perf-preservation.mjs flexible-support-perf`. Não conecte essa demo ao banco real.
