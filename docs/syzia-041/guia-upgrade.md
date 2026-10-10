# SYZIA 041 — upgrade sobre a 040, sem reset

Este é um procedimento preparado para o proprietário. Nenhum ambiente externo foi alterado nesta entrega.

## Pré-condições

1. Usar o consolidado 040 como base. A cadeia histórica contém 37 migrations; preservar todos os arquivos e o registro de execução. Não criar arquivos fictícios para números de rodadas que não tiveram migration.
2. Fazer backup verificável e preparar restauração no ambiente escolhido. Homologar primeiro com empresas/consumidores fictícios.
3. Conferir o `MANIFEST.json` do novo ZIP e `reports/syzia-041/base-integrity.json`. Fonte 040: SHA-256 `de33c3e97b80192f4a331bd12ca1839641f745a865d11f3580e92bde7f2390bf`.
4. Conservar configurações de Auth, PostgREST, gateway privado de anexos, Storage e credenciais server-side existentes. Não colocar chave privilegiada no frontend ou tornar bucket público.

## Ordem de atualização

1. Na base que já executou a 040, aplicar **somente** `supabase/migrations/202609260041_self_service_journeys.sql` pelo mecanismo de migrations existente.
2. A migration possui `BEGIN`/`COMMIT`, alterações aditivas e `NOTIFY pgrst, 'reload schema'`. Confirmar commit e atualização do cache de schema antes do frontend novo. Não executar novamente migrations antigas nem aplicar a 041 duas vezes.
3. Atualizar os arquivos da aplicação para este consolidado. Instalar dependências pelo lockfile (`npm ci`), executar `npm run build` e o processo de atualização do ambiente autorizado pelo proprietário. Este guia não autoriza deploy automático.
4. Validar os três fluxos abaixo. Só após a validação do proprietário considerar qualquer liberação posterior.

## Dados e comportamento preservados

Não há backfill destrutivo, limpeza de requests/tickets, rescrita de valores históricos, memberships novos ou republicação automática. Campos novos possuem defaults compatíveis ou são nulos para registros antigos. Requests anteriores mantêm o fluxo legado quando não possuem jornada/horário pretendido; propostas e appointments anteriores continuam nas mesmas entidades.

Snapshots antigos usam a opção `direct_booking` já publicada quando não existe `contract_mode`. Para configurar as opções novas, o ADM edita os serviços/perguntas e publica pelo processo atual. Uma alteração em rascunho não modifica a página publicada.

A agenda direta requer preço fixo e composição determinística, duração válida, disponibilidade e regras publicadas. Se um componente exigir avaliação, o pedido inteiro segue para a empresa. Uma preferência não ocupa capacidade e não deve ser tratada como appointment.

## Validação manual focada

| Fluxo | Verificação |
|---|---|
| A — direto | Serviço fixo e adicionais, horário, confirmação, entrada imediata na Agenda, nenhum orçamento final artificial; cancelamento/remarcação conforme regras. |
| B — avaliação | Escolher horário pretendido, enviar fotos quando exigidas, ticket para próprio elegível/ADM, proposta discriminada, aprovar e reservar. Ocupar o horário antes da aprovação e verificar nova escolha mantendo a proposta. |
| C — ajuda | Consultar FAQ sem criar ticket; abrir ajuda, enviar mensagem, receber resposta e continuar o mesmo pedido, sem duplicar oportunidade/solicitação. |
| Segurança | Compartilhado não define preço variável; funcionário sem grants é bloqueado; revogar grant na sessão aberta; empresa B não lê/edita A; consumidor B não lê pedido/anexos de A. |
| UI | Um menu Equipe SYZIA, operação/tickets separados, claro/escuro e móvel; orçamento e fotos com estados claros; nome e cores da empresa vêm da publicação. |
| Histórico | Recusar proposta e enviar nova versão; manter pedido original e versões; aprovação/agendamento não criam pagamento recebido. |

## Reprodução local

```bash
npm ci
npm run test:041
npm run test:041:regression
npx playwright install chromium
npm run test:041:browser
npm run build
npm run check:bundle
```

Os testes são locais e descartáveis. `test:041:browser` inicia a demo, usa fixtures fictícias e pode limpar somente essa fixture; isso não é reset de banco empresarial. Não apontar testes/servidor de demo para serviços reais. A suíte 041 não executa a auditoria mestre.

`npm run test:041:native` é opcional e usa cluster local efêmero, sem Supabase. Precisa de Linux com usuário não root compatível; nesta entrega foi bloqueado por mapeamento de UID. A concorrência real entre conexões permanece pendente.

Para reproduzir a migration a partir das fontes locais: `npm run build:migration:041`. As definições da base utilizadas pelo gerador acompanham `reports/syzia-041/baseline-functions/`. Não é necessário regenerar para aplicar o SQL entregue.

## Falha e recuperação

Se a aplicação da 041 falhar antes do commit, interromper a atualização e investigar a transação; não remover constraints/policies para forçar sucesso. Não fazer reset. Se já houve commit e uso da 041, não executar SQL destrutivo de reversão nem excluir colunas/histórico. Restaurar backup em ambiente separado para diagnóstico ou preparar correção incremental aprovada. Reverter somente o frontend não reverte decisões/contratações já registradas pelo servidor.

## Pendências

Auth/SMTP/Storage/PostgREST reais, concorrência independente, backup/restauração e validação manual no ambiente do proprietário não foram homologados aqui. Provider de cobrança e pagamento real não fazem parte desta atualização. Ao entregar, parar.
