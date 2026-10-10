# Relatório final — Auditoria funcional mestre VIRELOQ

Entrega cumulativa das Fases 2–8, refinamento incremental 029. Referência: especificação de 60 itens em `docs/master-audit/request.md`. Não constitui nova fase nem homologação externa.

## Resultado e escopo

A abertura empresarial permanece separada de provisionamento e gestão de usuários. “Minhas empresas” e “Abrir empresa” levam ao ambiente da organização, reutilizando o onboarding e os módulos existentes. O refinamento mestre muda a autorização operacional: sem ADM responsável, o Super Admin configura pela autoridade global; com ADM responsável, solicita suporte temporário ou utiliza emergência excepcional auditada. Nenhum membership artificial foi criado.

A jornada completa de 34 etapas passou em navegador: empresa nova sem ADM, configuração, persistência, primeiro ADM, funcionário, publicação, consumidor, atendimento, orçamento, agenda, cancelamento, métricas, suporte, revogação, emergência, desativação/reativação e isolamento. A regressão final da demo passou: 58/58 casos, sem falhas, flakes ou skips. Ao todo foram aprovados 817 casos locais (716 SQL/ferramentas + 43 interface + 58 demo), sem contar repetições nem somar as 34 etapas como testes independentes.

O desenvolvimento local está consolidado. Supabase/Auth/JWT/PostgREST/Storage/SMTP/provider reais não foram acessados. Concorrência PostgreSQL nativa foi tentada, mas não executou por restrição de usuário do ambiente. Não houve deploy, pagamento, e-mail real, dados reais ou vídeo.

## Arquitetura encontrada e preservada

React/TypeScript organiza três contextos: administração VIRELOQ, ambiente empresarial e consumidor. Supabase Auth continua responsável pelas senhas; o servidor resolve código/username para a identidade técnica interna. RPCs transacionais e RLS/FORCE RLS controlam dados. A interface não é a autoridade de segurança.

CompanyExperience e `onboarding_context` continuam sendo o onboarding único, com progresso por registros e tour opcional por gestor/empresa. Página pública, catálogo, serviços/adicionais, portfólio, manual/autonomia, consumidor, clientes, orçamento, agenda, Central, Comercial, pendências, Analytics e billing existente foram preservados. O checklist foi extraído para um helper privado reutilizado pela consulta global, sem criar etapas ou progresso paralelos.

A Central mantém a unidade ticket e suas atribuições/autonomia. O orçamento feito por atendente continua sujeito a essas regras; não se promoveu o ADM ou colaborador a atendente para facilitar testes. Trial, histórico antifraude e billing simulado mantêm a estrutura existente.

## Divergências, causas e correções

| Achado | Causa | Correção e efeito |
|---|---|---|
| A 028 autorizava operação global irrestrita após existir ADM responsável | Helpers globais não distinguiam responsabilidade | A 029 exige suporte válido nas RPCs/RLS operacionais; preserva cadastro, trial, planos e métricas globais |
| Não havia solicitação/decisão/expiração de suporte | Modelo e interface ausentes | `support_requests`, `support_visits`, RPCs e área Suporte VIRELOQ com aviso interno ao ADM |
| Papel/membership ou atendente global poderia fornecer caminho alternativo | Predicados independentes em Empresa/Central/Comercial/equipe | Helpers revisados para que autoridade global siga o mesmo regime; teste de membership sombra |
| Código empresarial não lembrava o nome | Gerador de 12 hexadecimais | Novos códigos usam prefixo normalizado até 8 caracteres + 5 hexadecimais aleatórios; estáveis e distintos do slug |
| Métricas globais eram incompletas | Conjunto anterior limitado à fase de Analytics | Agregados administrativos, trial, suporte, adoção e atenção; sem detalhes de clientes ou receita presumida |
| Estado pendente confundia primeira ativação e recuperação | UI dependia principalmente do estado da conta | Metadados de primeira ativação/validade e textos específicos; responsabilidade persiste durante reset |
| ADM com profile suspenso ainda podia aparecer como responsável no cadastro | Fallback de setup_state considerava apenas membership ativo | Estado administrativo deixa de retornar ready sem support_responsible; teste de retorno à gestão VIRELOQ verifica também o rótulo |
| Reset podia deslocar a data de primeira ativação | Timestamp sobrescrito ao finalizar ativação | `coalesce(activated_at, clock_timestamp())`; caso adicional confirma identidade e data preservadas |
| Aviso interno sobrepunha a tela | Uso de `aside` herdava CSS da navegação lateral | Aviso usa `div`, mantendo semântica e fluxo do conteúdo |
| Seletor de papel não tinha nome acessível explícito | Rótulo insuficiente para navegação/teste assistivo | `aria-label="Papel"` |

Outros ajustes são pontuais: mensagens de erro de suporte, retorno claro à Administração, identificação da empresa e texto de publicação. Não houve reescrita de módulos, nova dependência nem alteração do lockfile.

## Autorização, isolamento e responsabilidade

Um ADM responsável exige vínculo ADM ativo, profile e Auth elegíveis e ativação empresarial concluída. Quando a empresa exige aceite institucional, deve existir aceite. Uma nova versão de termos não desfaz responsabilidade já assumida; redefinição de senha também não reabre acesso irrestrito. ADMs legados elegíveis continuam responsáveis; a adoção de uma identidade cujo vínculo antecede a conta empresarial não a torna uma empresa sem dono.

Sem ADM válido, o Super Admin usa autoridade global sem criar vínculo. Com ADM válido, `company_can_manage/read`, elegibilidade da Central, Comercial e provisionamento verificam suporte. Inicialização, reserva, retomada, consulta/gestão de equipe e mudança de membership também foram revisadas. Usuários empresariais continuam limitados à própria organização e às funções concedidas. A existência de papel global ou de membership adicional não contorna o bloqueio.

As duas tabelas privadas novas têm FORCE RLS, sem grants diretos aos clientes, sem exclusão/truncamento; visitas são imutáveis. Helpers internos não podem ser executados pelo cliente. Consultas de suporte/Analytics não escrevem. Alterações e entradas confirmadas são auditadas com o ator real; o histórico empresarial de suporte é separado da Auditoria global. Não se promete auditoria de cada SELECT: o registro de visita representa entrada confirmada no ambiente, e os comandos relevantes geram eventos próprios.

O painel revalida suporte a cada cinco segundos, no foco e no vencimento, removendo o conteúdo quando perde acesso. No servidor, a próxima operação já é recusada após revogação confirmada. Suspender e reativar empresa não ressuscita autorizações. A empresa e o ator compõem a chave de contexto; logout/troca desmontam o conteúdo transitório. Billing global e links de diagnóstico administrativo não concedem operação empresarial.

## Suporte normal e emergência

Suporte normal exige motivo de 15–500 caracteres e prazo solicitado de 1, 4 ou 24 horas. Um ADM válido decide, registrando sua identidade; o solicitante nunca aprova a própria solicitação. O prazo começa na aprovação, calculado no banco. ADM pode recusar/revogar; o solicitante pode encerrar sua solicitação. A empresa vê pedidos, acessos ativos e histórico próprio, sem depender de SMTP.

Emergência tem área e confirmação separadas, motivo obrigatório, banner explícito e prazo de 15 minutos. Limites: uma emergência por organização a cada 30 minutos, três por ator/dia; dez solicitações totais por ator/dia e três normais por empresa/hora. Há chave idempotente, uma solicitação normal pendente por ator/empresa e serialização transacional compartilhada com a Fundação. Esses limites foram testados localmente; concorrência independente continua pendente.

## Códigos, estados e decisões preservadas

Novos códigos são gerados no servidor, com normalização Unicode, remoção de caracteres não ASCII, prefixo alfanumérico e aleatoriedade. Nomes sem prefixo transliterável usam EMPRESA. UNIQUE e no máximo 32 tentativas impedem loop ilimitado. Nome continua sujeito à constraint existente de 2–120 caracteres. Código não é senha e não aparece sem finalidade na página pública; nome/slug não o alteram.

Códigos anteriores à 029 foram mantidos para preservar logins já distribuídos. **DECISÃO DE PRODUTO PENDENTE:** converter códigos legados e, se desejado, definir política de aliases/transição. Nenhuma conversão destrutiva foi presumida. Datas antigas de ativação também foram mantidas: não se inventou a primeira data histórica quando ela já havia sido sobrescrita antes da 029.

Estados administrativos, configuração empresarial, ativação/recuperação de usuário e estado comercial são distintos. O primeiro ADM continua sendo a mesma identidade provisionada antes do login. Falha de SMTP não desfaz criação. Último ADM, exclusão conservadora, trial antifraude e billing existentes permanecem protegidos.

Classificação dos fluxos: código+username+senha e primeiro acesso temporário = **ATIVO**; convites 025 e relatórios anteriores = **LEGADO/HISTÓRICO**; endpoints de convite empresarial e autocadastro = **DESCONTINUADOS** como caminho de entrada; provider real, regras comerciais adicionais e vídeo = **FUTURO / NÃO AUTORIZADO NESTA TAREFA**. Minutas de Termos/Privacidade requerem revisão e dados do proprietário; provider, carência, downgrade, reembolso e retenção não foram inventados.

## Métricas e fonte de verdade

`analytics_platform` calcula totais atuais e eventos/coortes de período sem misturá-los em taxas indevidas. A janela global usa UTC e limite exclusivo no dia seguinte ao fim; a empresa mantém o timezone existente America/Recife. O dicionário em `docs/master-audit/metrics.md` define 22 grupos de métricas, respectivas fontes, filtros e estados. Métricas empresariais detalhadas continuam documentadas em `docs/phase-7-metrics.md`.

Receita global é NULL/indisponível. Assinatura e cobranças disponíveis são simuladas. Valor orçado/aprovado, execução e recebimento continuam diferentes. Conversão de trial é coorte iniciada no período atualmente convertida, não receita nem evento necessariamente ocorrido naquele dia. “Usuários ativos” distingue habilitação empresarial de sessão com atividade recente; perfis consumidores não são apresentados como usuários empresariais.

## Testes executados e resultados

Ambiente: Node/npm, TypeScript/Vite, PostgreSQL embarcado PGlite e Chromium/Playwright headless. Navegador e HTTP executam a aplicação local; Auth e integrações externas usam adapters controlados. Dados exclusivamente fictícios. Testes SQL locais não representam PostgREST/JWT reais nem concorrência PostgreSQL independente.

- **716 casos SQL/ferramentas**, distribuídos em **33 comandos**, aprovados após as correções e repetições explícitas abaixo.
- **43 testes de interface**, aprovados.
- **58 testes finais da demo aprovados, zero falhas, flakes e skips.** A primeira bateria tinha 57 casos (53 aprovados/4 falhas); a final inclui também o novo dia de uso integrado.
- **Dia de uso: 34/34 etapas**, aprovado como um caso de navegador; não somado como 34 testes independentes.
- `npm ci` normal, com scripts habilitados, em cópia limpa: aprovado; 86 pacotes instalados. `npm run build`, TypeScript e `check:bundle`: aprovados. Marcador server-only e nome da variável privilegiada ausentes no bundle. Não foi executada auditoria externa de advisories; não houve atualização de dependências.
- Upgrade 028→029: snapshot de organizações, memberships, configurações, códigos, guias/progresso e contagens de auditoria/trial/billing preservado; zero aprovações retroativas.
- `test:master:native`: tentativa terminou com exit 2, sem executar casos: ambiente não permite mapear usuário não root para cluster descartável. **NÃO APROVADO/NÃO EXECUTADO** quanto à concorrência nativa.

Contagens vêm dos resultados de cada comando, não do número de assertions internas. Repetições não são somadas novamente. SQL mestre inclui 18 casos; a suite de acesso inclui o novo caso de primeira ativação preservada. Tabela completa:

| Comando | Casos aprovados | Resultado inicial | Resultado final |
|---|---:|---|---|
| `npm run test:master` | 18 | PASS | PASS |
| `npm run test:workspace` | 19 | PASS | PASS |
| `npm run test:activation` | 44 | PASS | PASS |
| `npm run test:access` | 66 | FAIL — corrigido/reexecutado | PASS |
| `npm run test:vireloq` | 52 | PASS | PASS |
| `npm test` | 68 | FAIL — corrigido/reexecutado | PASS |
| `npm run test:multisegment` | 5 | FAIL — corrigido/reexecutado | PASS |
| `npm run test:company-page` | 6 | PASS | PASS |
| `npm run test:onboarding` | 13 | FAIL — corrigido/reexecutado | PASS |
| `npm run test:operations` | 16 | FAIL — corrigido/reexecutado | PASS |
| `npm run test:company` | 71 | FAIL — corrigido/reexecutado | PASS |
| `npm run test:homologation-tools` | 10 | PASS | PASS |
| `npm run test:company-tools` | 5 | PASS | PASS |
| `npm run test:consumer` | 35 | PASS | PASS |
| `npm run test:presence-payments` | 28 | PASS | PASS |
| `npm run test:central` | 40 | FAIL — corrigido/reexecutado | PASS |
| `npm run test:commercial` | 54 | PASS | PASS |
| `npm run test:billing` | 50 | FAIL — corrigido/reexecutado | PASS |
| `npm run test:trial` | 42 | PASS | PASS |
| `npm run test:trial-upgrade` | 1 | PASS | PASS |
| `npm run test:billing-provider` | 8 | PASS | PASS |
| `npm run test:billing-upgrade` | 1 | PASS | PASS |
| `npm run test:billing-tools` | 3 | PASS | PASS |
| `npm run test:analytics` | 27 | PASS | PASS |
| `npm run test:analytics-upgrade` | 1 | PASS | PASS |
| `npm run test:analytics-tools` | 2 | PASS | PASS |
| `npm run test:commercial-upgrade` | 1 | PASS | PASS |
| `npm run test:commercial-tools` | 5 | PASS | PASS |
| `npm run test:central-tools` | 5 | PASS | PASS |
| `npm run test:images` | 9 | PASS | PASS |
| `npm run test:consumer-tools` | 7 | PASS | PASS |
| `npm run test:demo` | 1 | PASS | PASS |
| `npm run test:config` | 3 | PASS | PASS |

Evidências: `reports/master-audit/validation.json`, logs iniciais e finais nessa pasta, resultados JSON das suites, `reports/demo-browser-results.json`, screenshots desktop/tablet/mobile e `reports/master-day/support-desktop.png`. O arquivo de evidência do dia registra 01–34.

## Falhas iniciais e repetições controladas

1. Oito dos 33 comandos iniciais falharam após a mudança de regra: access, Fundação, multissegmento, onboarding, operations, company, central e billing. Fixtures antigas inicializavam/alteravam empresas pelo Super Admin irrestrito da 028. Foram ajustadas para o ADM legítimo da organização ou para solicitação/aprovação real do suporte. Não se adicionaram memberships artificiais nem grants sem decisão. Todos os oito passaram na repetição registrada. SQL mestre e acesso foram executados novamente após os ajustes finais de responsabilidade/data/auditoria. A revisão final encontrou ainda o fallback visual de ADM suspenso: ajustado na RPC e coberto pela asserção de setup_state no caso de retorno à gestão VIRELOQ. Essa mudança final afeta a projeção de estado, não os componentes de navegador.
2. A primeira regressão de demo retornou 53/57 aprovados. Dois casos esperavam formato hexadecimal antigo de código; passaram ao validar o novo formato. Um caso encerrava o contexto do ADM antes da resposta de revogação, cancelando a requisição; passou após esperar a confirmação. O caso de rascunho perdeu Observações durante a execução que coincidiu com alterações de fonte; a causa não foi provada como defeito funcional. A repetição isolada, sem alterar código, passou nos seis formulários durante foco e refresh periódico; também passou na bateria final de 58 casos.
3. A nova jornada integrada foi construída e depurada em execuções explícitas, preservadas em `master-day-*.log`: espera do formulário antes de preencher regras; nomes acessíveis/seletores corretos; texto legal conforme a tela; nome público inclui subtítulo; retorno comercial verificado antes da mensagem do cliente (que o cancela corretamente); ação da Central executada pelo atendente com autonomia; rótulos reais Desativar/Reativar. A iteração final passou 34/34. Esses ajustes não mudaram regras de negócio para satisfazer o teste.
4. Um nome de um caractere usado no teste de código era inválido pela constraint anterior de mínimo dois; fixture corrigida, sem relaxar schema. Durante a verificação visual foi corrigida a sobreposição real do aviso de suporte pelo CSS de aside. O teste de papel revelou falta de label acessível, corrigida no componente.

Não houve retry automático silencioso. Logs anteriores permanecem identificados como evidência histórica; não são o resultado vigente. Avisos npm sobre configuração de proxy e Node sobre NO_COLOR/FORCE_COLOR não impediram instalação/testes.

## Navegação, jornadas e responsividade

Desktop e celular cobrem abertura de empresa sem ADM, ADM pendente, transição para responsável, bloqueio normal, solicitação/aprovação/revogação, painel pronto, retorno global e separação de Pessoas e acessos. A regressão preserva jornadas do consumidor, ADM, atendente próprio/compartilhado e operações manuais.

O dia integrado usa Super Admin desktop (1366 px), ADM tablet (820 px), funcionário e consumidor celular (390 px). Registra a mesma empresa e solicitação, conferindo persistência, orçamento, aprovação, reserva, Home, encerramento de retorno e cancelamento refletido. Não é coleção de RPCs isoladas. Screenshots e checks de overflow complementam os testes; não substituem teste com tecnologia assistiva real.

## Migration, integridade e atualização

Nova migration: `supabase/migrations/202609200029_authorized_support.sql`. As 28 migrations anteriores permanecem byte a byte iguais à entrega-base 028. Hashes individuais estão em `docs/master-audit/base028-sha256.json`; `node scripts/verify-historical-migrations.mjs` verifica 001–028. O lockfile e os exemplos de ambiente também são preservados.

Na verificação final, o ZIP anterior (versão 18) estava truncado, sem diretório central, durante uma captura histórica. Seu MANIFEST foi recuperado de entrada completa com CRC válido: 1.060 arquivos listados, todos presentes na árvore de trabalho. Os hashes das 28 migrations, lockfile e exemplos de ambiente conferem; 001–027 também foram comparadas com o ZIP íntegro da base anterior. Evidência: `reports/master-audit/base-archive-integrity.json`. O novo ZIP é reconstruído integralmente, fechado e validado por CRC e SHA-256 antes de substituir o arquivo de entrega; não reutiliza o arquivo truncado.

O ZIP conserva todos os arquivos listados no manifesto da base e acrescenta código, testes, relatórios e documentação. `reports/master-audit/consolidation.json` lista arquivos alterados/adicionados e comparação com a base; `MANIFEST.json` contém SHA-256 dos arquivos do pacote, exceto de si próprio. Dependências, caches e resultados temporários do runner não entram; evidências selecionadas ficam em reports. Somente exemplos de ambiente entram, sem `.env`/`.env.server` preenchidos ou credenciais reais.

Atualizar sem reset: preservar envs/backup, substituir arquivos consolidados, executar `npm ci`, aplicar somente 029 numa instalação 001–028, build, reiniciar processos e executar roteiro. Detalhes em `docs/master-audit/upgrade.md`. Não reaplicar migrations históricas.

## Pendências e aceite

A matriz final apresenta os 60 requisitos; a matriz de permissões cobre seis papéis e ações reais. A decisão sobre conversão dos códigos antigos e as dependências externas são explícitas, sem afirmar conformidade irrestrita.

Pendentes: Supabase de homologação, Auth/senhas/JWT/renovação, PostgREST/schema cache, Storage/URLs assinadas, SMTP/recebimento, concorrência nativa/remota, backup/restore e performance em infraestrutura real. Provider e cobrança reais seguem não configurados. Scripts e roteiro estão em `docs/master-audit/external.md` e guias históricos. A autorização atual não permite executar esses serviços.

Entrega restrita ao projeto cumulativo e seus relatórios. Nenhuma Fase 9, produção, deploy, contratação, e-mail real, dados reais, cobrança ou retomada de vídeo.
