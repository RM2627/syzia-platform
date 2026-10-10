# SYZIA 042 — upgrade sobre a 041, sem reset

Procedimento preparado para execução autorizada pelo proprietário. Nenhum ambiente externo foi alterado nesta entrega. A rodada termina na entrega do consolidado; o próximo passo é homologação manual curta.

## Preparação

1. Confirmar base **041 consolidada**, banco populado já atualizado até a 041 e histórico de migrations coerente. São 38 arquivos anteriores; preservar todos, inclusive lacunas de numeração de rodadas sem migration.
2. Conferir `MANIFEST.json`, o relatório de integridade e o SHA-256 do ZIP entregue. Base original 041: `760c30e5180b30d4db4618097591ca0ab650b1eb792c5e2369e3dc22a7f82f66`.
3. Preparar backup verificável e recuperação no ambiente escolhido. Homologar em cópia controlada e dados fictícios antes de qualquer liberação posterior.
4. Manter Auth, gateway, Storage, buckets privados, credenciais server-side e configurações existentes. Não colocar chave privilegiada no frontend.

## Ordem

1. Sobre o banco já na 041, aplicar **somente** `supabase/migrations/202609260042_operational_refinements.sql` pelo mecanismo de migrations existente. Não repetir migrations antigas nem aplicar a 042 duas vezes.
2. O arquivo inclui `BEGIN`/`COMMIT` e recarga de schema por `NOTIFY pgrst`. Confirmar commit e cache atualizado antes de usar o frontend 042. Alterações de índices/constraints podem obter locks; medir essa aplicação na cópia controlada.
3. Atualizar o código para o consolidado 042. Usar o lockfile: `npm ci`, `npm run build` e `npm run check:bundle`. O pacote contém fonte completo, assets e histórico; dependências, credenciais e build gerado não são distribuídos.
4. Seguir a homologação curta abaixo. Publicação/deploy depende do processo posteriormente autorizado pelo proprietário; este guia não realiza essas ações.

## Defaults e configuração

Serviços existentes continuam **contínuos**. Divisão exige edição do serviço e publicação pelo fluxo atual. O máximo opcional é de 2 a 30 períodos; sem limite empresarial, há teto técnico de 30, limitado também pelo horizonte da Agenda.

Novos campos em propostas antigas são nulos, com fallback compatível da publicação. Appointments antigos permanecem parte 1. A migration não divide reservas antigas, cria memberships, duplica pedidos ou reescreve valores históricos. Novas propostas enviadas congelam a política de execução da composição.

Faixa de preço exige máximo explícito em serviço `a partir de`; o máximo não pode ser menor que o mínimo. Publicar continua necessário para disponibilizar essa referência ao atendimento. “A partir de” sem máximo permanece referência inferior, não faixa inventada.

## Homologação manual curta

| Etapa | Conferência esperada |
|---|---|
| Equipe | Como ADM, ver compartilhado separado; abrir autonomia/permissões locais. Não encontrar edição/reset/desativação global. Verificar que funcionário próprio conserva o fluxo de acesso. |
| Autorização | Alterar grant local em A e conferir B intacta. Revogar grant/atribuição com sessão aberta e tentar nova ação. Confirmar bloqueio direto pela API/RPC e acesso global do Super Admin. |
| Home | Abrir hoje com dados, próximo/andamento/amanhã; usar ficha, pedido, retorno e proposta aprovada sem agenda. Confirmar mensagens e tentativa localizada se uma chamada falhar. |
| Proposta | Caso fixo sem alteração permite envio sem explicação. Alterar preço/item/condição: campo obrigatório e motivo visível. Conferir prévia, original e nova versão. |
| Contínuo | Publicar serviço de 6h30 em um dia com janela de 6h. A Agenda não oferece janela impossível, explica duração e busca próxima data compatível. |
| Divisível | Publicar serviço de 10h, limite de dois períodos e expediente compatível. Consumidor deve receber, por exemplo, 7h + 3h e confirmar o conjunto. Conferir mesmo pedido/proposta na Agenda e acompanhamento. |
| Conflito | Ocupar um período antes de confirmar o plano apresentado. A confirmação antiga deve falhar sem reserva parcial e oferecer nova escolha. |
| Alterações | Remarcar somente uma parte e conferir outra preservada; replanejar conjunto; cancelar integralmente. Conferir histórico e ausência de partes órfãs. |
| Conclusão/valores | Concluir só a primeira parte: contratação ainda não concluída. Concluir a última: uma contratação realizada, sem duplicar valor e sem criar pagamento recebido. |
| Regressão rápida | Contratação direta fixa, avaliação empresarial com aprovação, ajuda contextual, identidade publicada, claro/escuro e celular. Empresa/consumidor B não acessa A. |

## Reprodução local focada

```bash
npm ci
npm run test:042
npm run test:042:regression
npx playwright install chromium
npm run test:042:browser
npm run build
npm run check:bundle
```

Os testes criam somente fixtures locais descartáveis com dados fictícios. Não apontar demo/testes para banco ou serviços reais. Não executar `test:master` nesta etapa. Para Chromium já instalado, o projeto aceita `FOUNDATION_CHROMIUM_PATH` apontando ao executável local.

`npm run test:042:native` é opcional, requer Linux com usuário não root e usa cluster local efêmero. Nesta entrega foi bloqueado por mapeamento de UID. Mesmo após esse comando, a concorrência e os serviços externos ainda precisam de homologação própria.

`npm run build:migration:042` reproduz o SQL a partir dos fragmentos e das definições 041 incluídas. Não é necessário regenerar para aplicar o arquivo entregue. `scripts/syzia-042/ui.py` é registro da transformação inicial; não deve ser reaplicado ao código atual.

## Falha e recuperação

Falha antes do commit: interromper a atualização, investigar o erro transacional e conservar o histórico; não remover RLS, grants ou constraints para forçar sucesso. Não resetar o banco.

Após commit e uso: não excluir campos/partes/histórico para simular rollback. Restaurar backup em ambiente separado para diagnóstico ou preparar correção incremental autorizada. Voltar somente o frontend não desfaz decisões e reservas registradas pela 042.

## Próxima autorização

Homologação externa, backup/restauração, concorrência independente e bateria ampla continuam pendentes. Nenhum provider/pagamento real foi validado. Encerrar a 042 e aguardar o proprietário; não iniciar 043 ou bateria mestre automaticamente.
