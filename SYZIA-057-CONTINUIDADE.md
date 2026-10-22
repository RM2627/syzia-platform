# SYZIA 057 — Continuidade verificável

Base GitHub consultada uma vez: `33e04ca8ba14be73e7050ae84c5299410d5c7011`. Branch local: `syzia-057-ativacao-automatica`. Nenhum commit, push, merge ou deploy. A entrega é incremental, não substitui a base operacional.

## Estado no encerramento

Implementação local concluída, com 14 testes de ativação, 3 de integridade, 42 regressões direcionadas, 1 jornada Playwright e build aprovados. Logs estão em `evidencias/`. Ver `pacote.log` para aplicação/reversão e validação da cópia limpa. O inventário lista todos os arquivos, hashes anteriores e finais.

Não há implementação financeira paralela nem alteração de `server/`. A única correção do reconciliador é a desambiguação do alias SQL `b`, comprovada por erro 42702 e teste de comparação textual. O 42501 histórico real não teve a causa exata comprovada; não concluir que desapareceu em produção a partir das fixtures.

## Próximo passo exato

1. Extrair o pacote e ler o relatório; executar o preflight na cópia oficial e aplicar o patch em branch isolada conforme o guia.
2. Executar os comandos direcionados documentados. Não repetir auditoria geral nem modificar Mercado Pago/HF02.
3. Antes de publicar, revisar a migration `202610220058_invitation_activation.sql` e autorizar sua aplicação pelo proprietário. **Ela não foi aplicada ao Supabase real ou Neon.** A migration financeira 057 anterior permanece intacta.
4. Homologar Auth/e-mail real, destinatário, checkout e confirmação financeira em ambiente autorizado. A etapa externa não é substituída pelos mocks.
5. Se for exigida validação concorrente em PostgreSQL nativo, executar com conexões independentes e conferir dois requests/duas conclusões e duas versões de convite para o mesmo interessado. A fila PGlite testada não é evidência de concorrência nativa.

## Retomada prevista pelo proprietário

Se houver nova execução em **27/10/2026, após 12h24 (horário de Brasília)**, retomar a partir da revisão/homologação acima, não da investigação inicial. Não há agendamento automático nem autorização de deploy implícita.

## O que não deve ser publicado como concluído

- Não declarar Mercado Pago, confirmação de e-mail externa ou produção homologados.
- Não publicar frontend 057 sem migration correspondente.
- Não afirmar aprovação do gate completo ou de Windows: não foram executados nesta rodada. As antigas contagens fixas de migrations não foram enfraquecidas para produzir PASS.
- Não remover a verificação do destinatário, aceitar conta anônima, alterar `is_active_user`, fabricar justificativa/revisão, iniciar trial no claim ou importar dados operacionais demonstrativos.
- Não interpretar convite anterior rejeitado ou apropriado por outra identidade como fluxo normal automaticamente autorizado.

## Arquivos de referência para retomar

`Activation.tsx`, `SelfService.tsx`, `Management.tsx` (somente seção Ativações), `platform-commercial/api.ts`; migration 058; `tests/commercial-057/activation.test.mjs`; `tests/demo-browser/commercial057.spec.ts`; `docs/syzia-057/` com manifest de toda a base e transições explícitas. A fixture de navegador só carrega 058 com `DEMO_COMMERCIAL_057=true` e modo de testes já exigido.

Os relatos da 056-HF01 sobre autorização de envio e as regras de e-mail continuam válidos. Esta rodada não implementa envios automáticos, não muda Convites e não resolve pendências de SMTP.
