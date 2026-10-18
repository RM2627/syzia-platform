# Matriz de testes — comercial 054

Os testes abaixo usam dados fictícios, PGlite com as migrations reais, requisições HTTP locais e transportes injetados. O SQL é real; a evidência não representa execução no Supabase publicado ou concorrência entre conexões de PostgreSQL nativo.

| Grupo | Casos e garantias | Evidência | Resultado |
|---|---|---|---|
| CRM e autorização | C01–C22: upgrade populado, cadastro, Instagram/WhatsApp, grants globais, carteira A/B, tenant recusado, operador suspenso, revisão, idempotência, histórico, consentimento por finalidade, troca de e-mail, supressão, RLS/FORCE e rollback | `preparation.test.mjs` | PASS |
| Templates | T01–T05: rascunho/publicação distintos, template inválido, revisão vencida, isolamento, wrappers antigos sem bypass e publicação pelo fluxo existente | `preparation.test.mjs` | PASS |
| Links e origens | D01–D07 e variações: slug, domínio planejado, loopback configurável, URL inválida, HTTPS, origens diferentes e igualdade exata | `links.test.mjs` | PASS |
| Banco demonstrativo | D01–D05: bootstrap exclusivo, editor real, mudanças reais de serviço/horário, snapshot permitido, invalidação de geração e dois visitantes isolados | `demos.test.mjs` | PASS em PGlite |
| Jornada direta | D06–D10: recusa de RPC global/financeiro/outro tenant; cliente aceita serviço pelo SQL real e empresa encontra o mesmo UUID; limite de equipe; nenhum contrato/fatura/trial; sessão encerrada | `demos.test.mjs` | PASS em PGlite |
| Imagens | D02b e X02: sanitizador original, remoção de metadados, upload/download, autorização, promoção aprovada com MIME/hash, rejeição de conflito e dados indevidos | `demos.test.mjs`, `transport.test.mjs` | PASS |
| Envios | M01–M07: sem autorização não envia; links individuais, prévia e confirmação, seleção adulterada recusada, duas abas/uma chamada SMTP, limite, duplicação, tenant recusado, timeout incerto e descadastramento | `control.test.mjs` | PASS, SMTP simulado |
| Ativação | A01–A09: nenhum tenant ao preparar; link não é propriedade; só Super Admin revisa; decisões auditadas; configuração/identidade/plano/aceite; uma organização restrita; vínculo A/B; rollback; revogação e snapshot alterado | `control.test.mjs` | PASS em PGlite |
| Financeiro preservado | A06b–A06c: checkout existente com fake gateway, confirmação necessária, importação não concede trial, catálogo só depois de confirmação, indicadores seguem contrato local e não podem ser forjados manualmente | `control.test.mjs` | PASS, provedor simulado |
| HTTP e e-mail | H01–H04/E01–E03/X01: CORS, body/métodos, rate limit, erro sem dados brutos, flags desligadas, infraestrutura SMTP existente, HTML escapado/CID, criptografia autenticada, whitelist da configuração | `transport.test.mjs` | PASS |
| UI contratual | UI01–UI04: visibilidade por identidade/grant, estados derivados fora do seletor manual, alpha real nas seis imagens R2, templates reutilizam página e regras | `ui-contracts.test.mjs` | PASS; não é teste visual |
| Migração | Falha DDL reverte tabelas/grants/alteração de telefone; histórico populado permanece | `rollback.test.mjs` + C01 | PASS |
| Integridade | I054-01–04: todos os 1.090 arquivos originais, 49 migrations intactas, camada adicional com predecessores exatos, LF/CRLF somente textual, alteração real/binária/financeira recusada | `integrity.test.mjs` | PASS |
| Operação com 054 | Suite operacional 044 original executada após upgrade 054: agendamentos, continuidade, disponibilidade, equipe/grants e segurança | `regression-local.mjs` | PASS |
| Sobreposição | Verify, Apply, reaplicação idempotente, edição não autorizada recusada, symlink recusado, CRLF equivalente, rollback e restauração byte a byte de 1.090 arquivos | `package-integration-tests.json` | PASS em diretório temporário Linux |
| Instalação/build | Instalação limpa a partir do lockfile e build/typecheck na base montada pelo incremento | `npm-ci-package.log`, `build-package.log` | PASS |
| Navegador | Desktop/mobile, teclado, foco, overflow, experiência ponta a ponta de cada nova tela | `HOMOLOGACAO-PENDENTE.md` | NÃO EXECUTADO |
| PostgreSQL nativo | Pool real, contenção, concorrência entre conexões e reinício do worker | `native.log` | BLOQUEADO pelo ambiente |
| Windows/PowerShell | Wrapper e integração no sistema do proprietário | Guia de integração | NÃO EXECUTADO nesta rodada |
| Serviços externos | SMTP real, DNS, HTTPS, MP, banco operacional, publicação | Nenhuma mutação autorizada | NÃO EXECUTADO |

Total da suite focada 054: **116 testes, 116 PASS, zero falhas** na execução final registrada. Consulte `RELATORIO-TESTES.md` para o resultado do gate e suas limitações. A aprovação da suite focada não substitui as verificações pendentes.
