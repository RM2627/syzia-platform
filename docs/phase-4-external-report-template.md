# Registro de homologação externa — Fase 4

Estado inicial: **PENDENTE DE HOMOLOGAÇÃO EXTERNA**. Preencher somente após executar os casos. Não copiar tokens, senhas, service role, connection strings ou dados reais.

- Operador/data:
- Projeto dedicado (referência sem segredos):
- Confirmado sem dados reais / sem banco real da MS:
- Migrations efetivamente aplicadas (ordem e hashes):
- Configuração Auth/CAPTCHA/Storage/gateway realizada:
- Versão do código/manifesto:

| Caso | Ambiente/método | Resultado | Evidência sanitizada | Correção/pendência |
|---|---|---|---|---|
| Auth anônimo, refresh, expiração e separação equipe/consumidor | Real | PENDENTE | | |
| Cadastro, confirmação, login, logout e recuperação da Fundação | Real | PENDENTE | | |
| RLS/FORCE RLS e autorização por HTTP/JWTs reais | Real | PENDENTE | | |
| Dois consumidores com telefone igual / UUID trocado | Real | PENDENTE | | |
| Preço adulterado, publicação/serviço alterados | Real | PENDENTE | | |
| Versões finais, expiração, aprovação idempotente | Real | PENDENTE | | |
| Storage privado, validação de arquivos, acesso cruzado | Real | PENDENTE | | |
| Ticket temporário: validade, reuso, revogação | Real | PENDENTE | | |
| Agenda, bloqueios, cancelamento e remarcação | Real | PENDENTE | | |
| Concorrência HTTP e SQL com conexões independentes | Real | PENDENTE | | |
| Suspensão/revogação em sessão existente | Real | PENDENTE | | |
| Branding/portfólio: rascunho, publicação e acesso cruzado | Real | PENDENTE | | |
| Recusa idempotente, recorrência e notas/origem/indicação privadas | Real | PENDENTE | | |
| Preparação financeira: RLS, vínculos, sinal e confirmação manual distinta | Real, sem cobrança | PENDENTE | | |
| Abuso: CAPTCHA, Auth/IP, uploads/gateway | Real | PENDENTE | | |
| Backup e restauração de banco + objetos privados | Real | PENDENTE | | |
| Interface: celular, tablet, desktop, erros/rede | Real | PENDENTE | | |

Conclusão externa: **NÃO HOMOLOGADA enquanto houver casos críticos pendentes ou falhando.**

Decisões restantes / testes impossíveis / motivo:

Aprovação da próxima fase: depende de Marcelo. Produção/lançamento: somente Marcelo.
