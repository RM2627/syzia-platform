# Homologação externa — Fase 7

**PENDENTE DE HOMOLOGAÇÃO EXTERNA. Não executado nesta entrega.** Marcelo determinou concluir o desenvolvimento até a Fase 8 antes de homologar em ambiente dedicado. Nenhum comando deste guia deve ser confundido com autorização de publicação.

## Preparação futura por Marcelo

1. Projeto Supabase dedicado, dados e contas fictícios; nunca banco real da MS. Repetir os guias preservados das Fases 2–6.
2. Aplicar migrations por nome em ordem lexical, 001–017; se já estiver na Fase 6, somente `202609170017_analytics.sql`. Não usar auth-fixture.sql/fixtures PGlite em Supabase, nem reduzir RLS/constraints.
3. Preparar empresas A/B e identidades distintas (admin A, agente A, reserva A, agente B, consumidores A/B e superadmin). Criar cenários pelos fluxos reais e registrar contagens/valores/instantes esperados.
4. Copiar `scripts/homologation/analytics.example.json` para `.homologation/analytics.json`, preencher projeto, chave pública, JWTs válidos e período. Marcar `testOnlyAcknowledged` só após confirmar ambiente dedicado. Arquivo secreto fica fora do frontend/pacote/git.
5. Executar futuramente `npm run homologation:analytics:read`. Não modifica dados remotos. Confirma identidades em Auth/user, testa agregados autorizados, recusas entre papéis/empresas, operação A/B, exclusividade de plataforma, períodos e vazio. Sem configuração válida encerra antes de conexão. Resultado: `reports/analytics-remote-results.json`, sem tokens.

## Matriz complementar

| Caso | Resultado esperado |
|---|---|
| JWTs reais | Anon/consumidor/colaborador/agente sem vínculo não acessam métricas comerciais; plataforma só superadmin ativo |
| A/B e filtros | Trocar org/serviço não mistura valores; comparar contra inventário conhecido |
| Revogação com sessão antiga | Revogar papel/vínculo/membro ou suspender perfil/empresa: próxima RPC nega, sem esperar JWT expirar |
| PostgREST direto | SELECT protegido e UPDATE de eventos/permissões não contornam RLS |
| Datas/timezone | Limites antes/em/depois de 00:00 Recife e fim exclusivo; mesmo resultado com timezone SQL diferente |
| Filtros/vazio | Origem ausente Não informada; serviço/origem/período aplicados; zero denominador seguro |
| Valores | Revisões não duplicam total; valor aprovado vem da versão aceita; receita sempre null |
| Conversão/perda | Critério persistido, repetição idempotente, cancelamento/reabertura e contagem única por etapa |
| Retornos | Tentativas anteriores/posteriores à conversão, corte temporal; sem atribuição causal inventada |
| Central/SLA | Primeira mensagem/resposta, notas excluídas, sem resposta, resolução, referência atual e prazo ausente |
| Concorrência | Conexões independentes escrevendo eventos/agenda e consultando métricas: snapshot coerente, sem duplicação ou vazamento |
| Performance/abuso | EXPLAIN ANALYZE BUFFERS com volume fictício representativo, limite 366 dias, timeouts/rate limits do projeto |
| Sessão/UI/cache | Troca de conta/empresa, resposta atrasada e erro não mantêm dados antigos; nenhum cache público |
| Storage/regressão | Anexos/mídia privada, links restritos, expiração/revogação e fluxos das fases anteriores |
| UX | Safari/Firefox, aparelhos físicos, teclado/leitor de tela, contraste e conexão lenta |
| Backup/portabilidade | Recriar do zero com 001–017, restaurar somente em alvo dedicado isolado; nunca sobrescrever original |

Registrar projeto, data, versão SQL, papel (sem token), inputs fictícios, esperado/obtido/evidência. Auth/e-mail/SMTP, Storage, PostgREST, JWTs assinados, gateway, concorrência real, backup/restauração e performance externa seguem pendentes. PGlite/mocks nunca viram PASS externo. Falhas exigem correção, não relaxamento de segurança.

Produção/lançamento são exclusivos de Marcelo. Fase 8 requer autorização expressa separada.
