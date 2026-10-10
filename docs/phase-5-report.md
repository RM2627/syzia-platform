# Relatório de entrega — Fase 5: Central de Atendimento Humano

Data: 16/09/2026 · Projeto: 0.5.0.

**DESENVOLVIMENTO LOCAL:** implementação da Central e regressão das fases anteriores. **HOMOLOGAÇÃO EXTERNA:** PENDENTE. **PRODUÇÃO/LANÇAMENTO:** responsabilidade exclusiva de Marcelo.

A entrega contém todo o projeto das Fases 2 a 5. Não houve deploy, publicação pública, contratação, ativação de plano pago, acesso ao banco real da MS Auto Details, dados de clientes reais, WhatsApp API, IA ou pagamentos reais. **Fase 6 não iniciada. Parar e aguardar aprovação.** Escopo autorizado preservado em `scope-phase-5.md`.

## 1. O que foi implementado

### Central, fila e contexto

- `/central` e `/central/:code`: Minha fila, Fila geral, Todos, Aguardando empresa e Resolvidos recentes. Empresa, cliente, serviço, estado, responsável, espera, prioridade e próxima ação são visíveis no atendimento.
- Painel operacional com novos na fila, clientes aguardando, atrasados, agendas de hoje, decisões empresariais, carga, retornos, orçamentos e resolvidos. Contagens referem-se explicitamente aos resultados carregados, sem alegar métricas globais/avançadas.
- Filtros no banco por empresa autorizada, texto (cliente/empresa/ticket/serviço/origem/responsável), estado, minha fila, visão e data de entrada no fuso empresarial. Paginação de 100. Priorização global por prazo, atenção, urgência manual e espera; demais ordenações são da página carregada, identificadas na UI.
- Tela com conversa, notas internas, histórico e área de contexto. Trocar ticket desmonta o contexto e elimina rascunhos, respostas rápidas e valores anteriores; respostas assíncronas antigas são descartadas.
- Contexto mínimo inclui cliente, contato quando consentido, recorrência, origem, últimas solicitações, perguntas/respostas, observações, anexos, orçamento e agenda. Notas/tags/preferências administrativas só aparecem ao atendente mediante compartilhamento explícito da empresa; padrão negativo.
- Manual integrado usa versão publicada, com busca literal por tópico/texto, catálogo, regras, FAQ e autonomia. Rascunho administrativo não alimenta a Central.

### Atendimento e operação humana

- Ticket é a unidade; vínculo à solicitação permite obter oportunidade, orçamento e agenda existentes. Nenhuma tabela conversation ou segundo sistema de agenda/orçamento foi criado.
- Estados: fila, ativo, aguardando cliente, aguardando empresa, ação interna, resolvido e encerrado. Ações: assumir, transferir a destinatário autorizado, devolver à fila, alterar estado/prioridade, definir próxima ação/prazo, resolver, encerrar e reabrir por interação.
- Responsabilidade única, revisão esperada, trava transacional e idempotência. Mensagem obsoleta não sobrescreve estado; a interface avisa e mantém texto para revisão explícita. Antigo responsável perde autorização para mutar após transferência.
- Mensagens do cliente/atendente/empresa com nome do perfil, autoria e timestamp; nenhuma pessoa real hardcoded. Texto de apresentação usa perfil e empresa do ticket. Comunicação humana na plataforma; sem envio automático.
- Respostas rápidas da empresa com pesquisa/preview e manual associado. Edição negada por padrão; administrador pode autorizar. Conteúdo é revalidado no banco contra o manual atual.
- Notas internas têm canal visual próprio, autor/data e auditoria; nunca entram na projeção do consumidor. Eventos guardam metadados, sem duplicar corpo de mensagens/notas na auditoria.
- Encaminhamento guarda motivo, resumo e pergunta; ticket aguarda empresa. `/painel/:orgId/pendencias` restringe a fila à empresa e permite decisão autorizada. Resposta retorna ao responsável ainda elegível ou à fila. Decisão textual não amplia permissões.
- SLA é opcional por empresa: tempo para atenção/resposta e prazo manual por ticket. Sem configuração não há promessa. Próxima ação `follow_up` é tarefa manual, sem automação da Fase 6.
- Presença disponível/ocupado/pausa/offline e sessão de trabalho única. Pausa impede novas assunções. Presença não concede papel/vínculo; não há vigilância, cálculo trabalhista, rastreamento de mouse/teclado/câmera ou folha.

### Orçamento, agenda, consumidor e anexos

- Proposta da Central usa catálogo autorizado da solicitação e manual atual. Valores fixos e adicionais são recalculados no banco; desconto inteiro respeita autonomia e máximo publicado, com arredondamento por item para baixo em centavos. Registra valor original/final, motivo, ator, versão e manual.
- Preço “a partir de”, sob consulta, publicação divergente ou condição excepcional exige decisão e proposta da empresa pelo fluxo administrativo existente. Não há campo de preço arbitrário para atendente. Nova proposta cria versão; final enviada permanece imutável.
- Agenda usa os mesmos motores do consumidor: serviço elegível, duração, adicionais, jornada, antecedência, bloqueios, capacidade, aprovação exigida, cancelamento e remarcação atômica. Falha de remarcação mantém a reserva anterior. Nenhuma cobrança bloqueia agenda nesta fase.
- Acompanhamento do consumidor recebeu conversa restrita à própria solicitação, via identidade técnica ou acesso resgatado autorizado. Telefone/UUID/código não autentica. Link somente leitura não envia mensagem. Expiração/revogação reavaliadas nas novas operações.
- Aprovação/recusa/agendamento/cancelamento pelo consumidor atualizam próxima ação/revisão do ticket aberto, sem duplicar eventos de operações executadas pela Central.
- Download de imagem continua por gateway privado com ticket de 60 segundos, uso único, usuário e arquivo. Atendente autorizado pode ler anexos do pedido; isso não amplia upload nem libera acesso de outra empresa. JPEG/PNG/WebP e sanitização/limites da Fase 4 permanecem.
- Financeiro exclusivamente leitura de registros preparados; confirmação manual externa continua distinta de provedor. Não há ação para confirmar pagamento, cobrança, gateway ou transação real.

## 2. Segurança, modelo e migrations

**Migrations efetivamente aplicadas: 001–013 somente em bancos descartáveis locais PGlite. Nenhuma aplicada em Supabase real.** Dez migrations anteriores verificadas por SHA-256, sem alteração; evidência em `reports/phase-5-migration-integrity.json`.

| Nova migration | Conteúdo |
|---|---|
| `202609160011_central_schema.sql` | Tabelas, RLS/FORCE RLS, policies, constraints, auditoria, imutabilidade |
| `202609160012_central_commands.sql` | Tickets, fila, mensagens, notas, decisões, presença, configuração e revisão |
| `202609160013_central_integration.sql` | Contexto/manual, motores compartilhados, desconto, agenda e anexo autorizado |

Oito tabelas novas: `central_settings`, `tickets`, `ticket_messages`, `ticket_notes`, `ticket_events`, `ticket_escalations`, `work_sessions`, `central_quote_actions`. **Total: 49 tabelas públicas/49 policies SELECT**, todas com RLS/FORCE RLS, sem escrita direta concedida ao cliente. São 12 RPCs públicas novas, 15 helpers/motores privados novos e seis RPCs anteriores redefinidas com entradas autorizadas preservadas.

FKs compostas garantem associação correta de organização, solicitação, cliente, ticket, manual e versão. Índices únicos impedem ticket aberto duplicado, escalonamento pendente duplicado e duas sessões operacionais abertas. Mensagens, notas, eventos e registro de desconto são imutáveis. Preservadas exclusão GiST de agenda, propostas congeladas, idempotência e todas as regras anteriores.

Autorização verifica perfil confirmado/ativo, empresa ativa, papel global, vínculo ativo, prontidão humana, responsabilidade e autonomia atual. Suspensão/revogação não dependem de renovar JWT; presença e UUID não concedem acesso. Trava transacional compartilhada serializa operações sensíveis com revogações, com custo de paralelismo explicitado abaixo. Funções privadas novas não são executáveis por clientes, exceto predicado necessário à policy. Service role permanece exclusivamente no servidor/gateway.

Inventário completo de assinaturas, grants, policies, constraints, triggers, páginas, componentes e scripts: `phase-5-sql-inventory.md`. Matriz dos 27 testes obrigatórios: `phase-5-test-matrix.md`.

## 3. Resultados locais

**323 casos locais únicos aprovados; zero falhas nas rodadas finais.** Incluem 242 casos SQL, 41 de navegador e 40 de ferramentas/imagens/configuração/HTTP local. Nenhum caso foi ignorado na rodada final de navegador.

| Suíte | Resultado | Evidência |
|---|---:|---|
| Fundação SQL | 68/68 | `reports/security-results.json` |
| Empresa SQL | 71/71 | `reports/company-security-results.json` |
| Consumidor SQL | 35/35 | `reports/consumer-results.json` |
| Presença e preparação financeira SQL | 28/28 | `reports/presence-payments-results.json` |
| Central SQL | 40/40 | `reports/central-results.json` |
| Configuração segura | 3/3 | `reports/config-security-results.json` |
| HTTP loopback demo | 1/1 | `reports/demo-http-results.json` |
| Ferramentas da Fundação | 10/10 | `reports/phase-5-local-final.txt` |
| Ferramentas Empresa | 5/5 | `reports/phase-5-local-final.txt` |
| Ferramentas Central | 5/5 | `reports/phase-5-local-final.txt` |
| Imagens | 9/9 | `reports/phase-5-local-final.txt` |
| Ferramentas Consumidor | 7/7 | `reports/phase-5-local-final.txt` |
| Interface Chromium (33 regressão + 8 Central, casos únicos) | 41/41 | `reports/phase-5-browser-regression.json + reports/browser-results.json` |

Typecheck, build e inspeção do bundle: **PASS** (`phase-5-bundle-scan.json`, `phase-5-build.txt`). Marcador fictício em variável server-only não aparece no frontend. Aviso informativo do chunk inicial: aproximadamente 502,62 kB/144,09 kB gzip.

Consolidação: `reports/phase-5-summary.json`. A primeira execução agregada passou Fundação/Empresa e parou no teste de contagem antiga de tabelas. Após correção, todas as suítes restantes e os 40 testes de UI passaram. O ajuste final de recuperação de confirmação foi validado pelos oito testes da Central; sete eram repetidos e um novo, resultando em **41 casos únicos de UI**, sem somar repetições. Logs: `phase-5-local-validation.txt` (tentativa inicial), `phase-5-local-final.txt` (continuação), `phase-5-ui-final.txt` (Central final).

Inspeção visual concluída em **desktop 1600×1000, tablet 1024×1366 e celular 390×844**; sem overflow horizontal. Evidências: `reports/visual-phase5/desktop.png`, `tablet.png`, `mobile.png`. Revisão verificou identificação da empresa/cliente, navegação, conversa, composer, contexto e distinção da nota interna. Screenshots usam dados fictícios.


Ambiente: Node 24.19.0, PostgreSQL 18.3 via PGlite 0.5.8, Auth/claims locais simulados, Chromium local/Playwright. O teste HTTP de demonstração usa loopback e gateway com Auth/Storage simulados. Teste de revisão em série não é concorrência de conexões independentes.

## 4. Falhas encontradas e correções

- Em teste SQL de transição, colisão entre variável e coluna de estado: variável renomeada e transição validada no banco.
- Fixture de anexo usava `storage_path`, enquanto schema real usa `object_path`: corrigida a fixture, sem mudar schema/constraints; leitura autorizada e negação A/B retestadas.
- Um teste de tooling da Fundação esperava 41 tabelas com RLS; a Central acrescentou oito. Atualizado para 49, mantendo exigência de RLS/FORCE RLS. O primeiro comando agregado parou nessa asserção; Fundação/Empresa já haviam passado. A sequência restante foi reexecutada após a correção, com evidência separada — não se afirma que a primeira execução agregada passou.
- Teste de captura da Central tinha seletor de título ambíguo (mesmo cliente na fila e no cabeçalho): seletor passou a exigir heading nível 2, sem remover a verificação visual.
- Inspeção visual identificou herança da navegação administrativa, que empilhava abas no desktop: estilos da Central isolados, mantendo navegação compacta em desktop e quebra adequada em mobile.
- Filtros de fila/data passaram a acontecer antes da paginação no banco; nome do serviço na fila vem do snapshot da solicitação, evitando uso silencioso de rascunho de catálogo.
- Callback de evento do consumidor incorporado para despertar próxima ação ao aprovar/recusar/agendar; teste específico cobre aprovação→agenda.
- Recuperação de resposta perdida após commit: a interface mantém argumentos e chave originais, bloqueia nova operação até conferir o resultado e evita reenvio com uma revisão/chave diferente. Acrescentado teste de queda de conexão depois da gravação.
- Preparação do Chromium usa arquivo temporário e troca atômica, evitando binário parcial durante teste. Isso altera somente infraestrutura local de testes.

Logs preservam a tentativa inicial com falha e a execução posterior; não foram removidos controles de autorização para obter aprovação dos testes.

## 5. Decisões e limitações conhecidas

- **Reabertura:** cliente que interage com resolvido em até sete dias reabre o ticket. Resolvido há mais de sete dias é encerrado e gera novo relacionado; encerrado também gera novo. Unicidade impede duplicação. Histórico anterior continua no banco; o chat mostra mensagens do ticket mais recente.
- **Atualização:** polling de contexto a cada 12 segundos e fila a cada 15; não há Realtime/WebSocket. Revogação vale na próxima operação no servidor, embora dados já recebidos possam permanecer visíveis até atualização. Não é possível recolher bytes legitimamente baixados.
- **Escala:** trava global compartilhada garante ordem das mutações sensíveis, mas reduz paralelismo. Histórico de um ticket é retornado integralmente; paginação de mensagens e otimizações exigirão desenho posterior conforme volume, sem relaxar acesso. Fila é paginada em 100; indicadores/ordenações extras são da página carregada.
- **Autonomia:** alteração operacional da Fase 3 pausa atendimento humano até revisão/publicação/reativação. Remover o principal pode pausar a prontidão de todos até designação válida. Backup não ignora checklist. Administrador pode decidir e organizar; ações comerciais de atendente exigem papel/vínculo/autonomia apropriados.
- **Preço excepcional:** o atendente encaminha e a empresa define proposta autorizada no fluxo existente. Texto livre não é analisado semanticamente; o produto não consegue garantir veracidade de toda frase humana. Valores estruturados, descontos, propostas e agenda permanecem controlados pelo banco.
- **SLA/presença:** não há distribuição automática, métricas avançadas, folha/ponto ou automação comercial. Horários são apresentados no fuso Recife do MVP; filtro de data usa fuso cadastrado na empresa. Presença é declarada pelo operador, não comprova atividade física ou vínculo empregatício.
- **Rascunhos:** mensagens ficam em memória e são preservadas em falha no mesmo ticket; são descartadas ao trocar contexto/conta. Não há armazenamento permanente indiscriminado de dados pessoais no browser.
- **Build:** aviso sobre tamanho do chunk inicial é informativo, não comprova desempenho sob rede/dispositivo real. Nenhuma credencial real participou do scan; configuração futura do host precisa de revisão própria.

## 6. Pendências externas e conclusão

**PENDENTE DE HOMOLOGAÇÃO EXTERNA:** Supabase real com migrations, Auth/JWT/SMTP, confirmação/recuperação, PostgREST/RLS, sessão existente após revogação, múltiplos atendentes reais de teste, concorrência independente de atribuição/transferência/mensagens/agenda, Storage/gateway/expiração/revogação, proteção de abuso no provedor, backup e restauração real. Dependem de conta, credenciais, projeto ou infraestrutura de Marcelo. Nenhum desses itens foi declarado executado externamente.

O runner PostgreSQL nativo não pôde iniciar neste contêiner por restrição de usuário não-root; `reports/native-phase5-output.txt` registra recusa. Nenhuma proteção do ambiente foi contornada. Runners externos, exemplos, SQL de inspeção, matriz e template de relatório foram preparados em `scripts/homologation` e `phase-5-homologation.md`.

Decisões antes de operação real: configurar SLA desejado, edição de respostas rápidas, compartilhamento de contexto administrativo, autonomia e backup; definir retenção, limites de infraestrutura e política de backup/restore. Todas continuam responsabilidade do usuário; não exigem publicação pelo agente.

**A Fase 5 pode ser considerada entregue para revisão de DESENVOLVIMENTO LOCAL, conforme os resultados locais registrados. NÃO está homologada em Supabase real e NÃO está autorizada para produção.** Projeto completo contém fontes, lockfile, assets, 13 migrations, SQL de Storage, configurações de exemplo, scripts, fixtures, testes, documentos, evidências e manifesto verificável. Não contém dependências instaladas, segredos, dumps nem dados reais.

**Parar após esta entrega. Aguardar autorização expressa antes da Fase 6.**
