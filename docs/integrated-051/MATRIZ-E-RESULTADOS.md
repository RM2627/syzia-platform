# Matriz e resultados — complemento integrado 051

## Ambiente e referência

Linux, Node.js 24.19.0, npm/lockfile da base, PostgreSQL local via PGlite e Chromium headless. SDK do Mercado Pago e transporte HTTP simulados. Nenhuma credencial real. A aplicação foi montada em diretório novo pela extração da base anterior seguida do ZIP incremental; `npm ci` foi executado nessa extração.

A base de conteúdo anterior tem 940 arquivos inventariados. O preflight verifica 954 arquivos de aplicação/teste/documentação e recusa sobreposição de conteúdo divergente. Os arquivos do próprio verificador, manifesto e resultados finais também constam no inventário/checksums do pacote, sem criar hash autorreferente. O commit `6c33be2` não foi comprovado; uso da última base entregue foi expressamente autorizado.

## Cobertura

| Grupo | Casos | Evidência e invariantes |
|---|---:|---|
| 051 anterior | 39 | E-mail pagador separado, diagnóstico HTTP, rejeição definitiva, timeout, duas abas, contrato/reserva, HMAC, versão fora de ordem, segurança do formulário, integridade e upgrade 051 |
| INT-A | 11 | CPF digitado não basta; revisão simples somente superadmin e confirmação explícita; todas as evidências exigidas; prova sem concessão de acesso; trial após confirmação oficial; duas abas; cartão/e-mail/plano/cancelamento não reiniciam; outra empresa; RLS; política manual, conflito e telefone |
| INT-B | 18 | Vinculação seguida de mismatch simulado; recuperação do mesmo recurso; ID, referência, vendedor, aplicação, plano, pagador, recorrência, moeda, valor, status, duração, datas e primeira cobrança divergentes; pagamento de outro pagador; busca vazia/múltipla; timeout; contador de reconciliação |
| INT-D | 7 | Cobrança recusada e tolerância; histórico A/B; PUT recusado e nova tentativa; PUT confirmado; pagamento recuperado por evento idempotente; timeout após PUT; cartão ainda igual mantém incerteza; nenhuma nova assinatura, cobrança ou trial; autorização antes de mutação |
| INT-M | 5 | Upgrade populado; falha e rollback transacional; permissões das funções antigas revogadas; rollback antes de uso; contrato histórico reservado e prova posterior; rollback destrutivo pós-uso recusado; reaplicação recusada |
| INT-I | 3 | Mudanças reais em código recusadas mesmo com LF/CRLF; lista de autorização adulterada recusada; CSS e resumo aprovados preservados |
| LF/CRLF anterior | 8 | Textos autorizados, binários exatos, BOM/Unicode/bytes inválidos/CR solitário, whitespace, SQL/RLS, configurações e hashes falsos |
| Checkout navegador | 21 | 14 casos anteriores + 7 novos: 1440/768/390/320px, foco/contraste/overflow, e-mail, uma ação, processamento, falha/token ausente, CTA sem novo trial, cartão/histórico em desktop/mobile e verificação simples do superadmin |
| Billing navegador anterior | 1 | Três ofertas, retorno sem concessão, primeira rejeição e retry no mesmo contrato, sete dias, cancelamento e reativação |
| Trial administrativo legado, fora do gate | 2 | Execução suplementar NÃO aprovada: jornada histórica pressupõe navegação/ativação/revisão de versões antigas. Não altera o resultado do gate vigente; pendência registrada |

As 44 verificações novas de backend/integridade estão importadas na suíte financeira vigente: `npm run test:051` passa a executar 83 casos. As 30 etapas do gate foram mantidas; nenhuma foi removida ou marcada como skip. Testes de 15 dias pertencem exclusivamente à demo histórica fictícia e não alteram o trial comercial de sete dias.

## Resultados finais

| Execução sobre extração limpa | Resultado |
|---|---|
| Preflight da base anterior | PASS — 940 arquivos idênticos, 14 novos corretamente ausentes |
| Preflight após sobreposição | PASS — 954 arquivos idênticos |
| `npm ci --no-audit --no-fund` | PASS |
| `npm run build` | PASS — typecheck e bundle; aviso de tamanho de chunk preexistente |
| `npm run test:051` | PASS — 83/83, nenhum skip |
| `node --test tests/integrity-eol.test.mjs` | PASS — 8/8 |
| Extração adicional com 836 textos convertidos para LF | PASS — preflight por equivalência comprovada, 83/83 e 8/8 |
| `npm run test:current-gate` | PASS — 30/30 etapas, nenhuma etapa omitida |

A conversão para LF foi aplicada somente aos textos expressamente enumerados no manifesto. Binários permaneceram byte a byte. Essa prova é local e não equivale a um clone do commit remoto nem a execução nativa Windows.

Gate final: `2026-10-14T15:50:50.268Z` a `2026-10-14T16:05:58.270Z`. Resultado bruto em `gate-final.json`; logs em `resultados/`.

| Etapa | Suíte | Resultado | Tempo |
|---:|---|---|---:|
| 1 | `checkout-financial-051` | PASS | 34.7 s |
| 2 | `legal-versioning-050` | PASS | 6.4 s |
| 3 | `legal-historical-050` | PASS | 4.8 s |
| 4 | `hotfix-050` | PASS | 14.9 s |
| 5 | `hotfix-049` | PASS | 6.7 s |
| 6 | `focused-049` | PASS | 19.7 s |
| 7 | `focused-048` | PASS | 14.0 s |
| 8 | `billing-047` | PASS | 22.3 s |
| 9 | `gate-contracts` | PASS | 0.6 s |
| 10 | `flexible-upgrade` | PASS | 4.9 s |
| 11 | `flexible-support` | PASS | 8.2 s |
| 12 | `team-upgrade` | PASS | 4.3 s |
| 13 | `team-availability` | PASS | 8.8 s |
| 14 | `ux001-security` | PASS | 4.8 s |
| 15 | `focused` | PASS | 9.2 s |
| 16 | `upgrade` | PASS | 5.0 s |
| 17 | `regression-040-042` | PASS | 29.2 s |
| 18 | `gateways` | PASS | 0.5 s |
| 19 | `build` | PASS | 1.5 s |
| 20 | `browser` | PASS | 302.2 s |
| 21 | `team-browser` | PASS | 38.4 s |
| 22 | `ux001-browser` | PASS | 72.1 s |
| 23 | `browser-hotfix-049` | PASS | 39.2 s |
| 24 | `browser-049` | PASS | 29.9 s |
| 25 | `browser-048` | PASS | 17.7 s |
| 26 | `billing-browser` | PASS | 12.9 s |
| 27 | `flexible-browser` | PASS | 70.1 s |
| 28 | `checkout-browser-051` | PASS | 95.1 s |
| 29 | `browser-legal-050` | PASS | 17.1 s |
| 30 | `browser-hotfix-050` | PASS | 12.6 s |

## Falhas intermediárias corrigidas

- O fixture de prova passou a registrar verificação fictícia explícita, preservando a rejeição de CPF autodeclarado.
- Grupos novos de testes passaram a inicializar/fechar seus bancos em hooks próprios, evitando fechamento prematuro quando importados pelo gate.
- O cenário antigo de expiração avançava apenas a data local; foi atualizado para avançar coerentemente os dois lados fictícios. O teste negativo de mudança unilateral permanece.
- A contagem antiga de migrations não previa 052. Ela foi substituída por igualdade da lista completa de nomes esperados, preservando hashes históricos.
- O teste administrativo legado, fora do gate vigente, ainda pressupõe ativação por código de empresa, login automático, destino antigo e solicitação manual de trial que não corresponde ao onboarding atual. Sua execução suplementar falhou; tentativas de adaptar toda essa jornada foram descartadas para não ampliar o escopo. Ficaram somente os seletores da revisão de identidade simplificada, sem remover seus asserts ou reabrir Auth/trial histórico. Não foi declarado PASS para esse teste. Os testes atuais de revisão simples em desktop/mobile e de autorização/auditoria INT-A passaram.
- Uma geração intermediária do helper de integridade duplicou uma declaração; foi corrigida antes da validação do pacote final. Não houve alteração de aplicação decorrente disso.

## Limites da evidência

PGlite serializa as transações do fixture; concorrência de comandos HTTP/abas e leases é testada, mas não substitui disputa de locks em PostgreSQL distribuído real. Não foi executado Windows nativo nem clone do commit remoto indisponível. A compatibilidade LF/CRLF é exercitada por equivalência comprovada e testes negativos. Resultados reais de Mercado Pago, MP-01, assinatura bloqueada e cartão continuam pendentes de homologação externa. Não se usa PASS local para declarar pagamento real aprovado.

O gate regenera dois PDFs de demonstração em `reports/syzia-049/documents/`. Depois da execução, somente esses dois resultados reproduzíveis são restaurados byte a byte da base de referência antes do postflight e da embalagem; os testes e suas verificações não são alterados. Nenhum PDF regenerado integra o complemento.

O pacote contém apenas resultados textuais sanitizados desta rodada. Screenshots, traces, cartão de teste preenchido e resultados históricos 040–050 não foram copiados para a entrega.
