# Matriz — complemento jurídico 050

Resultados do pacote por sobreposição, em base extraída/copiada para diretório novo. PGlite usa SQL real com fixtures; Chromium usa a aplicação e RPCs de demo locais. Nenhum caso acessa Supabase real.

| Grupo | Casos | Resultado local |
|---|---:|---|
| L050-01–03 | Nova versão, histórico de conteúdo/aceites, reexecução e rollback conservador | 3 PASS |
| L050-04–05 | Falha após desmarcar vigência, rollback integral; versão ainda não publicada recusada | 2 PASS |
| L050-06–07 | Novo aceite material, identidade/data, idempotência, funcionário negado, isolamento A/B | 2 PASS |
| L050-08–10 | Leitura pública, writes negados, aceites privados, imutabilidade, rollback com aceite/versão posterior | 3 PASS |
| L050-11–12 | Hash incorreto, contrato alterado, grupo reutilizado, escaping SQL | 2 PASS |
| L050-13–14 | Configuração vazia/dados indevidos, preservação da redação, aprovação e hash exatos | 2 PASS |
| L050-T01–T05 | Privacidade, invalidar aprovação, CLI/paths/symlink/saída, locks, integridade do financeiro/migrations | 5 PASS |
| Jurídicos históricos | Quatro testes originais executados sem alterar casos, sobre a fixture atual | 4 PASS |
| L050-B01 | Textos gerados no banco local e leitura pública, links, sem overflow em 1440/390/320 px | 3 PASS |
| L050-B02 | Ativação, login, versão atualizada durante leitura, recarga, checkboxes limpos e aceite pela RPC em 1440/390 px | 2 PASS |
| L050-B03 | Texto histórico não é reescrito visualmente | 1 PASS |
| L050-N01 | Duas publicações em sessões PostgreSQL independentes: uma confirma e outra é recusada | BLOQUEADO pelo ambiente |
| L050-N02 | Aceite concorrente espera a publicação e recusa a versão anterior | BLOQUEADO pelo ambiente |
| L050-N03 | Aceite concorrente impede rollback | BLOQUEADO pelo ambiente |
| L050-N04 | Timeout de lock sem efeitos parciais | BLOQUEADO pelo ambiente |

Os quatro casos nativos não estão contados como PASS. O runner retorna código 2 e gera `reports/legal-050/native.json` com `executed=false`. O bloqueio ocorreu antes da inicialização do cluster, por limitação do contêiner ao mapear usuário não root (`EINVAL`). Não houve remoção dessa proteção para iniciar PostgreSQL como root.

O gate vigente conserva todas as 25 etapas anteriores e acrescenta três: `legal-versioning-050`, `legal-historical-050` e `browser-legal-050`. A concorrência nativa permanece um comando separado e explicitamente pendente. O resultado final de instalação, build, gate e integridade do pacote consta no relatório externo desta entrega.

## Validação final da sobreposição

- `npm ci`: PASS em extração nova (`validation-final`).
- `npm run build`: PASS, incluindo typecheck. Aviso preexistente de chunk PDF acima de 500 kB, sem alteração neste escopo.
- `npm run test:current-gate`: PASS, **28/28 etapas**. As 25 anteriores permanecem; três etapas jurídicas foram acrescentadas.
- Testes jurídicos focados: 19 PASS; regressões jurídicas históricas: 4 PASS; navegador jurídico: 6 PASS.
- Inspeção visual de cabeçalho/corpo/rodapé em desktop e celular: sem corte, sobreposição ou transbordamento, inclusive contatos longos.
- Integridade: 218 arquivos protegidos idênticos, incluindo os 18 arquivos de `server/`, HMAC, motor financeiro, 46 migrations e lockfile.
- Concorrência PostgreSQL nativa: BLOQUEADA pelo ambiente, 4 casos preparados e não executados. Não incluída no PASS do gate local.

A publicação jurídica permanece pendente de dados, avaliação e aprovação do proprietário. Nenhum documento foi publicado no ambiente real.
