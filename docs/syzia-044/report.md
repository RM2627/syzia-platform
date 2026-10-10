# SYZIA 044 — relatório técnico de entrega

**Resultado: AUD-001, AUD-002 e AUD-003 corrigidos e não reproduzíveis nos cenários locais; AUD-004 com gate cumulativo executado em PASS.**

Base exclusiva: SYZIA 042 consolidada e intacta, validada por CRC e manifesto, SHA-256 `48ee5b0340efbbaa47ac223b6e29416a07eb5231c0cb5ff02a24605c6be4c948`. A 043 foi utilizada somente como evidência de diagnóstico. Não houve conexão com ambiente real, reset, deploy, publicação ou saneamento de dados reais.

## O que mudou

| Achado | Antes | Depois |
|---|---|---|
| AUD-001 | Comando empresarial legado confirmava pedido público sob avaliação sem aprovação e avançava oportunidade | Aprovação válida exigida no comando, motor e gravação; causa específica; manual novo comprovado pelo comando servidor continua permitido; replay não duplica |
| AUD-002 | Nova janela reutilizava duração ocupada anterior apesar da mudança de buffer | Duração do serviço preservada; buffer vigente recompõe a ocupação; erro preserva reserva anterior; ficha mostra os três valores separadamente |
| AUD-003 | Parte 2 podia anteceder Parte 1 mantendo sua numeração | Remarcação isolada respeita vizinhas e orienta replanejamento; conjunto continua atômico e preserva substituídos |
| AUD-004 | Bateria antiga misturava contratos, loaders e seletores de várias versões | Gate oficial com etapas, logs, falha não-zero, reaproveitamento documentado e mapa de cada falha histórica |

Há uma única migration nova: `supabase/migrations/202609260044_approved_audit_corrections.sql`. Nenhuma migration 043 foi criada. Os relatórios separados `AUD-001.md` a `AUD-004.md` detalham causa, alteração, arquivos, testes e risco residual.

## Validação executada

Comando: `npm run test:current-gate`. Node 24.19.0, PGlite local 0.5.8, Playwright 1.63 / Chromium 153, React/TypeScript/Vite conforme lockfile da base. Todas as sete etapas terminaram com código zero. O relatório bruto é `reports/syzia-044/current-gate.json`.

| Camada | Casos PASS |
|---|---:|
| Focados 044 | 28 |
| Regressão 040 | 35 |
| Regressão 041 | 35 |
| Regressão 042 | 47 |
| Onboarding existente | 13 |
| Upgrade populado e rollback | 1 |
| Gateways/HTTP/utilitários | 62 |
| Contratos do gate | 3 |
| Cenários de navegador | 30 |
| Total de casos da execução | 254 |

O cenário composto de navegação inclui **82 verificações** de rotas/temas/perfis/desktop/celular; elas não foram somadas novamente ao total. Build/typecheck e inspeção de canário server-only passaram, contabilizados como etapa, não como casos adicionais. O gate também demonstrou falha controlada: filho com saída 42 produz runner com saída 1 e relatório FAIL separado — comportamento esperado, não falha de produto.

Asserções históricas reaproveitadas não foram editadas no arquivo original. Os ajustes de compatibilidade e a seleção de cenários substituídos estão explicitados em `docs/testing/current-regression-gate.md`. O mapa `history-current-map.md/json` cobre 105 registros FAIL da 043, incluindo três defeitos, e três bloqueios de preparação. Duplicações do log TAP são identificadas. Os resultados históricos não foram reclassificados.

**Integridade:** 2733 arquivos históricos de testes, migrations e reports preservados byte a byte. Nenhum arquivo da base foi removido. `package-lock.json`, marcas/assets, módulos e documentação histórica permanecem. Inventário completo: `docs/syzia-044/changed-files.json` e `inventory.md`; manifesto de todos os arquivos: `MANIFEST.json`.

**Upgrade populado:** comparação de 119 tabelas e 1.170 colunas anteriores, com todos os valores/linhas e segurança preservados. Falha injetada antes do COMMIT comprovou rollback da migration; aplicação posterior bem-sucedida. Reserva manual antiga de 75 minutos foi recuperada pelo hash original e remarcada para 75 + 30 = 105 minutos sem adivinhar duração.

## Evidências principais

- Antes: `before-043.json` e `before-order-043.json`, cópias identificadas da auditoria.
- Depois: `focused.json`, `upgrade.json`, `regression-040/041/042.json`, `browser.json` e logs das sete etapas.
- UI: `review-before-approval.png`, `order-protected.png`, `buffer-current.png` e capturas reutilizadas em `reports/syzia-044/`.
- Todos os 42 critérios obrigatórios têm correspondência em `docs/syzia-044/mandatory-cases.md`.

Erros de preparação/seletores dos testes novos encontrados durante desenvolvimento foram ajustados no harness novo. Dois testes de mídia também usavam o mesmo título fictício no banco compartilhado: a cópia temporária 034 agora recebe prefixo próprio, sem alterar asserções ou o arquivo histórico. A validação de ordem também foi antecipada no comando para responder com a causa de ordem quando houver concomitantemente indisponibilidade. A execução oficial acima foi realizada após esses ajustes. Logs preliminares permanecem identificáveis; somente o relatório oficial determina o resultado final.

## Limites e riscos residuais

Reservas legadas sem `service_minutes` e sem prova exata no comando original recebem `appointment_duration_unavailable` na remarcação isolada; a reserva não muda. A revisão deve usar o replanejamento existente. Não se deduz duração a partir do buffer atual. Representações temporais antigas incompatíveis podem exigir essa revisão. Reservas indevidas já existentes em ambiente externo não foram canceladas automaticamente.

A coluna gerada STORED pode exigir lock/regravação física durante a atualização; impacto em volume não foi medido. Não houve ampliação de RLS/FORCE RLS, grants, memberships ou autorização de clientes empresariais. Aprovação, reserva e conclusão não representam pagamento recebido.

**PENDENTE DE HOMOLOGAÇÃO EXTERNA:** Auth, SMTP, Storage/gateway, PostgREST/schema cache, concorrência PostgreSQL independente, backup/restauração, volume/performance e provider reais. PGlite/fixtures não equivalem a esses ambientes. Permanecem os limites de combinações exaustivas de UI e massa positiva A/B em toda tabela documentados na 043; não se afirma uma bateria final ampla.

## Entrega e parada

O ZIP consolidado contém projeto completo, migrations históricas e 044, lockfile, código, testes, documentação, relatórios, capturas e manifesto. Há também relatório, guia de upgrade, migration e ZIP de evidências separados para consulta. Seguir `upgrade.md` sem reset na futura atualização autorizada.

**PARAR após esta entrega.** Não foi iniciada 045, bateria final ampla, publicação, deploy, demo oficial ou vídeo. A próxima etapa depende de solicitação expressa do proprietário.
