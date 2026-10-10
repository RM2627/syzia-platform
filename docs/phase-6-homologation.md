# Guia de homologação externa — Fase 6: Comercial, follow-up e recuperação

**PENDENTE DE HOMOLOGAÇÃO EXTERNA. Não executar agora.** Preparação para Marcelo usar após o desenvolvimento das fases que autorizar. Testes locais usam PGlite, Auth/claims simulados e dados fictícios; não comprovam Auth, PostgREST, RLS/JWT ou concorrência de conexões reais. Não há deploy, cliente real, serviço pago, WhatsApp API ou conexão ao banco real da MS Auto Details.

## Ambiente futuro e instalação

1. Preservar os guias das Fases 2–5. Usar projeto Supabase dedicado descartável, duas empresas fictícias e contas técnicas distintas. Nunca reutilizar o banco operacional da MS.
2. Extrair o projeto inteiro e executar `npm ci` com Node 22.12+ (validação local em Node 24). Configurar `.env.example` e `.env.server.example` em arquivos locais ignorados. Chave pública no frontend; service role apenas no gateway Node privado.
3. Aplicar migrations **001–016 em ordem lexicográfica** se o projeto for vazio. Em banco da Fase 5, conferir versões e checksums e aplicar somente **014, 015, 016**, uma transação por arquivo. Não reaplicar nem editar 001–013; não desabilitar constraints/RLS/triggers para contornar falhas.
4. Novas migrations: `202609160014_commercial_schema.sql`, `202609160015_commercial_engine.sql`, `202609160016_commercial_commands.sql`. Inspecionar com `scripts/homologation/commercial-inspect.sql`: seis novas tabelas, seis policies SELECT, RLS/FORCE RLS, oito RPCs públicas e helpers privados sem EXECUTE para clientes. Total cumulativo 55 tabelas públicas e 55 policies de leitura.
5. A migration 015 concilia estado anterior sem fabricar eventos. Agendamento anterior confirmado com evento `booked` real permite reconhecer conversão; não recria tarefas automaticamente no upgrade. Preserva oportunidades, eventos originais e critérios congelados.
6. Manter buckets privados e gateway da Fase 4. Site URL/redirects devem ser de localhost para a homologação; configurar confirmação de e-mail, recuperação de senha, sessão técnica anônima do consumidor, SMTP e proteções contra abuso conforme guias anteriores. Rodar `npm run dev` e o gateway local. **`npm run dev:demo` não é Auth real.** Nenhum deploy é necessário.

## Massa fictícia e regras

Criar `agentA`, `backup`, `agentB`, `adminA`, `consumerA`, `consumerB` com identidades distintas. A/B devem ter catálogo e manual publicado, checklist humano válido, principal/reserva com papel/vínculo ativos e autonomia `follow_up`. Presença disponível para assumir. Papel global, presença e UUID isolados não autorizam empresa.

Pelo painel empresarial, habilitar recuperação (padrão desabilitada), intervalo de um minuto para testes controlados, duas tentativas e janela atual no fuso da empresa. Criar pedidos fictícios, consentimentos de processamento/contato e propostas finais. Não usar visita anônima como lead. Esperar vencer naturalmente; não adulterar relógio ou prazo no banco real.

Preparar oportunidades separadas por cenário: duas de empresas distintas, uma tarefa sem responsável para HTTP e outra para concorrência SQL. Os runners alteram essas fixtures: não reutilizar tarefa já finalizada. Configurar também regra por serviço, específica por tipo, motivo de perda personalizado e critério de conversão para novos interesses.

## Runners preparados

Copiar `scripts/homologation/commercial.example.json` para `.homologation/commercial.json`. Preencher URL/ref do projeto dedicado, chave pública, JWTs válidos, organizações, tickets, solicitação A e códigos de oportunidades A/B. Marcar `testOnlyAcknowledged: true` somente após conferir projeto e dados fictícios. Arquivo é ignorado pelo empacotador/Git.

```sh
npm run homologation:commercial:read
npm run homologation:commercial:mutations
```

O primeiro valida todos os JWTs em `/auth/v1/user`, isolamento A/B, negação de RPC ao consumidor e SELECT vazio das tabelas internas via PostgREST. O segundo também concorre em duas assunções HTTP, inicia tentativa dentro da janela e envia resultado repetido com a mesma chave; exige um efeito, revisão antiga recusada e histórico consistente. Resultados sem tokens em `reports/phase-6-http-external.json`. Falha ou configuração ausente não é PASS; ausência de configuração encerra antes da rede.

Para SQL com duas conexões independentes:

```sh
# Definir COMMERCIAL_TEST_DATABASE_URL privadamente, sem histórico ou arquivos versionados.
npm run homologation:commercial:concurrency
```

Usar conexão PostgreSQL/TLS do projeto dedicado, com certificado validado e operador técnico autorizado. O runner verifica os usuários no Auth, exige PIDs distintos, usa transações/claims das contas fictícias e trava compartilhada. Testa disputa de atribuição e transferência concorrendo com ação do responsável anterior. Salva `reports/phase-6-concurrency-external.json`. Não usa service role no navegador e não enfraquece RLS. Fixtures ficam disponíveis para inspeção; não há exclusão automática.

## Matriz obrigatória complementar

Repetir os casos de `phase-6-test-matrix.md` com JWTs reais, anotando resultado/evidência por linha. Os runners acima não cobrem sozinhos a matriz inteira.

| Cenário | Resultado exigido |
|---|---|
| A/B, sem vínculo, UUID/código, cliente | A não lê/opera B; consumidor não lê tabelas/RPCs privadas; mesmo telefone não concede identidade |
| Papel, vínculo, conta e empresa suspensos | Operação nova com JWT anterior deve falhar após o commit da revogação; polling remove contexto |
| Autonomia removida | `follow_up` removido impede nova execução; mudança operacional pode exigir publicação/reativação da prontidão da Fase 3 |
| Regra específica/serviço/empresa/padrão | Precedência por campo, intervalo personalizado e padrão 24h/2 tentativas corretos |
| Teto e histórico | Segunda tentativa termina conforme política; terceira não existe; aumento não altera ciclo/snapshot antigo; redução bloqueia novas operações |
| Consentimento ausente/revogado | Nenhuma tarefa elegível/contato liberado; revogação cancela pendentes. Não há marketing implícito |
| Abandono | Somente rascunho persistido com contato autorizado; visita anônima sem cadastro não entra na recuperação |
| Resposta | Interrompe tarefa anterior, atualiza oportunidade/ticket, mantém histórico e não duplica conversa |
| Proposta | Aprovação, recusa e expiração bloqueiam retorno incompatível; imutabilidade e versão válida preservadas |
| Conversão/perda | Só evento real aprovado ou agendado converte; perda tem motivo válido; novo interesse preserva oportunidade perdida |
| Janela e fuso | Antes da abertura, após fechamento, fim de semana e transição de fuso seguem próxima janela; sem dias configurados, contato negado |
| Responsável/transferência | Somente autorizado assume; tarefa de administrador não é tomada; antigo dono não executa depois da transferência |
| Rede/idempotência | Interromper resposta após commit; recuperar com mesma chave/payload gera um efeito; chave repetida com payload divergente falha |
| Privacidade | Notas, regras, autonomia e campos administrativos não aparecem na página/thread/REST do consumidor |
| Publicação da Empresa | Somente manual/publicação aprovados dão contexto; rascunhos não mudam preço/manual apresentado silenciosamente |

### Concorrências adicionais a executar em sessões independentes

Em conexões A/B diferentes, usar a mesma revisão inicial, sincronizar início por barreira e conferir estado final/auditoria:

- Duas conciliações sobre mesma oportunidade: uma única tarefa ativa.
- Dois resultados diferentes para a mesma tarefa: somente um efeito; segundo recebe conflito.
- Mesmo resultado/chave repetido: dois retornos podem confirmar o mesmo efeito, apenas uma tentativa.
- Resposta do consumidor versus tentativa: se resposta confirmar primeiro, revisão/estado antigo não opera; se resultado confirmar primeiro, resposta cancela o retorno seguinte. Conferir ambas as ordens.
- Aprovação/agendamento versus perda/encerramento: primeiro estado terminal confirmado é preservado; evento original de aprovação/agenda não é apagado. Uma conversa não pode fabricar conversão.
- Revogação versus execução: chamada após commit da revogação falha mesmo com sessão antiga. Chamada já confirmada antes da revogação fica no histórico.
- Repetir os conflitos de agenda e remarcação da Fase 4. Uma tarefa comercial não pode contornar a exclusão transacional.

No ambiente local utilizado, PostgreSQL nativo não iniciou porque o contêiner não permite mapear usuário não-root. Não houve corrida local com conexões independentes. Repetir futuramente num ambiente apropriado sem contornar controles do contêiner nem do banco.

## Anexos, abuso, operação e backup

Repetir Auth/SMTP, Storage, gateway privado, JPEG/PNG/WebP, expiração/revogação/uso único de tickets de download e limites de upload dos guias anteriores. Comerciais acessam anexos pelo ticket autorizado existente; não há novo bucket público.

Validar limites de Auth/CAPTCHA e dos gateways no provedor, logs sem JWT/contato/nota integral e proteção contra abuso. Regras comerciais limitam tentativas, revisões e duplicação; não substituem limites de borda/rede. Não ativar plano pago. Conciliação atual roda por eventos e por abertura/atualização da tela a cada 30s; nenhum cron externo foi instalado. Se um worker futuro for necessário, decidir credencial de menor privilégio e validar a mesma RPC/autorizações, sem expor credenciais no frontend.

Backup continua conforme guias da Fundação/Fase 5: conferir disponibilidade/retenção do plano que Marcelo escolher; exportação lógica de banco, configuração Auth e objetos privados precisam ser considerados separadamente. Guardar backup criptografado fora do frontend, sem segredos no ZIP. Restauração deve ocorrer somente em **outro projeto descartável dedicado**, nunca sobrescrevendo fonte. Após restaurar, comparar migrations/checksums, contagens, eventos/consentimentos, RLS/grants e amostras de arquivos e repetir isolamento. Backup/restauração reais permanecem pendentes; nenhum teste foi alegado como executado.

Preencher `phase-6-external-report-template.md`. A Fase 6 somente poderá ser marcada como homologada externamente após evidências de todos os controles pertinentes. Isso não autoriza Fase 7, produção ou lançamento.
