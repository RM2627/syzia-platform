# Matriz de testes — disponibilidade e Assistido

As referências E/S estão em `tests/team-availability.test.mjs` e seu resultado por cenário em `reports/team-availability/focused.json`. Cada caso começa uma transação e desfaz seus dados fictícios. Negações usam savepoint e verificam a causa esperada; não se aceita uma falha genérica como sucesso.

| Requisito de funcionário | Evidência focada |
|---|---|
| 1. Herança do horário geral | E01 |
| 2. Horário próprio | E02 |
| 3. Dia sem atendimento | E03 |
| 4. Dois intervalos | E02/E04 |
| 5. Cabe no primeiro intervalo | E02 |
| 6. Atravessa pausa e é negado | E04 |
| 7. Cabe no segundo intervalo | E04 |
| 8. Conflito existente | E07/E17; exclusão do recurso preservada e mesmo funcionário em dois recursos existentes |
| 9. Empresa fechada | E06 |
| 10. Funcionário aberto e empresa fechada | E06 |
| 11. Empresa aberta e funcionário fechado | E03/E06 |
| 12. Duração e buffer | E05 e gate AUD-002 |
| 13. Remarcação | E04/E06/E07 |
| 14. Troca de responsável | E10; negação preserva responsável anterior |
| 15. Múltiplos períodos | E11/E16; gate 042/044 mantém atomicidade, ordem e AUD-003 |
| 16. Alteração do horário preserva reservas | E08; comparação completa da reserva antes/depois |
| 17. Indisponibilidade pontual | E09, dia inteiro e intervalo no fuso da empresa |
| 18. Sem responsável | E07 e regressões históricas inteiras |
| 19. Isolamento A/B | E12/E17 |
| 20. Grants, revogação e identidade global | E13/E14; UX001-security cumulativo |
| 21. Desktop | Browser novo 1440 px e gate vigente |
| 22. Mobile | Browser novo 390/320 px e gate vigente |

| Requisito do Assistido | Evidência focada |
|---|---|
| Super Admin configura política | S01/S02; browser global |
| ADM não edita política | S01; browser empresarial, RPC e URL global negadas |
| Autoatendimento fora do horário | S02, cria solicitação e continua mensagens |
| Não indicar humano disponível fora do horário | S02/S09; payload `shared_open=false`, mensagem informativa |
| Atuação dentro do horário | S03/S04 |
| Um ticket consome uma unidade | S03 |
| Várias mensagens não multiplicam | S03, cinco mensagens e reassunção |
| Consumo por empresa | S05 |
| Consumo por ciclo | S06/S10, mesmo ticket em ciclos diferentes |
| Aviso de aproximação | S04 |
| Limite atingido | S04/S08 |
| Empresa própria continua | S04 |
| Consumidor envia solicitação/mensagem | S02/S04/S09 |
| Equipe não assume novo ticket acima do limite | S04/S08; transferências também negadas |
| Sem cobrança excedente automática | S05, quantidade de faturas inalterada |
| Plano sem Assistido negado | S11 |
| Downgrade preserva histórico | S07/S11 |
| Isolamento A/B | S05 e E12 |
| Auditoria e idempotência | S05/S06/S10; ledger imutável |
| Identidade global com vínculo legado não contorna limite | S12 |

## Regressão cumulativa

O runner oficial inclui os testes de contratos do gate, UX001-security, AUD-001–003, upgrade, regressão SQL 040/041/042, onboarding, gateways, build/typecheck/bundle, navegador histórico atual, navegador novo e UX-001. O resultado e os comandos exatos ficam registrados no JSON do gate, com exit code e duração por etapa.

Validação local usa PostgreSQL via PGlite, fixtures HTTP e Chromium. Auth, SMTP, Storage, PostgREST/cache, volume e concorrência em conexões PostgreSQL reais continuam **PENDENTES DE HOMOLOGAÇÃO EXTERNA**. Não foram substituídos por afirmação de equivalência com os testes locais.
