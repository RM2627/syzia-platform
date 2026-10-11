# SYZIA 049 — Manifesto

Pacote completo de sobreposição: `SYZIA-049-ATUALIZACAO-SOBRE-048.zip`. Caminhos relativos à raiz de foundation, sem diretório externo adicional. Nenhuma exclusão de código da 048 é necessária. Arquivos obsoletos a remover manualmente: **nenhum**.

Base 048: 12,950,838 bytes compactados; SHA-256 `2d42acda663098d444d9c00231ee810e2ac1f8fb2236ea036cd71a01c88eebd8`. A nova base fica em aproximadamente 13,4 MB (12,8 MiB), com 834 arquivos e 45 migrations. O tamanho final exato e hash do ZIP constam no manifesto de validação do pacote de evidências.

## Preservado

Código completo de frontend/backend; entrada única; package.json/lockfile; configurações e exemplos sem segredos; public/assets; scripts/testes/fixtures do gate; documentação operacional e contratos. Todas as **44 migrations históricas até 048** permanecem byte a byte; a 049 é o 45º arquivo da cadeia (a numeração histórica tem suas próprias lacunas, que não foram alteradas). Inclui integralmente 045, 046, 047 e 048. Core Mercado Pago 047 e servidor unificado preservados por hash.

`reports/` principal conserva somente as entradas necessárias já documentadas em `reports/README.md`. Resultados novos são regenerados pelo gate e entregues separadamente. Não foram eliminados testes ou fixtures necessários.

## Fora da base principal

node_modules, dist, caches, logs/traces/screenshots/resultados de execução, ZIPs antigos, backups, dumps, `.env`, `.env.server`, `.env.server.backup`, credenciais e mapping local. Como o ponto de partida já era a 048 limpa, não houve nova remoção de arquivos necessários ou limpeza de migrations. Dependências e saídas continuam reproduzíveis por npm ci/build/gate.

## Inventário de alterações

| Arquivo | Tipo | SHA-256 de código/entrada |
| --- | --- | --- |
| `AGENTS.md` | Alterado | 709dbfb95705c55199d6e51e7bc65a5334b20003e3a49c024d8da7a9da39f799 |
| `README.md` | Alterado | 2d0d716f26f0381c28635cc658395dddec9e9bd718a2c28a495314e3cdecb1de |
| `SYZIA-049-INSTALACAO.md` | Novo | documento final (sem hash recursivo) |
| `SYZIA-049-MANIFESTO.md` | Novo | documento final (sem hash recursivo) |
| `SYZIA-049-RELATORIO-CHAT.md` | Novo | documento final (sem hash recursivo) |
| `SYZIA-049-RELATORIO-DOCUMENTOS-E-ANEXOS.md` | Novo | documento final (sem hash recursivo) |
| `SYZIA-049-RELATORIO-FINANCEIRO.md` | Novo | documento final (sem hash recursivo) |
| `SYZIA-049-RELATORIO-OPERACAO.md` | Novo | documento final (sem hash recursivo) |
| `SYZIA-049-RELATORIO-SEGURANCA-CADASTRO.md` | Novo | documento final (sem hash recursivo) |
| `SYZIA-049-RELATORIO-TESTES.md` | Novo | documento final (sem hash recursivo) |
| `SYZIA-049-RELATORIO-UX.md` | Novo | documento final (sem hash recursivo) |
| `SYZIA-049-RESUMO-FINAL.md` | Novo | documento final (sem hash recursivo) |
| `docs/syzia-049/lockfile-sha256.txt` | Novo | d082a5d42233aafbd0122340741eb84f91e9dc493aa3a8fe7df4d683206de800 |
| `docs/syzia-049/preserved-048-sha256.json` | Novo | ad61493999dfd3c51fa8e812ab6fc5c201576110d2787a4ac7ae24d124d4b0dd |
| `docs/syzia-049/request.md` | Novo | 3a081766a5ef477349ed0b2fd8dad53db39df306799ab0decc572dc49ea8941d |
| `docs/testing/current-regression-gate.md` | Alterado | c4e748dd0fbec02871e4b668e632fcd659342bbe30e7dd21a6b4f303d48b1897 |
| `package-lock.json` | Alterado | e3e752f6ceef24fb9b10f05e1b8b2cf7ab46adf3dbb4618169f398bc0bc86db3 |
| `package.json` | Alterado | bcf4869f9bdc45f66117bb2a99ae46f10590ec06fb0129ebaf1ff03dc96b3820 |
| `playwright.syzia049.config.ts` | Novo | e402a5b10319b8f2d300b5702ab065865c1f83728a809c6d0dc15128ace07901 |
| `public/fonts/DejaVu-LICENSE.txt` | Novo | 63d3ba759d12804c5b31a9d5940d855c1820d1f5999e6b0872eb1c7ff045fbc9 |
| `public/fonts/DejaVuSans.ttf` | Novo | ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280 |
| `scripts/dev-consumer-demo.mjs` | Alterado | 299e4068b5f4d5fc4378580572fafb6db79d160f37f284e441063681dba9eef8 |
| `scripts/syzia-044/current-gate.mjs` | Alterado | 75c8732fa8d9b0a1eb89d2fa78a8e902d6c6fb05fc960693a4d73a2cb3d4a82d |
| `scripts/syzia-048/fixture.mjs` | Alterado | 586dd51a5d7191f1d767871ce2ab2a643a439b0dfbc3a48ebd27fbeb96c59251 |
| `scripts/syzia-049/billing-isolated.mjs` | Novo | 6cc767122e5d485e9fa1fc78773eafee8ca64b3eac1e56c110e2d12bf8aeb4e0 |
| `scripts/syzia-049/browser.mjs` | Novo | f88e85bf8a3eadf7788014c816e8dbe6ef1966be3e85934cba42eb023e1512d7 |
| `scripts/syzia-049/fixture.mjs` | Novo | ff49a8e05057e6581b03893c10887f51b08da2645254a6535981bd885e7675b1 |
| `server/enterprise-access.mjs` | Alterado | 38024ca304eb09a1e5f3cc36eb926f46ab43f48b9b029be595c5015cb2978ae5 |
| `src/acquisition/PublicSite.tsx` | Alterado | 7a1d580da963fffc5d2e04d5eb6450ffac483e6727baf33cce05ba44231a0eda |
| `src/billing/plan-copy.ts` | Novo | 601a64f350995e3158d8707d88d6581132569fc7c55fd9309c6eac73388faf1f |
| `src/central/Central.tsx` | Alterado | d38476c264b8b7e67f70cb9623c9ba970a473a7cb105d83296a8301c11105218 |
| `src/central/ConsumerChat.tsx` | Alterado | 0bd76edd6409908dac6d4c3b9067efe1124b19af6bc357f63aeb30125b3e2d98 |
| `src/central/MessageThread.tsx` | Novo | c3a1c0b5464953677d730039bb5a6921595cfffadc1eae430759ce18fe1f9543 |
| `src/central/message-thread.css` | Novo | 5647f9f3554f5c45c7d7d790f9bfc2b24c5bbfb1a128ffe3579031e86d3af799 |
| `src/consumer/Consumer.tsx` | Alterado | b395e8954b35c02e60520bd753aac02f67cb3596e4f13b7d3dea555ddfb8351c |
| `src/consumer/Journey.tsx` | Alterado | 88b1ce533b8592bce7f9c5ebb3cc284918a8127ac44bce6aa90eeb59fc0e15a7 |
| `src/consumer/PhoneField.tsx` | Novo | 2b35e457142977438ea4f380d50596f61811d9d04bf7bc7c57d2d7e077e80da4 |
| `src/consumer/phone.ts` | Novo | 57cd91624680fd2c4e79da2b669658c083ecf21a00b68c47e4d92ccdd96924a0 |
| `src/documents/DocumentButton.tsx` | Novo | d17e2788096ffca1f3fb3d952e9216d23699cfdbf2a0c09ecc5f781ff836fe3c |
| `src/documents/render.ts` | Novo | 982b032637d4f6cf4effc8b4ef60e3d932fe09a528698fa5e51f179d2744c4da |
| `src/operations/BookingExtras.tsx` | Novo | 286eb823ad6d565a09722505093afd31c4aa1f6270b26792c170374c8561679f |
| `src/operations/Operations.tsx` | Alterado | 649a213045fd3ad506f3dc4ba20c1f885617d74cfff498487fc8b78fb677cc83 |
| `src/operations/booking-extras.css` | Novo | 02cb4ad766f0e53bf293380a61cfee302dcc0eb59b00d2c0bafdfc837f2134d5 |
| `src/ui/useVisiblePolling.ts` | Novo | 96655bf6be33b1660e0290a018d13a86dbd7a252b6e96eec984ab4e2f7e72c9f |
| `supabase/migrations/202610110049_customer_operation.sql` | Novo | 1dd93c64c4ddd7f45e397f96a68d8a0e125d0f095805fa02327c16225a97d34d |
| `tests/demo-browser/syzia-049.spec.ts` | Novo | 26be5de323456766c7a26f7d15984aee657e7cbfabecd89be5fdddbbcf658054 |
| `tests/support/current-db.mjs` | Alterado | ec7acd0a9ae794a2323242d97c4f3f843fad0f912a895c2407677b99864c7c1e |
| `tests/support/current-fixture.mjs` | Alterado | 1ab637f003914e7c8128644c5cef54d72e3c5cb2c68e5682a078ccca2541158b |
| `tests/syzia-048/integrity.test.mjs` | Alterado | f5f3f02b8f018b3c800359d7da6b1f9452198d0a283111a4288c36a19f986e23 |
| `tests/syzia-048/manual.test.mjs` | Alterado | 9645ac29d279e71a9678caac0dddee2beacc1a188b4813650cd2a0d8adc58ff6 |
| `tests/syzia-048/unified.test.mjs` | Alterado | a5c04c6cb6b42b02b25072ee918842ff2d884818a2a66ca2291dfd0f904123c2 |
| `tests/syzia-049/financial.test.mjs` | Novo | 68967c2f17918c133312305af9f7d96f7ee369e6419e6de1a852057b64e39ae7 |
| `tests/syzia-049/http.test.mjs` | Novo | f46779d6c481ed4f659add6f8ae885242b8087f4c6b6df19cc6a6ffc48eb4bb5 |
| `tests/syzia-049/integrity.test.mjs` | Novo | 3b38f9bc9a2d547eeff0f952a707531b937e1d35ecf4a00fb16ec6b4a472791e |
| `tests/syzia-049/operation.test.mjs` | Novo | 1ef2c73bdbc512b2bcc338e60024d593ea2de979bb3be3e1abb436f88588f823 |
| `tests/syzia-049/portable-child.mjs` | Novo | 2e9c31026c3e27e2838a3749c813c475b4c73457c4d5eef1ae61b16687428d50 |
| `tests/syzia-049/ui-utils.test.mjs` | Novo | 3e5daa186a469b839816593bf6c974b98b9227484d7ad07f30960aa7c3cba228 |
| `tests/syzia-049/upgrade.test.mjs` | Novo | 55a47b6f8bcf8fe3faee0cd5f9e0a72024d3199a626fb332bed917b204edd060 |

O inventário e as comparações usam a 048 fornecida, sem reconstrução de histórico. Os dez relatórios são disponibilizados individualmente e também incluídos no ZIP. Evidências contêm somente execução desta rodada e dados fictícios; não foi recopiado o acervo bruto 040–048.
