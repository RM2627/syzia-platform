# Inventário de alterações — SYZIA 061

Origem: `6e9cacae053e964b063f0e533e0b752bdddaa869`. Não há remoção de arquivo da base oficial. Preservados os 1.240 arquivos originais, incluindo 56 migrations. Somente 16 arquivos existentes têm alteração autorizada; novos módulos e documentos são aditivos.

| Arquivo existente | Motivo |
|---|---|
| `.env.example` | Flag pública do Insights, desativada por padrão. |
| `.env.server.example` | Variáveis editoriais e ambiente financeiro, sem segredos. |
| `.gitignore` | Saídas locais e arquivos privados de configuração. |
| `scripts/dev-consumer-demo.mjs` | Atualiza o schema do fixture operacional local para testar a interface atual; mantém a trilha histórica comercial separada. |
| `package.json` | Comandos locais de teste, importação de rascunhos e preparação financeira. Sem dependência nova. |
| `server/unified.mjs` | Rotas do blog e encerramento do job no mesmo processo. |
| `server/billing/runtime.mjs` | Validação explícita de ambiente e gate de produção. |
| `server/billing/subscriptions.mjs` | Contexto de ambiente no banco; notificações desconhecidas não cruzam credenciais. |
| `server/commercial/configuration.mjs` | Whitelist dos novos campos de serviço nos snapshots existentes. |
| `src/FoundationApp.tsx` | Link/rota editorial dentro da administração existente. |
| `src/company/Company.tsx` | Configuração da quantidade do serviço. |
| `src/consumer/Consumer.tsx` | Seletor, resumo, duração manual e invalidação da escolha de horários após edição. |
| `src/consumer/api.ts` | Tipos dos metadados de quantidade. |
| `src/consumer/consumer.css` | Layout acessível dos controles de quantidade. |
| `src/consumer/request-items.ts` | Quantidade inicial e estimativa; payload legado preservado. |
| `src/operations/QuoteCalculator.tsx` | Duração total versus por unidade conforme política publicada. |

Novos grupos: `server/insights`, `src/insights`, `content/insights`, `tests/syzia-061`, `scripts/syzia-061`, `scripts/insights`, `scripts/billing-061`, `server/billing/production-plans.mjs`, exemplo de proxy `/blog` e `docs/syzia-061`. Novas migrations: 061 quantidade, 062 editorial, 063 ambiente financeiro.

`base-sha256.json` registra os hashes da origem antes das alterações. `authorized-hashes.json` registra hashes anteriores/novos e a lista textual explícita para finais de linha. A tolerância LF/CRLF é limitada a caminhos e hashes textuais explícitos derivados dos blobs oficiais, inclusive SQL; não normaliza conteúdo nem modifica arquivos. O ZIP preserva os bytes originais de todas as migrations históricas. O teste da 061 fixa independentemente os hashes desses manifests e inclui testes negativos. `SHA256-ARQUIVOS.json` na raiz do ZIP lista bytes entregues; seu próprio hash está coberto pelo hash do ZIP, evitando autorreferência.

A base não inclui dependências instaladas, dist, caches, resultados novos de navegador, traces ou ZIPs anteriores. Os logs que já eram versionados na base e eram abrangidos pelos controles históricos foram conservados; não houve limpeza destrutiva do inventário original. Resultados desta execução são entregues separadamente.
