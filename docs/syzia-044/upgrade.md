# Upgrade SYZIA 042 → 044, sem reset

Este guia prepara a atualização; não executa deploy, publicação ou homologação externa. A 043 foi auditoria: **não existe migration 043**.

## Base e ordem

Base intacta: `SYZIA-042-Consolidado(1).zip`, SHA-256 `48ee5b0340efbbaa47ac223b6e29416a07eb5231c0cb5ff02a24605c6be4c948`. Todas as migrations históricas permanecem byte a byte.

Em banco já atualizado até 042, aplicar somente:

`supabase/migrations/202609260044_approved_audit_corrections.sql`

Usar o mecanismo de migrations já adotado no projeto, com o proprietário/migration role autorizado. O arquivo possui `BEGIN`/`COMMIT`; não fracionar suas instruções. Não reaplicar migrations históricas, não executar seed de demonstração no banco existente e não usar reset. Em instalação nova, aplicar a cadeia ordenada do pacote; 042 é seguida diretamente pela 044.

Preparar backup conforme o procedimento operacional existente antes da atualização externa futura. Backup/restauração real continua pendente de homologação; nenhuma restauração foi executada nesta rodada. Planejar janela de manutenção: a coluna gerada STORED exige alteração física da tabela e pode adquirir lock; impacto em volume real não foi medido.

## Mudanças persistentes

- `appointments.buffer_minutes`: coluna gerada pela diferença entre janela ocupada e `service_minutes`; fica nula quando a duração antiga não pode ser comprovada. Valores, revisão, horários e eventos preexistentes não são reescritos pela migration.
- Guardas privados de aprovação, origem manual e ordem, com execução pública revogada; trigger de gravação da reserva.
- Implementações privadas de reserva/remarcação, duração operacional e estado de disponibilidade atualizadas. Assinaturas públicas permanecem.
- RLS/FORCE RLS, políticas, grants anteriores, histórico e idempotência preservados. Nenhuma membership artificial.

Distribuir o código frontend e runtime correspondente à 044 junto da mudança, na futura atualização autorizada. O erro passa a orientar aprovação/replanejamento; a ficha diferencia duração do serviço, preparação e janela reservada.

## Reservas antigas

A configuração histórica permanece até haver alteração. Reservas com `service_minutes` registrado recalculam a nova janela com o buffer vigente na remarcação. Reservas manuais anteriores, sem esse campo, recuperam a duração somente se ela reproduzir exatamente o hash do comando original de criação; foram verificados 75 minutos de serviço antes e depois, acrescidos do novo buffer de 30 minutos.

Se esse registro não existir, tiver representação temporal incompatível ou não permitir prova exata, a remarcação isolada retorna `appointment_duration_unavailable` e preserva a reserva. Revisar o serviço e os períodos pelo replanejamento existente. Não preencher duração por subtração do buffer atual, nem alterar dados históricos em massa. Este limite conservador é explícito e não equivale a migração de toda reserva legada sem metadados.

Eventuais reservas indevidas já presentes em um banco externo não são apagadas ou canceladas automaticamente. Esta rodada não acessou dados reais e não autoriza saneamento de dados históricos; a correção protege novas reservas e alterações.

## Verificação local reproduzível

1. Instalar dependências pelo lockfile com Node 24 e `npm ci`.
2. Disponibilizar Chromium via Playwright ou `FOUNDATION_CHROMIUM_PATH`.
3. Executar `npm run test:current-gate`.
4. Exigir saída zero e `reports/syzia-044/current-gate.json` com PASS.
5. Conferir `upgrade.json`: comparação de todas as colunas antigas, RLS/grants e rollback de falha injetada na migration.

O gate utiliza banco descartável local. Não apontá-lo ao banco real. `test:044` executa os testes focados, upgrade e contratos do gate. A matriz dos 42 critérios está em `mandatory-cases.md`; o mapa das falhas da 043 está em `../testing/history-current-map.md`.

## Falha e retorno

Falha antes do COMMIT reverte a migration; corrigir a causa, manter o banco em 042 e reaplicar integralmente somente quando apropriado. O teste de upgrade injeta uma falha antes do COMMIT e comprova ausência da coluna nova e igualdade das linhas anteriores após rollback.

Não remover a coluna/guardas nem restaurar a função vulnerável como retorno automático após atualização concluída. Qualquer retorno externo ou correção adicional requer procedimento próprio e autorização; não foi executado nesta rodada.

## PENDENTE DE HOMOLOGAÇÃO EXTERNA

Auth, SMTP, Storage/gateway, PostgREST/schema cache, concorrência PostgreSQL independente, backup/restauração, volume/performance e provider reais. A futura bateria final ampla também depende de nova solicitação. Parar após a entrega 044.
