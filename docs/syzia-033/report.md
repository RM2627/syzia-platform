# SYZIA 033 — relatório técnico da entrega local

Base exclusiva: consolidado SYZIA 032 conferido pelo manifesto da entrega. Escopo: `request.md`. Entrega cumulativa, com código, ativos aprovados, migrations 001–033, testes, fixtures, scripts e documentação. Desenvolvimento encerrado para homologação do proprietário; sem publicação, reset, cobrança, Supabase real ou dados reais.

## Resultado funcional

| Área | Implementado / comportamento |
| --- | --- |
| Sidebar e login | Navegação rolável com Sair integrado ao rodapé; altura responsiva. A composição do login integra o raster aprovado ao fundo. Símbolo, lettering, proporções e gradiente não foram redesenhados. |
| Username | Formulários Pessoas e cadastro usam `suggestUsername`, a regra histórica do ADM. Acentos e nomes compostos são normalizados; edição manual é preservada. Colisão após criação Auth mantém a identidade e permite corrigir o username pessoal. Usernames empresariais continuam locais ao contexto. |
| Marca da empresa | Conteúdo, horários, região, FAQ e portfólio usam tokens neutros. CTA, links, ícones e indicadores mantêm destaque. Superfícies informativas, legendas e botões do catálogo foram ajustados também no tema escuro. |
| Site institucional | `/`, `/planos` e `/contato`, com posicionamento multissegmento, recursos existentes e demonstração interativa da jornada. A marca é SYZIA — Onde tudo se alinha. Não há promessa de crescimento garantido. |
| Planos | Consulta das versões comercialmente publicadas; preço e periodicidade vêm do banco. Controles explícitos para ativo, disponibilidade, visibilidade no site, self-service e oferta de trial. Nenhum plano anterior é publicado automaticamente. |
| Contato / Aquisição | Formulário cria somente lead global. Administração → Aquisição apresenta Leads, Novos cadastros, Trials e Conversões. Grants `acquisition.read`/`acquisition.manage` são próprios; não concedem operação empresarial ou financeiro. |
| Self-service | Auth com senha definida pelo titular; dados mínimos, CPF/CNPJ, escolha explícita de plano, método e consentimento. Retomada idempotente; conclusão transacional cria organização e primeiro ADM, preserva a identidade e abre os gates legais e o checklist empresarial existente. |
| Trial / billing | Trial self-service exige método validado pelo servidor e consentimento registrado com preço/versão/prazo. Simulação identificada; pagamento real pendente. Trial manual, extensão, isenção e auditoria permanecem. Método validado não é pagamento nem conversão. |
| Recorrências | Frequências semanal, mensal e anual; descrição, categoria, valor, vencimento inicial, fim e observação. Prevista/pendente só vira despesa paga após confirmação autorizada. Edição futura, cancelamento, revisão e idempotência preservam histórico. |
| Login / contextos | `/entrar` é a porta unificada. Identidade/e-mail resolve o titular; uma empresa abre seu ambiente, várias oferecem escolha, equipe global e Super Admin vão ao contexto correspondente. O primeiro módulo respeita grants; não concede Home a quem não tem acesso. Código empresarial permanece para usernames ambíguos e primeiro acesso. |
| Provisionamento | Código temporário seguro, expirável e de uso único continua sendo o fluxo administrativo. Retomar provisionamento reutiliza a identidade reservada; não emite código antes de concluir Auth/finalização. |
| Mídia | Gateway, sessão, autorização, sanitização e Storage privado preservados. Readiness local adicionado sem expor segredos. Testes locais de envio, leitura, substituição, recarga e remoção de referências; homologação real não realizada. |
| SEO | Title, description, Open Graph, favicon aprovado, headings e canonical opcional por origem HTTPS configurada. Não há domínio definitivo inventado. |

## Arquitetura e autorização

Reutilizados Auth, profiles, enterprise_accounts, enterprise_sessions, organization_members, onboarding, planos/versões, assinaturas/faturas, ledger financeiro, permissões e auditoria. Não há segundo onboarding, nova autenticação paralela ou membership artificial de Super Admin.

O login por identidade mantém a verificação da operação de senha do fluxo anterior. A troca de contexto valida sessão verificada, inatividade, geração atual, titular, vínculo e organização ativos. Autenticar uma identidade não libera todos os tenants. Contextos empresariais usam as mesmas RPCs/permissões da operação existente.

Tabelas novas usam RLS/FORCE RLS e revogação de acesso direto. Métodos de pagamento, lookup de identidade, seleção de contexto e rotina simulada de vencimento são server-side. Wrappers internos antigos não ficam acessíveis como atalhos. Aquisição fica global; consumidor não acessa informação interna.

As regras da 029/032 continuam vigentes: Super Admin sem ADM responsável pode configurar pela própria autorização global; com responsável, as restrições de suporte/emergência permanecem. Não foi liberado acesso operacional universal.

Grants novos: `finance.recurring.create`, `finance.recurring.manage`, `finance.forecast.read` e `finance.expenses.pay`. Somam-se aos grants existentes de registrar/ver/administrar despesas, caixa, recebimentos, resultado e métricas. Registrar despesa ou criar recorrência não concede consolidados. No financeiro, Recebido, Despesas pagas, Resultado realizado, Despesas previstas e Saldo a receber são distintos.

## Billing e decisões não inventadas

**INTEGRAÇÃO DE PAGAMENTO REAL PENDENTE.** O processo normal não injeta adaptador comercial; nenhuma cobrança real é apresentada como concluída. O caminho completo foi executado apenas na demo descartável com método fictício e indicação explícita de simulação.

No fim do trial, o contrato local prepara fatura pendente; confirmação de pagamento ativa a assinatura. Falha produz estado de regularização. Suspensão preserva os registros, mantém acesso do ADM ao billing e impede novas operações; página pública fica indisponível de forma neutra. Cancelamento antes da primeira cobrança não gera fatura. A primeira conversão é contada uma vez, sem contar renovações como novas aquisições e sem transformar aprovação de orçamento em receita.

Planos sem trial têm cadastro salvo e contratação pendente da integração. Inelegibilidade de trial exige revisão; não se cria gratuidade substituta. O documento informado é validado estruturalmente, mascarado e convertido em fingerprints; isso não equivale a consulta governamental.

**DECISÃO DE PRODUTO PENDENTE:** provider, retries, tolerância, política de cancelamento pós-conversão, reembolso/proporcionalidade, preços/regras finais, domínio e dados jurídicos. Nenhuma política comercial nova foi presumida. Detalhes em `payment-contract.md`.

## Diagnóstico Auth e mídia

A evidência real fornecida (`49eb147f-3216-43eb-b20a-5434651d31bc`, `provisioning_incomplete`, `auth_identity`) identifica a etapa, mas não demonstra credencial incorreta, conflito, indisponibilidade ou defeito de Auth. O código antigo descartava o detalhe diagnóstico. Agora logs seguros incluem request_id, estágio, categoria, status e motivo permitido. A interface mantém a correlação e a ação de retomada. Respostas brutas, senha, token, código completo, chaves e documentos não são registrados.

Foram exercitadas falhas de criação, lookup e finalização, recuperação da mesma identidade, invalidação/reemissão e classificação segura. Causa externa original: **não determinada sem acesso/logs autorizados do ambiente real**. Não se afirma correção de configuração remota.

O erro de upload informado está na fronteira navegador→gateway. O checklist distingue URL/origem/processo do gateway de projeto/chaves/bucket/policies no servidor. Bucket `company-media` permanece privado. `/health` confirma somente readiness local; não valida Auth/Storage externo. A autorização não foi relaxada para corrigir sintomas de mídia. Procedimento de diagnóstico e homologação em `upgrade.md`.

## Migration e preservação

A 033 é necessária para os novos estados comerciais, registros de aquisição, consentimentos, recorrências e grants. É aditiva/transacional, sem reset. Migrations **001–032: 32 arquivos comparados, zero diferenças**. Ativos aprovados também comparados, sem alterações de bytes. Evidência: `reports/syzia-033/integrity.json`.

O upgrade foi aplicado a uma base PGlite na 032 com fixtures preenchidas de Auth/pessoas/equipe, organizações/vínculos, permissões, serviços/categorias, agenda, página/mídia/portfólio, clientes, solicitações, conversa, orçamento, despesas, planos/assinaturas/trial e auditoria. A comparação cobriu todas as colunas/linhas preexistentes, ignorando apenas colunas novas adicionadas pela 033: **110 tabelas verificadas, 70 com dados, 712 linhas preservadas**. Inventário por tabela em `upgrade-tables.json`. Métricas financeiras também foram verificadas antes/depois da geração da previsão.

## Validação executada

- **20 cenários SQL/PGlite**, incluindo upgrade populado, grants, isolamento, identidade/contexto, elegibilidade, trial manual, cancelamento, falha/regularização, bloqueio público e de RPC, recorrências e histórico financeiro.
- **48 testes Node/backend**, incluindo portas HTTP/origem, cadastro, identidade, pagamento server-side, diagnóstico sanitizado, provisionamento/retomada, código temporário e adapter local de mídia.
- **8 jornadas Playwright**, cobrindo mídia/catálogo/portfólio, site→plano→cadastro→onboarding, lead/aquisição, criação administrativa e primeiro acesso, recorrência, matriz de cores, uma/várias empresas e colisão de username. A matriz inclui vermelho/amarelo/azul/magenta × claro/escuro e checagem adicional de contraste nas superfícies e CTAs afetados.
- **Typecheck + build de produção local + inspeção de bundle** executados. Nenhuma publicação.

Resultados estruturados, logs e screenshots estão em `reports/syzia-033/`. `validation.json` reúne o resultado final. As repetições focadas para confirmar correções/evidências não são contadas como cenários adicionais. Testes antigos não executados nesta rodada permanecem no pacote como histórico; não foram apresentados como uma nova auditoria mestre.

Ocorrências corrigidas durante a validação: seleção inicial de módulo para colaborador sem Home; possibilidade de editar username após colisão no cadastro; superfícies claras remanescentes no tema escuro; leitura prematura de screenshots/cores antes de carregar a página pública; seletores de testes que ainda esperavam rotas, marca ou elementos antigos. O teste legado do assunto de e-mail passou a esperar SYZIA. Avisos de diagnóstico sem status, durante descarregamento/troca de páginas da demo, não foram tratados como prova de falha de autorização; as ações e estados foram verificados nos cenários específicos.

## Limites e entrega

Não executados: Supabase/Auth/SMTP/Storage/PostgREST reais, provider/cobrança reais, concorrência PostgreSQL nativa, restauração externa, deploy ou domínio. Validação local não equivale a homologação externa. Os documentos legais continuam sujeitos à revisão do proprietário.

O pacote exclui node_modules, build, credenciais/configurações locais e caches; inclui lockfile, exemplos de ambiente, todos os módulos anteriores, fixtures, scripts, testes e ativos. `MANIFEST.json` contém hashes de todos os arquivos entregues; o ZIP é conferido pelo empacotador. `changed-files.md` lista alterações contra a base 032.

Entrega encerrada. Próxima etapa: homologação pelo proprietário conforme o guia, sem iniciar nova fase automaticamente.
