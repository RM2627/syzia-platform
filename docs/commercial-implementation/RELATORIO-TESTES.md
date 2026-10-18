# Resultado dos testes — comercial 054

**Implementação entregue para homologação. Gate completo não aprovado nesta rodada: 22 etapas locais passaram; 11 etapas de navegador não foram executadas.** O modo parcial encerrou com `INCOMPLETE`, código 2. Não interpretar esse resultado como liberação para publicação.

## Ambiente e resultado

- Base oficial `4b33f42`, 1.090 arquivos; 49 migrations históricas byte a byte intactas.
- Suite focada: **116/116 PASS**, zero falhas e zero testes pulados.
- Regressão operacional original após aplicar 054 em banco descartável: PASS.
- `npm ci --offline --no-audit --fund=false`: PASS, 94 pacotes, lockfile preservado; instalação em extração nova, sem reaproveitar `node_modules` do diretório de implementação. O cache local supriu os pacotes, sem prova de acesso a um registro externo.
- `npm run build`: PASS, incluindo typecheck, na cópia montada pelo integrador incremental.
- Build demonstrativo e scanner do bundle operacional: PASS. Marcadores fictícios server-side não apareceram no frontend. Isso não substitui revisão das variáveis de uma hospedagem futura.
- Verificação/sobreposição/rollback do pacote: PASS em diretório temporário Linux. Restauração dos 1.090 arquivos originais e remoção dos adicionados verificadas; alterações indevidas, symlinks e conflitos recusados.
- Nenhum teste usou destinatário, cartão, assinatura, serviço de produção ou credencial real.

## Gate local executado

Comando: `npm run test:current-gate -- --local-nonbrowser`.
Ambiente: Node 24, `NODE_OPTIONS=--max-old-space-size=512`.
O gate padrão permanece completo e inclui as 11 etapas de navegador. Nenhuma asserção foi removida para obter o resultado.

| Etapa | Resultado | Duração |
|---|---|---|
| commercial-054 | PASS | 21.0 s |
| commercial-054-regression | PASS | 8.0 s |
| commercial-054-demo-build | PASS | 0.9 s |
| checkout-financial-051 | PASS | 44.2 s |
| legal-versioning-050 | PASS | 6.0 s |
| legal-historical-050 | PASS | 4.4 s |
| hotfix-050 | PASS | 15.0 s |
| hotfix-049 | PASS | 6.1 s |
| focused-049 | PASS | 19.0 s |
| focused-048 | PASS | 14.6 s |
| billing-047 | PASS | 22.6 s |
| gate-contracts | PASS | 0.6 s |
| flexible-upgrade | PASS | 4.5 s |
| flexible-support | PASS | 7.5 s |
| team-upgrade | PASS | 4.5 s |
| team-availability | PASS | 7.8 s |
| ux001-security | PASS | 4.5 s |
| focused | PASS | 8.0 s |
| upgrade | PASS | 4.8 s |
| regression-040-042 | PASS | 27.2 s |
| gateways | PASS | 0.7 s |
| build | PASS | 1.7 s |

## Ocorrências tratadas

1. A sandbox do teste negativo INT-I02 precisava copiar a nova dependência de integridade. A preparação foi corrigida, mantendo a asserção de adulteração do manifest histórico.
2. Dois testes 049 sobrescreviam PDFs históricos com resultados reproduzíveis. Somente seus caminhos de saída foram separados para `reports/commercial-054/regenerated-049/documents`; os PDFs de referência e as asserções foram preservados. A conferência integral pode ser repetida após o gate.
3. Duas execuções anteriores foram interrompidas pelo limite de memória do container. O contador de OOM registrou encerramentos. UX-001 passou isoladamente; o gate local final passou com heap limitado a 512 MB, sem mudar os casos de teste.

Permanece o aviso já existente do chunk PDF acima de 500 kB. Não houve refatoração de módulos financeiros ou operacionais para eliminar esse aviso.

## Validações não executadas

- Navegação e homologação visual desktop/mobile, teclado e foco: ferramenta de navegador exigida não disponível. Não foram fabricadas screenshots ou resultados.
- PostgreSQL nativo/múltiplas conexões: criação do cluster bloqueada pela impossibilidade de mapear usuário não-root. PGlite é prova local das regras, não da contenção entre conexões na hospedagem.
- Windows/PowerShell nativo: wrapper entregue; núcleo Node validado em Linux, incluindo paths e equivalência LF/CRLF. Junction nativa depende da conferência Windows.
- SMTP externo, recebimento em caixa postal, DNS/HTTPS, infraestrutura, MP real e aplicação da migration no Supabase: não executados, conforme restrições.

A matriz completa e o roteiro de homologação estão em `MATRIZ-TESTES.md` e `HOMOLOGACAO-PENDENTE.md`. MP-01 e pendências financeiras anteriores permanecem abertas. A integração oficial e a publicação precisam da homologação posterior do proprietário.
