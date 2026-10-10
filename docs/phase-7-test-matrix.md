# Matriz de testes locais — Fase 7

Resultado final: **431 casos únicos aprovados, zero falhas nas suítes concluídas**. Build, inventário, hashes e capturas são verificações complementares, não novos casos. Reexecuções não aumentam a contagem. PostgreSQL nativo bloqueado é pendência explícita, não PASS.

| Suíte/comando npm | Casos PASS | Ambiente/evidência em reports/ |
|---|---:|---|
| test (Fundação) | 68 | PGlite; security-results.json |
| test:company | 71 | PGlite; company-security-results.json |
| test:consumer | 35 | PGlite; consumer-results.json |
| test:presence-payments | 28 | PGlite; presence-payments-results.json |
| test:central | 40 | PGlite; central-results.json |
| test:commercial | 54 | PGlite; commercial-results.json |
| test:commercial-upgrade | 1 | PGlite; commercial-upgrade-results.json |
| test:analytics | 27 | PGlite; analytics-results.json |
| test:analytics-upgrade | 1 | PGlite; analytics-upgrade-results.json |
| test:homologation-tools | 10 | Node; phase-7-foundation-tools.txt |
| test:company-tools | 5 | Node; phase-7-company-tools.txt |
| test:consumer-tools | 7 | Node; phase-7-consumer-tools.txt |
| test:central-tools | 5 | Node; phase-7-central-tools.txt |
| test:commercial-tools | 5 | Node; phase-7-commercial-tools.txt |
| test:analytics-tools | 2 | Node; phase-7-analytics-tools-output.txt |
| test:images | 9 | Node/Sharp, imagens sintéticas; phase-7-images.txt |
| test:config | 3 | Node; phase-7-config.txt |
| test:demo | 1 | HTTP loopback/PGlite/Auth/Storage simulados; phase-7-demo-http.txt |
| test:ui | 52 | Chromium, transporte controlado; browser-results.json |
| test:demo:browser | 7 | Chromium/HTTP loopback sem interceptação de RPC; demo-browser-results.json |
| **Total** | **431** | 391 da base + 40 novos |

## Cobertura específica de Analytics

Os 27 casos SQL registram individualmente: A/B sem PII; anon, consumidor, colaborador e atendente recusados em métricas comerciais; serviço B em consulta A; administração B; escopo operacional; revogação de vínculo/membro/papel; suspensão de perfil/empresa; superadmin; datas inválidas/vazio; limites no timezone Recife e preservação da constraint; filtros de serviço/origem, incluindo não informada; revisões finais; aprovação idempotente sem receita; SLA vazio e fila separada; primeira resposta/SLA; tentativa→conversão; perda; FORCE RLS e escrita direta recusada.

Upgrade 016→017 compara registros e históricos antes/depois. Ferramentas externas sem configuração/modo válido encerram antes de conectar. Três casos UI novos verificam revogação com página aberta, vazio/erro sem dados antigos e troca de URL entre organizações. Sete testes demo verificam público A/B nos três tamanhos, envio de solicitação, métricas/filtros, plataforma/escopo operacional e áreas autenticadas.

## Verificações complementares

- `npm ci`: dependências reinstaladas a partir do lockfile neste ambiente Linux/Node 24.
- `npm run build`: TypeScript/Vite aprovados; aviso conhecido de chunk principal ~504 kB, sem erro de compilação.
- `npm run check:bundle`: marcador fictício exclusivo do servidor não aparece nos arquivos distribuíveis; `phase-7-bundle-scan.json`.
- `node scripts/analytics-inventory.mjs`: 55 tabelas FORCE RLS, 55 policies e objetos 017; `phase-7-sql-catalog.json`.
- Integridade 001–016: idênticas ao arquivo aprovado Fase 6; `phase-7-migration-integrity.json`.
- Inspeção visual de capturas desktop 1440, tablet 820 e celular 390; 15 PNGs em visual-phase7. Sem overflow nos cenários automatizados.
- `npm run test:native`: **NÃO EXECUTADO** o teste de concorrência; bootstrap indisponível por restrição de usuário não-root. Saída 2 em `phase-7-native.txt`. Não relaxadas permissões para contornar a restrição.
- Pacote completo: ZIP verificado e hashes de MANIFEST.json comparados a cada arquivo empacotado.

## Limites do resultado

PASS local não significa homologação Supabase. Claims, e-mail, sessões e Storage da demo são simulados. PGlite não comprova conexões independentes concorrentes. As verificações reais de Auth/SMTP/PostgREST/RLS/Storage/JWT/expiração/revogação/concorrência/backup/performance permanecem **PENDENTES DE HOMOLOGAÇÃO EXTERNA**, com roteiro em phase-7-homologation.md. Nenhum teste remoto foi executado nesta fase. Safari, Firefox, hardware móvel, Windows e auditoria assistiva completa não foram validados.
