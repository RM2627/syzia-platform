# Matriz e resultados — e-mail pagador 051

Ambiente: Linux, Node.js, PGlite e Chromium. Mercado Pago substituído por transporte/SDK de teste. Nenhuma requisição financeira externa, dado pessoal real ou credencial real.

## Execuções

| Comando/verificação | Resultado |
|---|---|
| Restauração da base disponível | 924/924 hashes SHA-256 exatos |
| `npm ci --no-audit --no-fund` em extração nova | PASS |
| `npm run test:051` | 39/39: 27 originais + 12 novos |
| `npm run test:051:browser` | 14/14: 10 originais + 4 novos |
| `node --test tests/integrity-eol.test.mjs` | 8/8; negativos preservados |
| `node --test tests/mp400-051/diagnostic.test.mjs` | 16/16; diagnóstico anterior preservado e contrato do e-mail atualizado |
| `npm run build` na extração nova | PASS: typecheck e Vite |
| `npm run test:current-gate` na extração nova | **PASS — 30/30 etapas, nenhuma ignorada** |
| Migrations | 47/47 intactas, nenhuma adicionada |
| Commit oficial `f316db5` | Não comprovado: conector retornou 404 |
| Windows nativo nesta rodada | Não executado; negativos LF/CRLF executados no Linux |
| Criação real aceita pelo Mercado Pago | Não executada; não declarar HTTP 400 resolvido externamente |

Não somar contagens de suítes como casos únicos: o gate reexecuta os testes específicos e de navegador. O build conserva o aviso preexistente de bundle grande; não foi feita otimização fora do escopo.

## Casos novos do backend

| Caso | Cobertura | Resultado |
|---|---|---|
| 051-E01 | Normalização só de domínio/espaços externos; preserva caixa local e `+` | PASS |
| 051-E02 | Ausente, inválido, controle/CRLF, nome de exibição, excesso de tamanho | PASS |
| 051-E03 | Sugestão autenticada; alias interno não sugerido; não autenticado recusado | PASS |
| 051-E04 | E-mail inválido não prepara contrato, reserva trial ou chama provider | PASS |
| 051-E05 | Organização adulterada, usuário sem grants, ator/preço/provider injetados | PASS |
| 051-E06 | Administrador e pagador iguais; payload preservado e snapshot confirmado | PASS |
| 051-E07 | Contrato vinculado não altera pagador nem cria outra assinatura | PASS |
| 051-E08 | Pagador diferente chega ao POST; HTTP 400 preserva reserva, contrato e restrição | PASS |
| 051-E09 | Nova tentativa com novo e-mail/token, duas abas, único lease; timeout após criação | PASS |
| 051-E10 | Operação incerta e busca vazia não criam; reconciliação recupera um único trial | PASS |
| 051-E11 | Troca de cartão não altera e-mail; conta/documento preservados; sem novos dados pessoais em histórico | PASS |
| 051-E12 | Erro HTTP e auditoria sem e-mail/token/documento; correlação preservada | PASS |

## Navegador

| Cenário | Evidência local | Resultado |
|---|---|---|
| Desktop 1440 e celular 390 | Sugestão editável, e-mail exibido, confirmação invalidada após edição, envio exato | PASS |
| Campo vazio/inválido | Nenhum POST, sem fallback administrativo | PASS |
| Mudança durante tokenização | Campo bloqueado; alteração forçada no DOM/SDK não chega ao backend | PASS |
| Layout e acessibilidade existentes | 1440, 768, 390 e 320 px; sem overflow/sobreposição, foco e contraste | PASS |
| Envio e recusa | Um POST, CTA desativado, token e e-mail explícitos; nenhum dado bruto do cartão/documento | PASS |
| Resultado incerto/retorno | Sem novo envio ou sucesso artificial | PASS |
| Limite de membros/elegibilidade | Bloqueios legítimos preservados | PASS |

As capturas locais foram inspecionadas visualmente. Elas usam campos de pagamento fictícios e não acompanham a entrega; a evidência entregue é textual. O SDK real e seus efeitos externos não foram homologados por esses mocks.

## Comparação antes/depois

Antes de editar, um teste local com o adaptador original reproduziu dois fatos: `payer_email` explícito era recusado como campo desconhecido e o POST usava o e-mail administrativo. Depois, 051-E08 e os testes de navegador comprovam o valor confirmado atravessando a API e chegando ao transporte do provedor simulado. Os mesmos testes mostram que isso não concede acesso sem snapshot validado.

## Integridade e teste da entrega

O candidato foi aplicado sobre uma cópia nova dos 924 arquivos originais. Nessa extração foram executados instalação, build e gate completo. Os arquivos funcionais entregues são comparados com essa cópia validada. O teste anterior opcional de diagnóstico também foi executado nessa extração.

O gate regenera dois PDFs fictícios históricos. Essas diferenças de resultado foram identificadas e não incluídas no complemento. A comparação da sobreposição é feita em outra extração, antes da geração de resultados, preservando os bytes originais desses fixtures. Os manifests antigos, a referência do b30c991, o allowlist LF/CRLF, seu hash independente e as migrations não são reescritos para acomodar esses resultados.

A conferência independente aprovou 930 arquivos após a sobreposição, aceitou as representações LF e CRLF comprovadas e rejeitou alterações de conteúdo e de binário. A suíte de 39 testes da 051 também passou em uma cópia textual normalizada para LF. Isso não equivale a executar Windows nativo ou clonar o commit inacessível.

## Gate completo

| Etapa | Resultado |
|---|---|
| checkout-financial-051 | PASS |
| legal-versioning-050 | PASS |
| legal-historical-050 | PASS |
| hotfix-050 | PASS |
| hotfix-049 | PASS |
| focused-049 | PASS |
| focused-048 | PASS |
| billing-047 | PASS |
| gate-contracts | PASS |
| flexible-upgrade | PASS |
| flexible-support | PASS |
| team-upgrade | PASS |
| team-availability | PASS |
| ux001-security | PASS |
| focused | PASS |
| upgrade | PASS |
| regression-040-042 | PASS |
| gateways | PASS |
| build | PASS |
| browser | PASS |
| team-browser | PASS |
| ux001-browser | PASS |
| browser-hotfix-049 | PASS |
| browser-049 | PASS |
| browser-048 | PASS |
| billing-browser | PASS |
| flexible-browser | PASS |
| checkout-browser-051 | PASS |
| browser-legal-050 | PASS |
| browser-hotfix-050 | PASS |

O JSON original do gate acompanha este documento em `gate-final.json`; logs completos desta execução estão no pacote separado de evidências.
