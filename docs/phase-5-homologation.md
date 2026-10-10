# Guia de homologação externa — Fase 5: Central de Atendimento Humano

**PENDENTE DE HOMOLOGAÇÃO EXTERNA.** Este guia e os scripts são preparação para execução por Marcelo. Nenhum projeto Supabase real foi conectado, nenhuma migration foi aplicada externamente e nenhum deploy foi realizado. Usar somente projeto dedicado, contas e empresas fictícias. Não usar o banco real da MS Auto Details nem ativar serviços pagos.

## 1. Ambiente e ordem de instalação

1. Preservar os guias `homologation-guide.md`, `phase-3-homologation.md` e `phase-4-homologation.md`; repetir suas validações de Auth, SMTP/recuperação, Storage, RLS e agenda. São documentos históricos: a autorização posterior permite desenvolver a Fase 5, sem autorizar lançamento.
2. Instalar Node 22.12+ e executar `npm ci`. Extrair todo o projeto, não apenas migrations novas. Aplicar **001 a 013 em ordem lexicográfica** em um projeto Supabase dedicado e vazio. Para um ambiente que já recebeu 001–010, comparar versões/checksums antes de aplicar somente 011, 012 e 013. Não executar migrations antigas novamente nem desabilitar triggers/RLS para corrigir divergências.
3. SQLs novos: `202609160011_central_schema.sql`, `202609160012_central_commands.sql`, `202609160013_central_integration.sql`. A terceira extrai motores privados das operações existentes e preserva suas verificações públicas. Inspecionar resultado com `scripts/homologation/central-inspect.sql`: 49 tabelas públicas com RLS/FORCE RLS, 49 policies SELECT, sem escrita direta para anon/authenticated. Apenas `private.central_staff` é helper novo executável por authenticated para as policies; motores privados não são executáveis por clientes.
4. Manter os buckets privados e os SQLs de Storage da Fase 4. Não tornar arquivos públicos. Conferir `consumer_gateway_attachment` e funções de finalização com execução exclusiva de service role, somente no gateway Node.
5. Copiar `.env.example` para arquivo local de frontend e `.env.server.example` para configuração privada do servidor. Frontend recebe somente URL/chave pública. Iniciar `npm run dev` e `npm run attachments:dev` localmente. Não usar `dev:demo` para alegar Auth real: esse comando usa fixtures e mocks.
6. Configurar Site URL/redirects de localhost autorizados, confirmação de e-mail, recuperação e provedor de e-mail conforme guias anteriores. Validar sessões anônimas do consumidor separadas de contas confirmadas da equipe. Não colocar credenciais no ZIP, screenshots, logs, tickets ou Git.

## 2. Massa fictícia e habilitação operacional

Criar duas empresas A/B e seis identidades distintas: `agentA`, `backup`, `agentB`, `adminA`, `consumerA`, `consumerB`. Os quatro primeiros são contas confirmadas; consumidores podem usar as sessões técnicas reais da Fase 4. Para cenário multiempresa, preparar também uma sétima conta de atendente compartilhado.

Pelo bootstrap restrito e administração da Fundação, conceder papel global de atendente e vínculo principal em A ao agentA; reserva em A ao backup; principal em B ao agentB. Atribuir adminA somente a A. Disponibilidade não substitui papel/vínculo.

Concluir onboarding, catálogo, regras, manual publicado e checklist humano de ambas. Ativar atendimento humano e publicar a página do consumidor. Para o cenário de preço, autorizar explicitamente `price_list`, `quote_create`, `quote_send`, `discount` com limite 10%, `schedule`, `reschedule`, `cancel`; manter as demais negativas conforme regras. Usar serviço fixo com agenda elegível e um segundo serviço sob consulta. Publicar alterações antes de testar; alterações de configuração pausam atendimento humano conforme regra preservada da Fase 3.

Cada consumidor cria sua própria solicitação enviada. Pode usar o mesmo telefone fictício nos dois cadastros: isso não concede identidade. A submissão gera ticket quando atendimento humano está habilitado; pedido anterior pode ser trazido pela RPC `central_open_request`. Registrar códigos de A/B sem confundi-los com segredos. Preparar um ticket de A **novo, na fila e sem responsável** para cada teste de mutação/concorrência. Os scripts deixam os registros para inspeção.

## 3. HTTP/PostgREST com JWTs reais

Copiar `scripts/homologation/central.example.json` para `.homologation/central.json`. Preencher projeto dedicado, URL correspondente, chave pública, seis JWTs válidos/diferentes, UUIDs das empresas e códigos dos tickets/solicitação. Marcar `testOnlyAcknowledged: true` e manter `realCustomerData: false` somente após conferir o ambiente. Não compartilhar esse arquivo.

```sh
npm run homologation:central:read
npm run homologation:central:mutations
```

O modo de leitura autentica os seis tokens em `/auth/v1/user`; testa contexto autorizado, nega acesso cruzado, impede consumidor de ler notas internas e verifica busca vazia em empresa sem vínculo. O modo de mutação exige ticket novo sem responsável; duas requisições HTTP concorrem para assumir, apenas uma deve vencer; mensagem repetida mantém um efeito e revisão antiga é recusada. O relatório sanitizado fica em `reports/phase-5-http-external.json`. Ausência de configuração interrompe o script antes de conexão; essa recusa local não é homologação externa.

## 4. Concorrência com conexões SQL independentes

Preparar outro ticket fictício de A sem responsável. Atualizar o exemplo com seu código e JWTs ainda válidos. Definir `CENTRAL_TEST_DATABASE_URL` em ambiente privado, apontando exclusivamente ao PostgreSQL dedicado; preferir conexão direta ou pooler de sessão compatível com transações. TLS exige certificado válido. Não desativar verificação TLS.

```sh
npm run homologation:central:concurrency
```

O runner verifica Auth de agentA/backup, abre dois `pg.Client` e exige PIDs de backend distintos. A mantém a trava transacional compartilhada enquanto B tenta assumir; após commit de A, B deve receber `40001`. Depois intercala transferência para backup com mensagem do antigo responsável; a mensagem deve receber `42501`, sem gravar. Relatório: `reports/phase-5-concurrency-external.json`. O ticket permanece com backup e pode ser devolvido pela interface.

Repetir também com dois browsers: transferência simultânea, encerramento concorrente, mensagem concorrente com resolução, mudança de autonomia/suspensão enquanto outra transação espera. Ordem linearizável: operação concluída antes da revogação permanece no histórico; operação posterior ao commit da revogação deve falhar. Nenhum teste pode remover a trava global do MVP. Repetir concorrência de agenda pelos scripts da Fase 4 e confirmar rollback da remarcação.

## 5. Matriz manual complementar obrigatória

Registrar cada linha com ambiente, resultado, evidência sem dados pessoais e eventual correção. A matriz local `phase-5-test-matrix.md` relaciona os 27 requisitos a casos executáveis; repetir externamente, não presumir equivalência.

| Cenário | Resultado exigido |
|---|---|
| Papel/vínculo, empresa e UUID | Atendente A só lê/opera A; adminA não decide B; manipular código/UUID/filtros não concede acesso |
| Multiempresa compartilhada | Trocar A→B elimina rascunho/resposta/contexto anteriores; catálogo/manual correspondem a B |
| Rascunho de manual | Somente snapshot publicado alimenta Central; novo rascunho não substitui manual aprovado |
| Desconto/preço | Limite excedido, valor esperado adulterado e preço arbitrário falham; preço sob consulta exige decisão da empresa |
| Resposta rápida | Pertence ao manual atual; edição negada por padrão; liberação exige administrador e revisão de configuração |
| Nota interna | Não aparece no thread do consumidor, REST direto, outra empresa nem anexos/respostas públicas |
| Encaminhamento | Motivo/resumo/pergunta persistem; somente empresa autorizada decide; decisão textual não amplia autonomia |
| Proposta | Snapshot/itens finais imutáveis, desconto auditado, versão antiga/expirada não aprovável, clique repetido idempotente |
| Agenda | Conflito de capacidade recusado; remarcação com falha mantém reserva original; ações exigem autonomia atual |
| Reabertura | Interação até sete dias reabre resolvido; fechado/resolvido há mais tempo cria novo relacionado, sem duplicação |
| Presença | Disponível/ocupado/pausa/offline não concedem papel ou vínculo; pausa impede novas assunções |
| Histórico | Mensagens/eventos/notas têm autor e timestamp; logs não copiam corpo/token/segredo |
| Financeiro | Somente contexto preparado; atendente não marca confirmação nem executa cobrança |
| Cliente e link | Mesmo telefone não concede acesso; link consulta não envia mensagem; revogação/expiração impede novas operações |
| Falhas de rede | Interromper resposta depois de commit; UI exige conferir resultado com argumentos/chave originais antes de outra ação; um único efeito. Rascunho preservado, confirmação não presumida |

### Revogação durante sessão já aberta

Abrir Central e manter JWT. Em sessão administrativa independente, suspender perfil, remover papel, suspender vínculo, suspender empresa e remover membro administrador, **um cenário por vez**. Repetir leitura e mensagem no browser e via HTTP com o JWT anterior: negar imediatamente na nova operação; polling limpa contexto sem renovar token. Reativar somente pela administração autorizada antes do cenário seguinte. Remover atendente principal pode pausar toda a prontidão humana até designar principal válido — isso é proteção da Fase 3, não falha do backup.

Reduzir autonomia exige nova publicação/revisão e reativação do checklist; antes disso ações ficam bloqueadas. Após reativar, desconto antigo não pode continuar por sessão em cache. Repetir tentativa de escrita direta nas tabelas de permissões, papel, mensagens e pagamentos.

### Anexos e acesso temporário

Com gateway real e Storage privado, enviar JPEG/PNG/WebP válidos e rejeitar extensão falsa, MIME adulterado, tamanho/dimensões excedidos e arquivo inválido. Em ticket A, atendente A recebe ticket de download de 60 segundos, uso único e vinculado ao usuário/arquivo. Atendente B não pode emitir nem consumir ticket de A. Revogar vínculo antes de consumir e exigir recusa, mesmo com ticket previamente emitido. Consumidor B nunca lê arquivo de A. Reutilização/expiração falham. A aplicação transmite bytes autorizados, não publica URL de Storage. Bytes já baixados legitimamente não podem ser recolhidos.

## 6. Abuso, retenção, backup e restauração

O banco limita mensagens do consumidor a dez por minuto por identidade e limita corpos a 4.000 caracteres; notas a 2.000. Isso não substitui proteção real de Auth/CAPTCHA/limites por IP e orçamento de recursos. Validar CAPTCHA, criação de sessões, limites do gateway/reverse proxy e observabilidade sem registrar Authorization/corpos. Definir limites de infraestrutura antes do lançamento; não ativar planos pagos automaticamente. Presença não é ponto eletrônico; polling não é rastreamento de teclado/mouse/câmera.

Aplicar estratégia de backup da Fundação/Fase 4: migrations/configuração sem segredos versionadas, dump autorizado do banco e cópia separada de objetos Storage com hashes. Acrescentar tickets, mensagens, notas, eventos, encaminhamentos, sessões, idempotência e descontos auditados. Restaurar em **outro destino descartável**, nunca sobre o ambiente de origem. Revalidar constraints, 49 policies, snapshots, papéis, vínculos, autorização, expiração/revogação e anexos após restaurar. Encerrar sessões operacionais antigas de modo controlado se necessário; não alterar dados para fazer o teste passar. Cópia do ZIP não equivale a restauração de banco.

**Restauração real e proteções do provedor continuam pendentes**, pois dependem de conta/recursos/decisão de Marcelo. Não contratar ou ativar cobrança para concluir este roteiro.

## 7. Critério de conclusão

Preencher `phase-5-external-report-template.md`, registrar migrations efetivas e resultado individual de todos os cenários. Os runners cobrem somente seus casos explícitos; não são certificação automática de Auth, Storage, concorrência restante ou restauração. Considerar a Fase 5 homologada externamente apenas após validar todos os controles aplicáveis e registrar pendências aceitas pelo responsável.

Desenvolvimento local aprovado pode continuar em fase futura somente com autorização expressa de Marcelo. Este guia não autoriza Fase 6 nem produção.
