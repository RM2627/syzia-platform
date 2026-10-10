# Relatório — SYZIA, rodada 032

**Base:** consolidado 031. **Estado:** implementação local entregue para homologação pelo proprietário. Sem deploy, conexão com Supabase real, envio de e-mail real ou alteração de dados de clientes.

## Implementação

- Marca pública SYZIA, identidade digital UseSyzia e slogan “Onde tudo se alinha.” no produto, login, primeiro acesso, Administração, Ajuda, suporte, templates e apresentação dos documentos legais. Identificadores técnicos históricos permanecem. Assets individuais foram extraídos dos pixels da referência aprovada, sem reinterpretar símbolo/lettering/gradiente; as limitações de resolução constam em `brand/syzia/README.md`.
- Pessoas e acessos com criação independente de empresa, futuro ADM aguardando vínculo, equipe SYZIA, busca/filtros, ficha, papéis, vínculos, atribuições, permissões globais limitadas, suspensão, revogação/redefinição e auditoria. Preparação interrompida pode ser retomada com a mesma identidade reservada.
- Seleção de pessoa existente em Definir administrador. A mesma identidade pode receber vínculos em várias empresas; o login por código mantém o contexto empresarial isolado. Desvincular preserva pessoa e histórico. Criar empresa continua sem exigir ADM.
- Equipe global sem membership artificial. Atribuições compartilhadas continuam dependendo de capacidade, papel global e regras empresariais. Remover capacidade suspende a atribuição e preserva histórico. Funcionários não recebem Super Admin automaticamente.
- Operação solo: ADM pode ficar disponível, assumir/responder, preparar orçamento, agendar, acompanhar retornos e concluir. A abertura da conversa não exige cadastrar funcionário ou habilitar suporte terceirizado. A Central encaminha a edição empresarial de orçamento ao módulo existente.
- Agenda online oferece configuração inicial real, inativa por padrão, com revisão concorrente, antecedência, horizonte, buffer, prazo de cancelamento e passo. Horários, serviços, duração e regras de conflito reutilizam estruturas existentes. A antiga área de solicitações da tela de configuração foi substituída por caminhos para Atendimento/Serviços, mantendo orçamento no módulo empresarial.
- Tema público claro/escuro persistido e independente do painel. A cor gera tokens para CTAs, estados, links, badges, focus, bordas e superfícies. Contraste calculado entre texto, botão e superfícies. Mini-prévia imediata e prévia completa do rascunho salvo.
- Mensagens de mídia distinguem indisponibilidade do gateway, recusa e armazenamento. Diagnóstico seguro identifica operação, organização quando disponível, categoria, motivo permitido e status. Não registra credenciais/corpos sensíveis. Recusas reais de sessão/permissão continuam bloqueando a operação.

## Diagnóstico dos defeitos

**Agenda vazia — causa comprovada e corrigida.** O formulário só aparecia quando havia `schedule_resources`. A publicação 031 já permitia página sem agenda, enquanto a criação desse recurso ainda dependia do caminho antigo de publicação. A configuração agora cria explicitamente o recurso existente no primeiro salvamento.

**Operação solo — dependências comprovadas e corrigidas.** Elegibilidade/presença privilegiavam atendentes; abertura automática de ticket e disponibilidade da conversa dependiam do atendimento humano habilitado. Foram acrescentadas condições para o administrador autorizado operar e receber conversas, sem alterar os tetos dos atendentes compartilhados.

**Upload real — causa externa ainda não estabelecida.** A mensagem genérica ocultava em qual etapa ocorria a falha. Os contratos de reserva, sessão verificada, `access_media`, sanitização, bucket privado e finalização foram revisados. O gateway atual foi exercitado via HTTP com adaptadores locais de RPC/Auth/Storage. Upload, leitura, troca e retenção histórica passaram; os controles de remoção foram exercitados nas jornadas da presença. Isso **não homologa Storage real**. Origem CORS, disponibilidade/endereço do gateway, projeto/chaves e bucket/policy permanecem pontos para conferir no ambiente do proprietário; não são apresentados como causa confirmada.

**Alerta real do Super Admin — não reproduzido localmente.** Sobre a 031 e a 032, Super Admin com sessão registrada, sem membership e em empresa sem ADM passou em três ciclos de sessão/contextos/permissões/onboarding/mídia. No navegador, também permaneceu autorizado após salvar/navegar e três ciclos de focus/timer. Nenhuma autorização foi alargada para mascarar uma recusa. O diagnóstico adicional permitirá identificar a RPC recusada no ambiente real. A mensagem de uma operação secundária não afirma, por si só, perda total de acesso empresarial.

## Migration e preservação

Foi criada somente `202609220032_syzia_people_experience.sql`. A necessidade persistente está documentada em `architecture.md`: contas pessoais sem organização, permissões da equipe global e tema público. As **31 migrations anteriores foram comparadas byte a byte com o consolidado de origem**; hashes em `migrations-001-031.json`.

O teste aplica 032 sobre banco 031 populado e compara os registros anteriores de todas as tabelas públicas/privadas, mais identidades Auth. A fixture inclui empresas, membros, serviços, categorias, horários, mídia, portfólio/publicações, onboarding, plano/assinatura, histórico de trial, conta financeira, permissões, suporte aprovado e auditoria. A nova coluna de tema recebe `light`; nenhuma publicação anterior é reescrita. Métricas continuam derivadas da operação, sem inferir pagamento de aprovação/execução.

## Testes executados

| Validação | Resultado local |
|---|---|
| Upgrade e cenários SQL focados — `tests/syzia-032.test.mjs` | 14 casos aprovados |
| Tokens/contraste — `tests/syzia-colors.test.mjs` | 1 caso, 8 cores × 2 temas e estados |
| Gateway HTTP e diagnóstico seguro — `tests/syzia-media.test.mjs` | 2 casos aprovados |
| Navegador — SYZIA e regressão da presença 031 | 7 jornadas aprovadas; desktop, celular e tablet |
| Super Admin sem ADM — diagnóstico 031 e 032 | 3 ciclos em cada base; sem membership artificial |
| Typecheck/build | Aprovados |
| Inspeção do bundle | Marcador server-only ausente |
| Migrations 001–031 | 31/31 inalteradas |

Os casos SQL cobrem pessoa/futuro ADM/equipe sem empresa, ativação, retomada idempotente, múltiplos vínculos e desvínculo, suspensão, consulta global limitada, recusa de atribuição sem plano, capacidade interna/isenta e retirada, agenda/revisão/conflito/duração/antecedência/buffer, tema e isolamento, elegibilidade e jornada solo completa. A execução/conclusão usa relógio ajustado somente na fixture local. As jornadas de navegador validam também uploads, portfólio, ordenação, publicação, controles de teclado e retorno à Administração.

Durante a implementação, os testes encontraram e corrigiram condições faltantes da retomada de conta pessoal, abertura de conversa solo e estado inicial da agenda. A conferência visual corrigiu um hover da marca anterior e detalhes decorativos verdes na página pública escura. A jornada de identidade foi repetida após esses ajustes. Uma tentativa adicional de iniciar o navegador exigiu configurar `FOUNDATION_CHROMIUM_PATH` para o binário local já disponível; a execução com esse caminho passou. Resultados finais estão em `reports/syzia-032/`; registros históricos de outras fases não representam nova execução desta rodada. Não foi repetida a auditoria mestre.

## Limites e pendências

- **PENDENTE DE HOMOLOGAÇÃO EXTERNA:** Auth, PostgREST, Storage/buckets, CORS/gateway, SMTP e sessões no projeto real. Sem acesso autorizado a esse ambiente, não se afirma correção comprovada da causa real do upload ou da recusa relatada.
- PGlite e Auth/Storage fictícios permitem testar código, SQL e isolamento local; não equivalem a concorrência PostgreSQL nativa nem integração real. Não houve execução nativa adicional nesta rodada.
- A referência fornecida é uma prancha raster. Não foram inventados masters vetoriais, transparência ou resoluções de exportação superiores às disponíveis. Assets preservam pixels e fundos originais; para formatos de alta resolução, falta o master aprovado.
- **DECISÃO/INFORMAÇÃO JURÍDICA PENDENTE:** razão social, CNPJ, endereço/controlador e revisão final de Termos/Privacidade. A troca visual da marca não altera versões de aceite nem preenche esses dados.
- **DECISÃO DE PRODUTO PENDENTE:** ampliar futuramente o catálogo de funções globais de comercial/financeiro interno. Esta rodada entrega permissões globais de consulta e elegibilidade para atendimento, sem criar novos módulos financeiros ou conceder acesso operacional universal.
- Sem domínio UseSyzia, contratação, cobrança real, vídeo, aplicativo nativo ou publicação.

## Entrega e continuidade

Projeto cumulativo completo, migration 032, lockfile, configurações de exemplo, scripts, testes, fixtures, assets, referência aprovada, guia de upgrade, guia do usuário, inventário de alterações e evidências. Lista dos arquivos em `changed-files.md`. O proprietário deve continuar a homologação manual pelo roteiro de `upgrade.md`. Desenvolvimento desta rodada encerrado após entrega; nenhuma nova fase iniciada.
