# SYZIA 061 — PROMPT ÚNICO DE IMPLEMENTAÇÃO
## SYZIA Insights + quantidade na contratação pública

**ORDEM DE EXECUÇÃO PARA O CHATGPT WORK.** Desenvolva efetivamente os dois módulos na base oficial, com código, testes e documentação. Não entregue apenas planejamento ou protótipo. Não faça push remoto, deploy, alteração de DNS, aplicação de migrations em produção, alteração de segredos ou mudanças financeiras sem autorização expressa.

## 1. Missão

Implementar, em uma única base integrada e com módulos tecnicamente independentes:

**A — SYZIA Insights:** blog especializado inicialmente em prestadores de serviços, com SEO, gestão editorial, editor, mídia, curtidas persistentes, compartilhamentos, métricas, captação de leads, demonstração autônoma e possibilidade futura de monetização.

**B — Quantidade na contratação pública:** permitir ao cliente escolher quantas unidades de um serviço deseja solicitar, quando habilitado pela empresa, com preço, duração, disponibilidade, orçamento e persistência consistentes.

Objetivo prioritário do blog: conquistar visitantes qualificados e os primeiros interessados/assinantes da SYZIA sem depender de prospecção fria ou anúncios pagos. Não prometer tráfego, resultados ou receita.

## 2. Fonte de verdade e preservação

- Repositório oficial: https://github.com/RM2627/syzia-platform
- Commit de referência conhecido: `6e9cacae053e964b063f0e533e0b752bdddaa869`; verificar o HEAD atual, histórico e integridade antes de trabalhar.
- Auditar frontend, backend, roteamento, build, autenticação, autorização, Supabase, Cloudflare, Render, páginas públicas, Studio comercial, leads, serviços, orçamentos, agendamentos e testes.
- A landing page comercial `conheca.usesyzia.com.br` pode ter sido publicada manualmente e não constar no GitHub. Não presumir seus arquivos nem sobrescrever a publicação. Validar o roteamento existente.
- Preservar integralmente Mercado Pago, assinaturas, trial, contratos históricos, webhooks, empresas, clientes, autenticação, páginas públicas e demais funcionalidades.
- Não alterar migrations históricas; somente migrations incrementais seguras, com compatibilidade e estratégia de rollback.
- Reutilizar infraestrutura, autenticação, componentes e módulos comerciais existentes quando compatíveis. Não duplicar o Studio, os leads ou o sistema de login.
- Usar a **logomarca oficial**, sem redesenhar ou reinterpretar por IA. Se o arquivo original não estiver acessível, registrar pendência e não inventar substituto definitivo.
- Prosseguir autonomamente com decisões técnicas locais e reversíveis. Não executar ações externas ou de produção sem autorização.

## 3. Identidade e arquitetura do Insights

Nome: **SYZIA Insights**. Assinatura: **Conhecimento para quem faz o negócio acontecer.** Visual oficial da SYZIA, mobile-first, legível, rápido, acessível, com aparência editorial e não de propaganda constante.

Rota preferencial: `https://usesyzia.com.br/blog`, somente se compatível com o roteamento real. Se não for, implementar alternativa preparada e documentar sem alterar DNS. Priorizar HTML público indexável via geração estática, SSR ou pré-renderização conforme arquitetura; não depender apenas de renderização client-side para SEO. Definir estratégia de cache, sitemap e publicação compatível com a infraestrutura existente.

## 4. Blog público

Implementar: página inicial com artigo em destaque, recentes, categorias, busca, artigos relacionados, populares apenas por dados reais, guias por profissão, materiais úteis, CTA discreto e rodapé institucional; páginas individuais com slug permanente, título, resumo, capa, autor, datas, tags, categoria, índice opcional, breadcrumbs, curtidas, compartilhamentos e recomendações; páginas de categoria, busca e estados vazios/404.

Categorias iniciais:
1. Agendamentos e atendimento.
2. Orçamentos e precificação.
3. Presença digital e portfólio.
4. Gestão de serviços.
5. Guias por profissão: estética automotiva, higienização, beleza, manutenção e serviços similares.

Não mostrar categorias vazias. Preparar expansão futura para empreendedorismo, finanças, negócios e tecnologia sem dispersar o foco inicial.

## 5. Gestão editorial privada

Integrar painel à administração existente, rota sugerida `/admin/insights` se compatível. **Somente administradores/editoras explicitamente autorizados**; assinantes comuns não terão acesso. Verificar autorização no servidor e RLS, não apenas na interface.

Implementar dashboard, listagem/filtros, criação, edição, duplicação, rascunho, prévia privada, agendamento, publicação, despublicação, arquivamento, restauração de revisões, categorias, tags, autores, SEO, biblioteca de mídia e estatísticas. Editor visual com títulos, parágrafos, ênfase, listas, links, imagens, legendas, citações, tabelas, blocos informativos e CTAs; sanitização contra XSS, salvamento seguro, proteção contra perda de alterações e edição concorrente. Biblioteca de mídia com upload seguro, formatos/tamanhos controlados, alt text, otimização e exclusão que respeite referências.

Publicação agendada por job confiável e idempotente, independente de navegador aberto, com fuso horário explícito, registro de falhas e reprocessamento. Atualizar sitemap/cache na publicação. Rascunhos e prévias não podem ser públicos nem indexáveis.

## 6. Curtidas e compartilhamento

Curtidas reais, persistentes no banco, com botão curtir/descurtir, contador e estado visual. Sem contagens fictícias. Usuários autenticados vinculados à identidade; visitantes anônimos podem curtir sem cadastro mediante identificador pseudônimo de primeira parte, proteção antiabuso e rate limit, sem fingerprinting invasivo. Operações atômicas/idempotentes, unicidade e prevenção de corridas; documentar que não é possível impedir todas as duplicações entre dispositivos ou após limpeza de dados. Não expor identidades publicamente. Métricas por artigo no painel.

Compartilhamento via WhatsApp, LinkedIn, Facebook, copiar link e Web Share API quando disponível, com fallback. Usar URL canônica e metadados Open Graph/Twitter Cards. Registrar **cliques de intenção de compartilhamento**, não afirmar que o compartilhamento foi concluído sem confirmação.

## 7. Captação de clientes pelo blog

Jornada: **pesquisa orgânica → artigo útil → CTA contextual → demonstração real da SYZIA → interesse → eventual assinatura**.

- CTAs configuráveis por artigo/categoria, discretos e relevantes ao problema: agendamento, orçamento ou presença digital.
- Reutilizar o mecanismo de demonstrações existente; permitir exploração autônoma quando o fluxo atual for seguro para visitantes. Não criar uma demo paralela desnecessária.
- Formulário opcional de interesse: nome, e-mail, segmento e principal necessidade, com validação, antispam, confirmação, deduplicação e consentimento apropriado. Integrar aos leads comerciais existentes se compatível, preservando invariantes e permissões.
- Registrar origem: artigo, categoria, CTA, data e UTMs permitidas. Medir visitas, cliques para demonstração, formulários válidos e conversões atribuíveis apenas quando verificáveis.
- Não criar assinaturas automaticamente, nem alterar checkout, Mercado Pago ou regras de trial.
- Conteúdo útil mesmo para quem não compra. Sem pop-ups invasivos ou promessas falsas.

## 8. Analytics e privacidade

Painel por artigo/categoria/período com publicados, rascunhos, agendados, visualizações, visitantes únicos **estimados e com método declarado**, curtidas, cliques de compartilhamento, cliques em CTA, acessos à demonstração, leads e taxas de conversão com denominador explícito. Filtrar bots e eventos repetidos quando possível. Não misturar visualização, visitante e lead. Coleta mínima, retenção adequada, LGPD, controles de acesso e ausência de pixels publicitários sem autorização. Preparar integração com Google Search Console, sem inventar dados do Google.

## 9. SEO e conteúdo inaugural

Implementar HTML semântico e indexável, títulos e descrições exclusivos, canonical, sitemap XML de páginas públicas, robots.txt, JSON-LD pertinente, breadcrumbs, Open Graph, imagens otimizadas e alt text, links internos, paginação, redirecionamentos 301 para slugs alterados, 404 adequado, acessibilidade e Core Web Vitals. Administração, rascunhos e prévias privados não indexáveis. Não prometer posições no Google.

Criar **cinco artigos completos, originais e práticos, como rascunhos não publicados**:
1. Como organizar agendamentos de clientes em um pequeno negócio.
2. Como criar um orçamento profissional para prestação de serviços.
3. Como montar um portfólio digital que transmita confiança.
4. Como organizar solicitações recebidas pelo WhatsApp.
5. Como melhorar a apresentação online de um prestador de serviços.

Cada artigo deve ter intenção de busca, exemplos úteis, boa estrutura, SEO, links internos quando disponíveis e CTA para funcionalidade real. Não inventar estatísticas, depoimentos ou resultados.

## 10. Monetização futura

Preparar arquitetura extensível para AdSense, afiliados, materiais digitais e conteúdo patrocinado, com identificação de publicidade e espaços configuráveis. **Não ativar anúncios, rastreamento publicitário ou cobranças nesta implementação.** A prioridade é aquisição de assinantes; monetização editorial só após validação de tráfego e qualidade.

---

# MÓDULO B — QUANTIDADE DE SERVIÇOS

## 11. Auditoria e configuração

Auditar cadastro/edição de serviços, quantidades internas já existentes, preço, duração, seleção pública, solicitações, orçamentos, aprovação, agenda, notificações e banco. Reutilizar estruturas atuais sempre que seguro. Adicionar configuração individual **Permitir seleção de quantidade pelo cliente**, desligada por padrão nos serviços existentes, com quantidade mínima/máxima, unidade de medida e regra de duração: fixa, proporcional ou sujeita a confirmação manual. Validar inteiros positivos e limites no servidor.

Não confundir quantidade com variação: sofá de dois lugares, sofá de três lugares, colchão de casal e solteiro podem continuar serviços separados; quantidade é o número de unidades daquele serviço.

## 12. Interface de contratação pública

Quando habilitado, exibir seletor acessível `− 1 +`, com limites, preço unitário e total estimado atualizado. Exemplo meramente ilustrativo: higienização de colchão R$ 100 por unidade × 2 = R$ 200. Não fixar esse preço no sistema. Serviços sem habilitação preservam a experiência atual. Para serviços sob consulta, registrar a quantidade e mostrar “valor sob consulta”, sem inventar preço.

## 13. Preço, duração e disponibilidade

Servidor deve recuperar preço oficial e recalcular total em centavos; não confiar em preço enviado pelo navegador. Sem desconto automático por quantidade, salvo regra comercial existente. Duração pode ser fixa, proporcional ou exigir confirmação; não assumir que duas unidades sempre dobram o tempo. Quando quantidade afetar duração, verificar capacidade e disponibilidade **antes de confirmar**. Se não for possível determinar duração com segurança, seguir fluxo de solicitação sujeita a aprovação. Preservar regras atuais de conflitos de agenda.

## 14. Persistência ponta a ponta

Quantidade deve permanecer correta em seleção, resumo, envio, registro no banco, painel administrativo, orçamento, aprovação, agendamento, notificações e histórico. Se o responsável alterar quantidade, recalcular valores/duração conforme regras e registrar alterações relevantes. Garantir compatibilidade com registros legados, idempotência de solicitações, proteção contra requisições duplicadas e manipulação de quantidade/preço.

---

# TESTES, SEGURANÇA E ENTREGA

## 15. Segurança

Autorização administrativa no servidor, RLS quando aplicável, validação de entrada, sanitização contra XSS, CSRF conforme arquitetura, rate limiting, antispam, uploads seguros, logs sem segredos, proteção de dados pessoais e operações idempotentes. Nunca expor `service_role` no frontend. Assinantes comuns não podem editar artigos ou consultar leads administrativos.

## 16. Testes obrigatórios

**Blog:** CRUD, rascunhos, prévias, agendamento, publicação, revisões, permissões, upload, sanitização, slugs/redirecionamentos, SEO, indexação, curtidas anônimas/autenticadas, repetição/concorrência, compartilhamentos, métricas, formulários, antispam, origem dos leads, integração com demonstrações, acessibilidade e responsividade.

**Serviços:** legado sem quantidade, habilitação, mínimo/máximo, preço fixo e sob consulta, duração fixa/proporcional/manual, disponibilidade insuficiente, solicitação pública, orçamento/aprovação, agendamento, notificações, alteração posterior, persistência, duplicidade, manipulação e regressões.

Executar build, lint, typecheck, testes unitários e de integração disponíveis; relatar comandos, resultados reais, falhas e limitações. Não adulterar testes históricos nem declarar homologação sem executá-la.


## MÓDULO C — MERCADO PAGO: TRANSIÇÃO CONTROLADA PARA PRODUÇÃO

**Objetivo:** concluir a preparação técnica da integração de assinaturas reais, sem ativar cobranças ou alterar ambientes remotos. Este módulo é independente do blog e da quantidade de serviços e não deve bloquear a homologação isolada deles.

**Estado já observado em 28/10/2026 (revalidar antes de qualquer mudança):** seis planos reais no Mercado Pago, todos ativos, mensais em BRL, com versões trial de 7 dias e versões sem trial. Essencial R$ 49,90, Profissional R$ 89,90 e Equipe R$ 149,90. Referências externas: `SYZIA-ESSENCIAL-TRIAL`, `SYZIA-ESSENCIAL-PAGO`, `SYZIA-PROFISSIONAL-TRIAL`, `SYZIA-PROFISSIONAL-PAGO`, `SYZIA-EQUIPE-TRIAL`, `SYZIA-EQUIPE-PAGO`. Os dois contratos fictícios locais (Essencial e Equipe) tinham `provider_state=canceled`, `state=cancel_scheduled`, `operation_state=done` e `trial_reserved=true`; Profissional não tinha contratos. Esses estados são evidência histórica, não confirmação do estado no momento da execução.

**Bloqueio identificado:** `public.billing047_offer_set(p_code text,p_version uuid,p_trial_plan text,p_paid_plan text)` rejeita alterações de mapeamento para planos com contratos históricos (`billing_mapping_in_use`), inclusive cancelados. Não desativar a proteção, apagar contratos, modificar migrations históricas nem sobrescrever IDs manualmente para contornar o bloqueio.

**Trabalho obrigatório:**

1. Auditar a implementação de billing atual, incluindo `scripts/billing-047/configure-plans.mjs`, `server/billing/runtime.mjs`, gateway Mercado Pago, webhooks, reconciliação, `billing047_offer_set`, ofertas, contratos, versões comerciais, permissões e testes. O script conhecido `configure-plans.mjs --apply-test` é restrito a contas de teste e **não pode ser usado como ativação de produção**.
2. Definir e implementar a menor migração incremental segura que permita mapear novas ofertas/versões reais sem comprometer histórico, integridade referencial, trial único, acesso de empresas, idempotência, upgrades/downgrades, cancelamentos e reconciliação. Avaliar isolamento explícito de ambiente/provedor e impedir consultas ou operações de produção contra contratos sandbox. Não presumir que `provider_state=canceled` sozinho autoriza trocar mapeamentos.
3. Fornecer rotina **somente de leitura** para validar na API os seis planos reais (referência, ID, moeda, preço, periodicidade, trial, status e titularidade/ambiente) sem registrar nem imprimir access tokens. Nunca criar planos duplicados por padrão.
4. Preparar ferramenta ou procedimento de configuração de produção idempotente, com pré-condições verificáveis, dry-run, confirmação explícita, transações e relatório de alterações; separar essa ferramenta da configuração de testes. Se houver necessidade de versão comercial nova, respeitar as regras atuais e documentar impacto sobre contratos legados.
5. Auditar credenciais e variáveis necessárias no Render e no Supabase, URLs de notificação, autenticação de webhook, validação de assinatura, logs, observabilidade, callbacks, status e reconciliação; **não trocar segredos nem acionar serviços reais**.
6. Testar em ambiente isolado: assinaturas antigas canceladas, contratos ainda com `cancel_scheduled`, oferta real, trial de sete dias, cobrança normal, trial único, mudança de plano, cancelamento, webhook duplicado/fora de ordem, falha e retry, reconciliação e prevenção de cobranças indevidas. Não usar cartões reais nem criar cobrança real.
7. Entregar migrations não aplicadas, testes, documentação de rollback e checklist operacional de ativação em etapas, distinguindo ações locais, Supabase, Render e Mercado Pago. Definir um gate explícito de autorização antes de qualquer ação financeira ou de produção.

**Critério de aceite do módulo C:** caminho de migração tecnicamente implementado e testado, com mapeamento de produção verificável, contratos sandbox preservados e isolados, e instruções seguras de ativação posterior. **Não declarar pagamentos reais ativos ou homologados sem teste real expressamente autorizado e concluído.**

## 17. Entrega final

Entregar **uma base integrada**, mas com módulos A, B e C separados internamente, incluindo:

1. Código funcional e inventário de arquivos alterados.
2. Migrations SQL incrementais **não aplicadas em produção**, com rollback/mitigação.
3. Cinco artigos inaugurais cadastráveis como rascunhos, sem publicação automática.
4. Testes e relatório real de execução, incluindo regressões.
5. Guia do editor: acessar, criar, editar, agendar, publicar, administrar mídia, curtidas e métricas.
6. Guia de aquisição: CTAs, demonstração, formulários, leads, origem e medição.
7. Guia de quantidade de serviços: configuração, preço, duração, disponibilidade e fluxo.
8. Plano de implantação com passos separados, nomes de variáveis necessárias (sem segredos), validação pós-deploy e rollback.
9. Guia de transição Mercado Pago: mapeamentos, sandbox/produção, webhook, testes, rollback e gates de ativação.
10. Pendências que exigem autorização externa: DNS/Cloudflare, Render, Supabase, migrations, Search Console, deploy e push.
11. ZIP final completo e, se possível, commits/patch local sem push remoto.

## 18. Critérios de aceite

- Blog público funcional, responsivo, acessível e tecnicamente indexável.
- Gestão editorial privada funcional, com editor, rascunhos, revisões e agendamento real.
- Curtidas persistentes, compartilhamentos e métricas baseadas em eventos reais.
- CTAs contextuais e formulário de interesse integrado ao fluxo comercial existente.
- Demonstração acessível pelo blog sem depender de prospecção manual, quando permitido pelas regras atuais.
- Cinco artigos originais prontos para revisão, ainda não publicados.
- Serviço configurável para múltiplas unidades, com seleção pública e persistência completa em solicitação, orçamento e agenda.
- Valores recalculados no servidor e disponibilidade protegida.
- Base histórica e funcionalidades da SYZIA preservadas.
- Testes executados e resultados documentados.
- Módulo Mercado Pago preparado e testado sem cobranças reais, com histórico sandbox preservado e transição documentada.
- Nenhuma alteração de produção realizada sem autorização.

**ORDEM FINAL:** analise a base oficial, implemente os três módulos até o máximo seguro possível, corrija falhas identificadas, execute os testes, prepare o pacote completo e documente somente as pendências que dependem de acesso ou autorização. Não pare após escrever um plano. Não faça deploy, push ou migrations remotas por conta própria.
