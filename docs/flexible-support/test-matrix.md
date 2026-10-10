# Matriz — suporte compartilhado flexível 046

Execução local com dados fictícios. `Fxx`: `tests/flexible-support.test.mjs`; `Sxx`: testes Assistido preservados de `tests/team-availability.test.mjs`; navegador: `tests/demo-browser/flexible-support.spec.ts`. Resultados finais e logs acompanham `reports/flexible-support/`.

| Requisito obrigatório | Cobertura |
|---|---|
| 1. Flexível sem grade | F01; Global 1440/390/320 |
| 2. Ticket entra sem disponível | F02 |
| 3. Fila não consome | F02, F09 |
| 4. Consumidor envia mensagem | F02; Consumer 1440/390 |
| 5. Mensagem permanece | F02; Consumer 1440/390 com reload |
| 6. Autoatendimento continua | F03; regressões 040–042/044 e consumidor no gate |
| 7. Empresa própria continua | F04, F09 |
| 8. Indisponível não assume | F05; Central 1440/390 |
| 9. Disponível autorizado assume | F06; Central 1440/390 |
| 10. Assumir consome uma unidade | F06; Central 1440/390 |
| 11. Mensagens seguintes não multiplicam | F06 (cinco mensagens) |
| 12. Transferência não multiplica | F07; F08 verifica negação atômica para destinatário indisponível |
| 13. Limite impede ticket novo | F09 |
| 14. Contabilizado continua | F10 |
| 15. Programado funciona | F11; testes 045; Global 1440/390/320 |
| 16. Fora da janela preservado | F11; testes 045 |
| 17. Troca de modos | F12; Global 1440/390/320 |
| 18. Super Admin configura | F01, F12, F13; Global 1440/390/320 |
| 19. ADM não configura global | F14; Company 1440/390 com URL e RPC diretas |
| 20. Plano sem Assistido não recebe | S11 da 045 executado sobre 046; F16 cobre assinatura suspensa |
| 21. Isolamento A/B | F14, F18; regressões preservadas |
| 22. Grants/revogação | F15, F18; UX-001 security e regressões preservadas |
| 23. Desktop | Nove cenários de navegador incluem largura 1440 |
| 24. Mobile | Mesmos fluxos em 390; configuração e planos também em 320; overflow verificado |
| 25. Sem promessa 24h/SLA/horário fixo | F20; revisão dos textos alterados e screenshots |

Coberturas adicionais: F17 limite/threshold/ciclo/ledger imutável; F19 preços/trial/faturas intactos; F20 privilégios de funções novas; `flexible-support-upgrade.test.mjs` compara 125 tabelas populadas e dez definições críticas da 045.

O gate completo preserva Agenda, responsáveis opcionais, conflitos, buffer e múltiplos períodos; Central/Equipe SYZIA; planos/capabilities; Home; consumidor e UX-001. O relatório final distingue cada suíte e sua quantidade. Casos de versões diferentes podem se sobrepor; não apresentar a soma como casos de produto únicos.

## Ajustes dos próprios cenários antes da execução final

Os primeiros ensaios corrigiram parâmetros de preparação do teste para seguir os contratos existentes (`faqs`, `consumer_start_help.p_stage`, itens permitidos) e a transação do seed de upgrade. No navegador, criar um serviço invalida o manual vigente: o cenário positivo passou a publicar um novo manual pelos comandos autorizados. Nenhuma regra de elegibilidade, proteção ou assertion histórica foi afrouxada. As evidências finais são identificadas separadamente de logs exploratórios.

A primeira execução do gate em 04/10 às 00:04 UTC expôs um problema temporal no caso 042-46: ele selecionava a data UTC, mas `analytics_company` interpreta o período no fuso da empresa. Às 21h locais ainda era o dia anterior. O adaptador atual passou a obter a data de `now()` no timezone da organização, mantendo todas as assertions de contagem, valor realizado e valor recebido. O teste histórico e o código de métricas continuam byte a byte. A falha original fica em `reports/flexible-support/diagnostics/gate-initial/`.

O navegador cumulativo detectou a troca desnecessária do rótulo “Equipe SYZIA · Atendimento compartilhado”. O arquivo de Pessoas e acessos foi restaurado integralmente à 045; esse texto já era coerente com o modelo. Não foi alterado o seletor nem a assertion do teste. A execução intermediária, com 29/30 casos aprovados, está em `reports/flexible-support/diagnostics/gate-label/`; o gate final foi repetido integralmente.
