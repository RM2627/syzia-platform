# Revisão pré-homologação — Versatilidade multissegmento

Data: 18/09/2026. Revisão cumulativa das Fases 2–8 e complementos anteriores, sem nova fase.

**Conclusão:** a mesma estrutura atende naturalmente aos três cenários solicitados, dentro dos fluxos administrativos existentes. A estética automotiva continua com antes/depois, orçamento e agenda; o designer usa imagem comum e orçamento; a nutricionista usa apresentação, consulta e agenda sem portfólio. Não foi necessário alterar banco, modelos de contratação ou arquitetura. Foram corrigidos textos fixos e um problema de contraste encontrado na inspeção do cenário sem capa.

**TESTADO LOCALMENTE. HOMOLOGAÇÃO EXTERNA PENDENTE.** Não houve Supabase real, deploy, publicação externa, serviço pago ou dado real.

## Auditoria antes da alteração

A inspeção prévia está em `docs/multisegment-audit.md`. Foram examinados página pública/central, portfólio, schema/constraints, serviços/preços, campos dinâmicos, textos/placeholders, estados vazios, onboarding, publicação/preview e fixtures.

| Classificação | Achado | Ação e justificativa |
|---|---|---|
| Problema real | Títulos fixos “Escolha o cuidado que precisa” e “Cuidado que você pode ver” enquadravam qualquer empresa como serviço de cuidado/resultado visual. | “Encontre o serviço que precisa” e “Conheça nosso trabalho”. Mesma estrutura, linguagem compatível com projetos, manutenção e consultas. |
| Problema real | Textos fixos do cabeçalho/arte repetiam “cuidado” independentemente do negócio. | Referências neutras a serviços, atendimento e facilidade; não alterados nomes e descrições próprios da empresa. |
| Melhoria de clareza necessária | Atalho do portfólio enfatizava comparações antes/depois, apesar de o modelo já ser flexível. | Descrição cita trabalhos e projetos; ajuda explica imagem única/galeria, comparação opcional e possibilidade de página sem portfólio. |
| Problema real | “Planeje sua visita” pressupunha presença no estabelecimento, inclusive para serviço online/domiciliar. | “Planeje seu atendimento”, preservando endereço/horários existentes. |
| Problema real observado visualmente | Página sem capa herdava texto escuro sobre fundo escuro na arte abstrata padrão. | Contraste corrigido somente no fallback sem capa. Fotos/capas existentes permanecem iguais. Não se exige fotografia para uma página utilizável. |
| Lacuna de teste | Ainda não havia cenário de consulta administrativa sem portfólio. | Fixture C e testes, sem módulo profissional ou clínico. |

Não foram substituídos indiscriminadamente os textos. Expressões genéricas como atendimento, orçamento, serviço, trabalhos e informações comerciais foram mantidas. A terminologia automotiva da empresa A e a referência a transformação de ambientes da empresa B são dados dessas empresas, não dependências do produto.

## Pontos genéricos preservados

- Portfólio já usa `gallery` por padrão, aceita 1–4 imagens e exige duas somente em `before_after`. Uma foto, trabalho, projeto ou resultado não requer um novo tipo de conteúdo.
- Comparação antes/depois, ordem, ativação/desativação, título, descrição, serviço associado, mídia, publicação e snapshots permanecem intactos.
- Portfólio é opcional no onboarding persistido e é omitido da página pública quando vazio. Nenhuma exigência de fotos foi acrescentada.
- Serviços já suportam preço fixo, a partir de e sob consulta; adicionais, duração, disponibilidade, perguntas configuráveis, orçamento e agendamento direto continuam iguais.
- Nenhum campo de veículo ou limpeza é obrigatório no produto: as perguntas sobre carro pertencem à fixture A. B e C usam perguntas próprias pela mesma estrutura.
- Logo/capa/paletas e fallback abstrato já permitem identidades distintas. Não foram criados templates por profissão.
- A central Página da empresa, URL única `/empresa/:slug`, cópia do link, editores, FAQ, horários, disponibilidade, controles de publicação e prévia foram preservados.
- RLS/FORCE RLS, autorização, auditoria, isolamento, cálculo server-side, concorrência e idempotência não foram alterados.

**Hipóteses que não justificaram mudanças:** novo schema de portfólio; obrigatoriedade de selecionar profissão; criação de categoria profissional; modelos de preço adicionais; páginas/templates diferentes; CMS/page builder; módulos especializados; reescrita de Auth, publicação ou agenda.

## Estrutura e migrations

**Nenhuma alteração estrutural. Nenhuma migration adicionada. Nenhuma tabela, constraint, policy ou RPC criada/modificada.** As 24 migrations históricas permanecem byte-identical ao pacote anterior. Evidência: `reports/multisegment-migrations.json`.

O cenário C é criado exclusivamente em PGlite descartável pela fixture com bloqueio explícito a outros bancos. Usa os mesmos comandos de empresa, publicação, perguntas, assinatura fictícia e trial existentes. Não cria prontuário, diagnóstico, prescrição, evolução, histórico médico ou entidade clínica. A escolha Presencial/Online é uma pergunta administrativa do serviço.

## Avaliação dos três cenários

| Cenário fictício | Página e portfólio | Contratação exercitada | Resultado local |
|---|---|---|---|
| A — MS Auto Details | Identidade automotiva existente, galeria e antes/depois de duas imagens | Solicitação, preço calculado e reserva; regressão completa da jornada anterior | Aprovado |
| B — Estúdio Horizonte | Identidade de interiores existente; projeto com uma imagem comum, sem rótulos Antes/Depois | Serviço sob consulta, solicitação e envio de proposta final pelo gestor; demais preços existentes preservados | Aprovado |
| C — Clara Nutrição | Perfil/descrição, cor própria, serviço de consulta, sem capa e sem portfólio | Pergunta de modalidade, identificação/consentimento administrativo, solicitação, consulta de disponibilidade, confirmação e acompanhamento | Aprovado |

C também foi validado pelo gestor: checklist real fica pronta sem portfólio, tutorial permanece opcional, Página da empresa apresenta a URL correta e o editor de portfólio inicia em galeria. Gestores separados não recebem acesso administrativo às outras empresas. A projeção pública não contém UUIDs internos ou manual privado.

### Como visualizar localmente

Execute `npm ci` e `npm run dev:demo`, conforme README. A demo padrão contém:

- `/empresa/ms-auto-ficticia` — gestor `admin@example.invalid`;
- `/empresa/horizonte-ficticio` — gestor `adminb@example.invalid`;
- `/empresa/clara-nutricao-ficticia` — gestor `adminc@example.invalid`.

Senha fictícia: `FictitiousPassword123!`. Reiniciar a demo recria os dados descartáveis. O modo mínimo técnico não inclui C. Não usar esse servidor/fixture em produção nem sobre banco real. Uma instalação existente não precisa ter seus dados/configurações reiniciados para receber esta revisão, pois não há alteração de schema.

## Arquivos de implementação alterados

| Arquivo | Alteração |
|---|---|
| `src/consumer/Consumer.tsx` | Oito textos fixos de apresentação mais neutros |
| `src/consumer/CompanyPage.tsx` | Descrição do atalho Portfólio |
| `src/consumer/PresenceAdmin.tsx` | Ajuda sobre imagem única, galeria, antes/depois e opcionalidade |
| `src/consumer/consumer.css` | Contraste da arte abstrata quando não existe capa |
| `scripts/dev-consumer-demo.mjs` | Inclusão da fixture C na demo padrão e login fictício C |
| `tests/fixtures/multisegment.mjs` | Massa administrativa C, somente PGlite |
| `tests/multisegment.test.mjs` | Cinco casos SQL cobrindo A/B/C, prontidão e isolamento |
| `tests/demo-browser/multisegment.spec.ts` | Nove casos de navegação, responsividade, solicitação, agenda e gestão |
| `tests/demo-browser/company-page.spec.ts` | Teste de autorização usa contextos independentes por identidade em vez de apagar localStorage com cliente Auth em execução |
| `tests/browser/consumer.spec.ts` | Atualização dos dois títulos esperados; mesmos testes/asserções funcionais |
| `package.json` | Comando `test:multisegment`, incluído em `test:local` |

Também atualizados README/AGENTS e adicionados auditoria, guia externo, relatório e evidências. Nenhuma dependência nova; lockfile preservado. A lista completa de mudanças em relação ao pacote anterior acompanha `reports/multisegment-files.json`.

## Testes e regressão

As suítes SQL principais executadas totalizam **456 casos aprovados**: Fundação 68, Empresa 71, Consumidor 35, presença/pagamentos opcionais 28, Central 40, Comercial 54, Analytics 27, Billing 50, Trial 42, onboarding 13, operação 16, central Página da empresa 7 e multissegmento 5. Ambiente PGlite local, com claims simuladas; não é Supabase real.

Foram preservados os testes históricos e executadas as regressões de publicação/snapshots, portfólio/mídia privada, serviços/adicionais/perguntas, orçamento, agenda, onboarding, permissões, RLS/isolamento, comercial, métricas, billing e trial. Também passaram testes de upgrade, ferramentas, sanitização de imagens, configuração, demo HTTP e provedor fictício.

Build/TypeScript e verificação de ausência de marcador server-only no frontend aprovados. Nenhuma nova dependência foi necessária.

| Script | Resultado local | Duração aproximada |
|---|---|---|
| `npm run test` | PASS | 4.0 s |
| `npm run test:multisegment` | PASS | 6.4 s |
| `npm run test:company-page` | PASS | 3.5 s |
| `npm run test:onboarding` | PASS | 4.0 s |
| `npm run test:operations` | PASS | 4.0 s |
| `npm run test:company` | PASS | 4.1 s |
| `npm run test:homologation-tools` | PASS | 3.3 s |
| `npm run test:company-tools` | PASS | 12.9 s |
| `npm run test:consumer` | PASS | 4.3 s |
| `npm run test:presence-payments` | PASS | 4.1 s |
| `npm run test:central` | PASS | 4.7 s |
| `npm run test:commercial` | PASS | 5.0 s |
| `npm run test:billing` | PASS | 4.8 s |
| `npm run test:trial` | PASS | 4.0 s |
| `npm run test:trial-upgrade` | PASS | 3.2 s |
| `npm run test:billing-provider` | PASS | 0.4 s |
| `npm run test:billing-upgrade` | PASS | 3.5 s |
| `npm run test:billing-tools` | PASS | 0.6 s |
| `npm run test:analytics` | PASS | 3.8 s |
| `npm run test:analytics-upgrade` | PASS | 3.3 s |
| `npm run test:analytics-tools` | PASS | 0.4 s |
| `npm run test:commercial-upgrade` | PASS | 3.6 s |
| `npm run test:commercial-tools` | PASS | 0.7 s |
| `npm run test:central-tools` | PASS | 0.7 s |
| `npm run test:images` | PASS | 0.6 s |
| `npm run test:consumer-tools` | PASS | 0.9 s |
| `npm run test:demo` | PASS | 4.4 s |
| `npm run test:config` | PASS | 0.8 s |
| `npm run build` | PASS | 1.4 s |
| `npm run check:bundle` | PASS | 1.7 s |

O resultado por comando está em `reports/multisegment-regression.json`, com logs em `reports/multisegment-runs/`. O teste específico consta de `reports/multisegment-sql.json`. Esses totais não somam repetições como casos novos.

A execução final de navegador aprovou **54 casos da suíte geral + 36 casos da demo = 90 casos únicos**, zero falhas na execução final. A demo inclui os nove testes específicos da revisão; a execução isolada desses nove não é somada novamente. Evidências: `reports/browser-results.json`, `reports/demo-browser-results.json`, `reports/multisegment-ui-regression.log` e `reports/multisegment-demo-regression.log`.

Foram inspecionadas capturas dos três cenários em desktop (1440×1000) e celular (390×844), incluindo o fallback corrigido da página C, em `reports/visual-multisegment/`. A regressão de página A/B e central administrativa inclui tablet (820×1180). Não foi alegado teste em dispositivos físicos.

## Falhas encontradas durante a validação

1. Na primeira execução da nova fixture, o tipo de pergunta foi escrito como `select`; a constraint existente exige `choice`. Corrigida somente a fixture. A constraint foi preservada e passou a receber o formato correto.
2. A inspeção da página C sem capa revelou contraste insuficiente no fallback. Aplicada correção CSS localizada e acrescentada asserção de cor no cenário C. Nenhuma exigência de imagem foi introduzida.
3. A primeira regressão completa da demo teve 35 aprovações e uma espera de autenticação no teste que apagava localStorage e trocava de usuário com o cliente Auth ativo. O teste passou a abrir contextos independentes por identidade, mantendo todas as asserções de negação de acesso. Nenhum ajuste/relaxamento de Auth ou autorização do produto foi feito para contornar isso. A execução inicial foi preservada em `reports/multisegment-attempts/`. Essa correção do teste não constitui diagnóstico nem homologação do comportamento de Auth real.

## Limitações mantidas

- Saúde: somente apresentação, contratação, agendamento, comunicação e acompanhamento administrativos. Campos livres não são um mecanismo de prevenção/classificação de dados clínicos; não os utilizar para prontuário ou coleta clínica. Não há certificação de software clínico ou conformidade regulatória específica declarada.
- Publicação continua usando a versão aprovada existente e sua relação histórica com o manual; desacoplamento continua sendo a decisão pendente documentada na revisão anterior. Não foi reestruturado nesta revisão.
- Portfólio continua limitado a imagens JPEG/PNG/WebP, 1–4 por trabalho, antes/depois com duas, limites atuais de mídia e quantidade. Não há editor de blocos, vídeos ou documentos editoriais novos.
- Agenda continua com um recurso ativo por empresa e as regras/timezone já suportados; não foi criada gestão clínica ou escala de profissionais.
- Aparência/fluxos permanecem compartilhados: não há rótulos específicos por profissão nem novos modelos de contratação.
- A inspeção visual usa Chromium em desktop/celular e a regressão existente cobre também tablet. Dispositivos físicos, outros navegadores e ambiente dedicado continuam pendentes.
- Auth/SMTP, PostgREST/Storage reais, RLS com JWT reais, concorrência independente em PostgreSQL nativo e backup/restauração permanecem com as pendências anteriores. Guias cumulativos preservados e roteiro específico em `docs/multisegment-homologation.md`.

A conclusão é válida para os fluxos administrativos testados e compatíveis com o escopo atual, não uma afirmação de cobertura de todas as necessidades de qualquer profissão. O produto segue usando uma única estrutura, sem complexidade estrutural adicional.

## Entrega

Projeto completo e cumulativo em `Projeto-Fase-8-Final.zip`, incluindo fonte, assets, todas as migrations byte-identical, scripts, fixtures, testes, relatórios, guias, configurações de exemplo, package.json, lockfile e MANIFEST com hashes. Não é uma entrega de patches.

Nenhuma homologação externa iniciada. Nenhum deploy, publicação externa ou dado real. Parar após a entrega e aguardar autorização.
