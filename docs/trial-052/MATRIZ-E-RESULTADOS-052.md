# Matriz e resultados — SYZIA 052

Validação final local sobre uma extração nova do candidato consolidado da última base entregue. Ambiente: Linux, Node v24.19.0, PGlite, fixtures HTTP e Chromium local. Execução final do gate: 2026-10-15T00:03:18.249Z a 2026-10-15T00:18:15.544Z. Não houve execução no Mercado Pago, Render ou Supabase reais.

## Resultado geral

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Instalação a partir do lockfile, `npm ci` | PASS | `resultados/clean-npm-ci.log` |
| Build e typecheck, `npm run build` | PASS | `resultados/clean-build.log` |
| Suíte ampliada `npm run test:051` | 134/134; 0 falhas, 0 skips | `resultados/clean-focused.log` |
| Novos casos da 052, incluídos na suíte acima | 51/51 | Casos `052-` em `clean-focused.log` |
| Integridade LF/CRLF | 8/8 | `resultados/clean-eol.log` |
| Mesma suíte 051 em cópia com arquivos textuais LF | 134/134 | `resultados/lf-focused.log` |
| Testes de integridade na cópia LF | 8/8 | `resultados/lf-eol.log` |
| Preflight com 834 arquivos convertidos para LF | PASS; nenhuma divergência de conteúdo | `resultados/lf-negative-validation.json` |
| Adulterações controladas de código, SQL, configuração, binário e manifesto | 8/8 rejeitadas | Mesmo arquivo |
| Checkout no navegador, incluindo desktop e mobile | 25/25; 4 casos novos | `resultados/gate-checkout-browser-051.log` |
| Gate completo `npm run test:current-gate` | 30/30 etapas PASS; nenhuma etapa omitida | `GATE-FINAL-052.json` |
| 48 migrations históricas até 052 | Bytes preservados | `migrations-001-052-sha256.json` |

Não somar os resultados sobrepostos como se fossem testes independentes: o gate executa novamente as suítes focadas e de navegador. O build mantém o aviso preexistente de chunk maior que 500 kB; não houve alteração de bundling fora do escopo. A jornada histórica de navegador 042 também emitiu quatro avisos React de chave duplicada, os mesmos quatro presentes no log da base anterior entregue; as asserções dessa jornada passaram. O módulo correspondente não foi alterado nesta rodada.

## Trecho financeiro efetivamente aplicado

Antes, em `verifiedSnapshot`:

```js
bindingCheck(Number.isSafeInteger(p.version) && p.version >= 0, "version");
```

Depois, o validador chama a função abaixo e inclui `version` no snapshot somente quando o retorno não é `undefined`:

```js
export function providerVersion(p) {
  if (!Object.hasOwn(p, "version")) return undefined;
  bindingCheck(Number.isSafeInteger(p.version) && p.version >= 0, "version");
  return p.version;
}
```

Ausência não é convertida em zero. A prova local de recuperação do contrato histórico está no caso `052-M03`; outra divergência financeira continua impedindo a liberação.

## Cobertura dos requisitos

| Requisito | Casos / evidência | Resultado |
| --- | --- | --- |
| CPF com máscara/sem máscara; dois dígitos, repetição e caracteres inválidos | 12 casos `052-CPF`; teste de decisão equivalente JS/SQL | PASS |
| Primeiro trial sem fila manual, telefone ou prova documental universal | `052-A01`, `052-A02` | PASS |
| CPF estrutural histórico da 040 sem redigitação ou prova fictícia | `052-M05` | PASS |
| Rascunho antigo reavaliado sem reescrever submissão | `052-A old self-service review` | PASS |
| Negativa anterior, conflito e falta de cadastro válido não liberam automaticamente | `052-A exceptional conflict or denial` | PASS |
| Duas abas, reserva única e sete dias sem duplicação | `052-A02`; regressões de concorrência 047/051 | PASS em simulação |
| Histórico do responsável em outra empresa, permissões, tenant e RLS/FORCE RLS | `052-A04`, `052-A05`; regressões existentes | PASS |
| `version` ausente, zero e inteiro positivo | Casos `052-V absent/zero/positive` | PASS |
| Null explícito, string, negativo, fração, unsafe, undefined próprio, NaN e infinito | Casos `052-V` negativos | PASS: bloqueados |
| Ausência de contador não dispensa vendedor, aplicação, pagador, plano, referência, moeda, preço, recorrência, trial, primeira cobrança ou status | 11 casos `052-V absent does not bypass` | PASS: bloqueados |
| Snapshot antigo/contraditório e lease inválido | Casos finais `052-V` | PASS: sem escrita no provedor |
| Troca de cartão sem contador, confirmação por PUT+GET, timeout e recuperação sem reenvio | `052-C01` a `052-C03` + regressões `INT-D` | PASS |
| Mesmo contrato histórico, mesmo vínculo externo e datas; reconciliação repetida GET-only | `052-M03` | PASS: sem novo POST |
| Falha transacional, upgrade populado, rollback pré-uso, repetição e rollback pós-uso recusados | `052-M01`, `052-M02`, `052-M04` | PASS |
| Logs/auditoria sem documento, e-mail completo ou tokens | `052-A05` + casos de diagnóstico 051 | PASS com dados fictícios |
| Botão único, e-mail pagador independente, cartão e estados claros | 25 casos de checkout; quatro larguras, incluindo 320/390 px | PASS |
| Interface de CPF inválido e assinatura em conferência sem checkout novo | Quatro novos casos desktop/mobile | PASS |
| Jurídico, Anexos, backend único, Manual opcional, Agenda, Equipe, UX-001 e demais regressões | Gate vigente abaixo | PASS |

A inspeção visual local do resumo de checkout foi realizada em desktop e celular; não houve alteração do CSS aprovado. Screenshots, dados de cartão e traces não integram a entrega.

## Etapas do gate final

| # | Etapa | Resultado | Duração |
| --- | --- | --- | --- |
| 01 | `checkout-financial-051` | PASS | 41.6 s |
| 02 | `legal-versioning-050` | PASS | 4.7 s |
| 03 | `legal-historical-050` | PASS | 3.8 s |
| 04 | `hotfix-050` | PASS | 14.0 s |
| 05 | `hotfix-049` | PASS | 5.9 s |
| 06 | `focused-049` | PASS | 17.6 s |
| 07 | `focused-048` | PASS | 12.0 s |
| 08 | `billing-047` | PASS | 19.5 s |
| 09 | `gate-contracts` | PASS | 0.5 s |
| 10 | `flexible-upgrade` | PASS | 4.1 s |
| 11 | `flexible-support` | PASS | 7.1 s |
| 12 | `team-upgrade` | PASS | 3.8 s |
| 13 | `team-availability` | PASS | 7.4 s |
| 14 | `ux001-security` | PASS | 4.1 s |
| 15 | `focused` | PASS | 7.4 s |
| 16 | `upgrade` | PASS | 4.3 s |
| 17 | `regression-040-042` | PASS | 25.6 s |
| 18 | `gateways` | PASS | 0.5 s |
| 19 | `build` | PASS | 1.2 s |
| 20 | `browser` | PASS | 298.0 s |
| 21 | `team-browser` | PASS | 37.3 s |
| 22 | `ux001-browser` | PASS | 71.9 s |
| 23 | `browser-hotfix-049` | PASS | 38.1 s |
| 24 | `browser-049` | PASS | 30.4 s |
| 25 | `browser-048` | PASS | 17.2 s |
| 26 | `billing-browser` | PASS | 13.1 s |
| 27 | `flexible-browser` | PASS | 70.2 s |
| 28 | `checkout-browser-051` | PASS | 108.1 s |
| 29 | `browser-legal-050` | PASS | 16.5 s |
| 30 | `browser-hotfix-050` | PASS | 11.6 s |

## Falhas encontradas e tratadas durante a validação

Uma execução preliminar foi interrompida após erro do processo de execução (`fatal library error, lookup self`); não foi contabilizada como aprovação. Outra execução parcial identificou `billing_stale_snapshot` no cenário 047-16: o fixture avançava o período fictício alterando datas, mas mantinha os marcadores da assinatura anterior. O teste foi corrigido para avançar também `version` e `last_modified` na simulação. Suas asserções de cancelamento, não renovação e impossibilidade de novo trial foram preservadas; nenhuma proteção de produção foi removida. A execução final acima repetiu todas as 30 etapas.

Os testes históricos da política anterior usam explicitamente a migration 052. Os testes financeiros atuais exercitam a 053. Isso preserva o contrato histórico sem exigir que a política antiga de prova documental continue sendo a regra comercial aprovada nesta rodada.

## Limites e homologação

A aprovação é local. Os fixtures serializam transações SQL curtas e simulam respostas do Mercado Pago; não demonstram concorrência PostgreSQL nativa nem a recuperação da assinatura real. Windows nativo não foi executado; LF/CRLF foi validado localmente. MP-01 continua pendente. A ausência real de `version` é evidência fornecida pelo proprietário, não uma consulta autenticada desta rodada.

Após aplicação coordenada autorizada, conferir o mesmo contrato e assinatura com as demais validações financeiras. Não reiniciar o trial, não criar outra assinatura e não alterar registros manualmente. Ver `PENDENCIAS-EXTERNAS-052.md` e `GUIA-APLICACAO-E-ROLLBACK-052.md`.
