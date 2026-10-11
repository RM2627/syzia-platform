# SYZIA 049 — atualização sobre 048

Comece por `SYZIA-049-INSTALACAO.md`. ZIP completo com caminhos relativos a esta pasta, preservando seus arquivos locais de ambiente. Migrations anteriores intactas; nova migration 049. Gate: `npm run test:current-gate`; focados: `npm run test:049` e `npm run test:049:browser`. Ensaio financeiro somente local e explícito: `npm run homologation:billing:isolated -- --offline`. MP-01 e Auth/SMTP hospedados seguem pendentes de homologação externa. Nada foi publicado ou aplicado ao banco real.

# Base consolidada limpa SYZIA 048

Backend único e Manual opcional para a equipe própria, a partir da base limpa 047. Consulte [relatório 048](RELATORIO-SYZIA-048.md), [porta única](GUIA-HOSPEDAGEM-PORTA-UNICA.md), [upgrade incremental](GUIA-UPGRADE-048.md), [testes](MATRIZ-TESTES-SYZIA-048.md) e [pendências externas](PENDENCIAS-HOMOLOGACAO-048.md).

Node 24; `npm ci`, `npm run build`, `npm run test:048`, `npm run test:current-gate`. Produção preparada: `npm start`, lendo variáveis da hospedagem; local: `npm run api:dev`, lendo `.env.server`. Frontend continua com `npm run dev`. Os comandos separados de desenvolvimento continuam disponíveis. `VITE_PLATFORM_API_URL`, `VITE_ATTACHMENT_GATEWAY_URL` e `VITE_BILLING_API_URL` apontam ao mesmo backend no modo unificado.

A migration 048 é incremental; nenhuma anterior mudou. Assistido indisponível para contratação; Mercado Pago desativado por padrão e MP-01 aberta. Nenhuma publicação, cobrança real ou migration remota foi executada. Resultados brutos ficam fora da base limpa. Seções históricas abaixo conservam contexto; as instruções 048 prevalecem para inicialização do backend e obrigatoriedade do Manual.

# Base consolidada limpa SYZIA 047

Checkout/Assinaturas Mercado Pago: ver [upgrade 047](GUIA-UPGRADE-047.md), [homologação de teste](GUIA-MERCADO-PAGO-TESTE.md), [estados e políticas](docs/billing-047/ESTADOS-E-POLITICAS.md) e [matriz](MATRIZ-TESTES-BILLING-047.md). Integração desativada por padrão; MP-01 de notificações permanece pendente de confirmação oficial externa. Sem deploy nesta rodada.

Comandos da base limpa: `npm ci`, `npm run build`, `npm run test:current-gate`. Evidências completas são entregues separadamente. As seções históricas abaixo conservam contexto operacional; condições de trial/checkout da 047 prevalecem nos contratos gerenciados por Mercado Pago.

# SYZIA 046 — suporte compartilhado flexível

Consolidado sobre a **045 — Disponibilidade da Equipe e Assistido**. Esta entrega acrescenta os modos **Conforme disponibilidade da equipe** e **Horário programado**, reutilizando presença/fila da Central e preservando a disponibilidade individual, Agenda e consumo por ticket/ciclo da 045.

Comece pelo [relatório 046](RELATORIO-SUPORTE-COMPARTILHADO-FLEXIVEL.md), [upgrade 045 → 046](docs/flexible-support/upgrade.md), [configuração dos dois modos](docs/flexible-support/configuration.md), [matriz de testes](docs/flexible-support/test-matrix.md) e [textos da UI](docs/flexible-support/ui-copy.md). Inventário: [arquivos alterados](ARQUIVOS-ALTERADOS-SUPORTE-COMPARTILHADO-FLEXIVEL.md). O resultado vigente fica em `reports/flexible-support/current-gate.json`.

Gate oficial: `npm run test:current-gate`. Use somente a migration incremental 046 sobre uma base 045 já aplicada, sem reset. Configurações comerciais continuam a cargo do proprietário. Não há deploy, publicação, integração de pagamento ou homologação externa nesta entrega. Os capítulos e relatórios abaixo são históricos e foram mantidos.

---

# SYZIA 044 — correções aprovadas da auditoria 043

Entrega cumulativa a partir da 042 intacta. Escopo: AUD-001 a AUD-004. Comece por [relatório 044](docs/syzia-044/report.md), [upgrade sem reset](docs/syzia-044/upgrade.md) e [gate vigente](docs/testing/current-regression-gate.md).

Verificação oficial local: `npm run test:current-gate`. Os comandos e relatórios das rodadas anteriores abaixo continuam preservados como histórico. Sem migration 043, deploy ou homologação externa. Ao concluir esta entrega, parar e aguardar nova solicitação.

---

# SYZIA 042 — refinamento da operação empresarial

Base exclusiva: **SYZIA 041 consolidada**. Fronteira entre identidade global e permissões locais; autonomia efetiva; Home operacional; clareza da proposta e Agenda; execução opt-in em múltiplos períodos, no mesmo pedido.

**Aplicar somente a migration incremental 042 sobre a 041 antes do frontend 042, sem reset.** Migrations anteriores e marca preservadas. Entrega encerrada para homologação manual curta; sem deploy, serviços reais ou bateria mestre.

- [Relatório técnico e pendências](docs/syzia-042/relatorio.md)
- [Guia de upgrade e homologação curta](docs/syzia-042/guia-upgrade.md)
- [Diagnóstico](docs/syzia-042/diagnostico.md)
- [Matriz de autorização](docs/syzia-042/matriz-autorizacao.md)
- [Matriz de autonomia efetiva](docs/syzia-042/matriz-autonomia.md)
- [Cobertura dos 62 requisitos e resultados](docs/syzia-042/cobertura-testes.md)
- [Inventário](docs/syzia-042/inventario.md)
- [Evidências da interface](docs/syzia-042/evidencias.md)
- [Escopo autorizado](docs/syzia-042/request.md)
- [Resumo verificável](reports/syzia-042/validation-summary.json)

Validação local: **124 casos PASS** (47 SQL + 35 regressões 040 + 35 regressões 041 + 7 navegador), build/typecheck e bundle PASS. PostgreSQL nativo bloqueado pelo ambiente; concorrência independente e homologação externa pendentes. Comandos focados: `npm run test:042`, `npm run test:042:regression`, `npm run test:042:browser`, `npm run build` e `npm run check:bundle`.

As seções seguintes são histórico. O guia vigente desta entrega é o 042. Não iniciar 043 nem bateria ampla automaticamente.

---

# SYZIA 041 — autoatendimento, avaliação e agenda

Base exclusiva: **SYZIA 040 consolidada**. Contratação direta de itens determinísticos; avaliação com horário pretendido e roteamento para a empresa; ajuda contextual; fotos privadas; calculadora de proposta compartilhada entre painel e Central.

**Aplicar somente a migration incremental 041 sobre a 040 antes do frontend 041, sem reset.** Todas as migrations anteriores e os assets da marca estão preservados. Entregar e parar para homologação manual do proprietário. Não houve deploy, integração externa ou cobrança real.

- [Relatório técnico](docs/syzia-041/relatorio.md)
- [Diagnóstico da base](docs/syzia-041/diagnostico.md)
- [Guia de upgrade](docs/syzia-041/guia-upgrade.md)
- [Roteamento, permissões e cobertura](docs/syzia-041/matrizes.md)
- [Inventário](docs/syzia-041/alteracoes.md)
- [Escopo autorizado](docs/syzia-041/request.md)
- [Resultados verificáveis](reports/syzia-041/validation-summary.json)

Validação focada: `npm run test:041`, `npm run test:041:regression`, `npm run test:041:browser`, `npm run build`, `npm run check:bundle`. O teste opcional nativo é `npm run test:041:native`; o ambiente desta entrega impediu sua execução. As seções abaixo são histórico; o guia atual é o 041.

---

# SYZIA 040 — correções pós-homologação 039

Base exclusiva: consolidado 039. Trial automático com elegibilidade, plano real temporário de homologação, grants de atendimento, Equipe SYZIA, identidade publicada do consumidor, agenda explícita, FAQ e labels.

**Aplicar somente a migration incremental 040 antes do frontend 040, sem reset.** As migrations e os assets da marca anteriores estão preservados. Nenhum deploy, provider real ou pagamento foi executado. Entregar e parar para homologação manual do proprietário.

- [Relatório técnico](docs/syzia-040/relatorio.md)
- [Guia de upgrade](docs/syzia-040/guia-upgrade.md)
- [Matrizes e cobertura](docs/syzia-040/matrizes.md)
- [Inventário das alterações](docs/syzia-040/alteracoes.md)
- [Pedido autorizado](docs/syzia-040/request.md)
- [Resultados locais](reports/syzia-040/validation-summary.json)

Testes: `npm run test:040`, `npm run test:040:regression`, `npm run test:040:browser`, `npm run build`. Detalhes e limitações no relatório. As seções seguintes conservam o histórico; o guia aplicável a esta atualização é o 040.

---

# SYZIA 039 — planos, atribuições e cobrança em preparação

Base cumulativa 038. Configurador comercial com recursos, disponibilidade, limites explícitos, resumo e teste de atribuições no servidor. Financeiro e métricas opcionais, capacidade humana SYZIA separada da operação própria, versões contratadas preservadas e área Administração → Cobrança sem provedor configurado.

**Aplique a migration incremental 039 antes de operar o novo frontend. Não resete o banco.** Migrations anteriores, marca aprovada, Auth, isolamento e histórico permanecem preservados. Nenhum provider real foi escolhido ou integrado.

- [Relatório técnico 039](docs/syzia-039/relatorio.md)
- [Guia de atualização e homologação futura](docs/syzia-039/guia-upgrade.md)
- [Mapa funcional e decisões](docs/syzia-039/architecture.md)
- [Escopo integral](docs/syzia-039/request.md)
- [Evidências locais](reports/syzia-039/validation-summary.json)

`npm run test:039`, `npm run test:039:regression`, `npm run test:039:browser`. Build/typecheck e varredura de bundle incluídos. Entregar e parar para homologação do proprietário; não iniciar outra fase ou a homologação completa de atendimento.

As seções seguintes preservam o histórico. Para esta atualização, use o guia 039.

---

# SYZIA 038 — publicação, temas e pedido multisserviço

Base cumulativa 037. Publicação com revisão explícita, modal público claro/escuro, seleção de vários serviços em uma solicitação, relações configuráveis de catálogo, proposta revisada com explicação ao consumidor e mostrar/ocultar senha.

**Aplicar a migration incremental 038 antes do frontend. Não resetar o banco.** As migrations 001–033 e 036 permanecem intactas. Solicitações, propostas e links antigos continuam preservados.

- [Relatório técnico 038](docs/syzia-038/relatorio.md)
- [Guia de atualização 037 → 038](docs/syzia-038/guia-upgrade.md)
- [Arquitetura e inventário](docs/syzia-038/architecture.md)
- [Solicitação integral](docs/syzia-038/request.md)
- [Validação local](reports/syzia-038/validation-summary.json)

36 casos focados aprovados, typecheck/build/bundle aprovados. `npm run test:038` e `npm run test:038:browser`. Sem deploy, serviços reais ou homologação externa completa. Parar para homologação do proprietário.

As seções abaixo preservam o histórico; para esta atualização, use o guia 038.

---

# SYZIA 037 — reemissão do primeiro acesso

Após gerar novo código, o painel existente reaparece com foco/scroll, novo código, novo link e três ações de cópia. Feedback específico de reemissão, preservando todo o protocolo da 036.

**Nenhuma migration nova.** Atualize a interface da pasta 037. Backend, migrations e demais módulos permanecem intactos.

- [Relatório 037](docs/syzia-037/relatorio.md)
- [Guia de atualização e homologação](docs/syzia-037/guia-upgrade.md)
- [Solicitação integral](docs/syzia-037/request.md)
- [Resultados locais](reports/syzia-037/validation-summary.json)
- [Inventário de preservação](reports/syzia-037/release-inventory.json)

9 casos focados aprovados, typecheck/build/bundle aprovados. `npm run test:037` e `npm run test:037:browser`. Sem deploy ou homologação externa. Parar para homologação do proprietário.

As seções abaixo preservam o histórico; para esta atualização, use o guia 037.

---

# SYZIA 036 — primeiro acesso e login

Primeiro acesso por link opaco + código temporário, sem pedir Código empresarial ou username. Login normal por e-mail ou usuário e senha, com os contextos existentes. Base integral 035 preservada.

**Aplicar a migration incremental 036 e reiniciar frontend/Platform API juntos. Não resetar o banco.** Migrations 001–033 permanecem intactas; 034/035 não tinham migrations.

- [Relatório 036 e limite do diagnóstico histórico](docs/syzia-036/relatorio.md)
- [Guia de upgrade 035 → 036](docs/syzia-036/guia-upgrade.md)
- [Solicitação integral](docs/syzia-036/request.md)
- [Resultados locais](reports/syzia-036/validation-summary.json)
- [Inventário de preservação](reports/syzia-036/release-inventory.json)

103 casos locais aprovados, typecheck/build/bundle aprovados. `npm run test:036`, `npm run test:036:browser`, `npm run diagnose:036`. Os request_ids históricos não permitem comprovar sua causa exata; homologação externa permanece pendente. Entregar e parar para homologação do proprietário.

As seções abaixo preservam o histórico; para atualizar agora, use o guia 036.

---

# SYZIA 035 — pós-homologação da 034

Demonstração comercial, capa 4:3 preservada e validada, correção da credencial interna do Auth e retomada com diagnóstico próprio. Base integral 034. **Nenhuma migration nova; não resetar o banco.**

- [Relatório 035](docs/syzia-035/relatorio.md)
- [Atualização 034 → 035 e retomada das preparações](docs/syzia-035/guia-upgrade.md)
- [Solicitação integral](docs/syzia-035/request.md)
- [Inventário da entrega](reports/syzia-035/release-inventory.json)

Reinicie a Platform API a partir desta pasta para aplicar a correção Auth. Testes focados: `npm run test:035`, `npm run test:035:browser`, `npm run build`. Diagnóstico local: `npm run diagnose:035`.

79 casos únicos aprovados. Supabase/Auth/Storage reais e concorrência PostgreSQL nativa permanecem pendentes de homologação. Nenhum deploy. Aguardar homologação do proprietário; não iniciar outra rodada automaticamente.

As seções abaixo preservam o histórico das entregas anteriores.

---

# SYZIA 034 — pós-homologação da 033

Rodada focada em entrega manual de credenciais, regras/enquadramento de mídia e enriquecimento da landing aprovada. Base integral 033 preservada; sem migration nova, reset ou deploy.

- [Relatório 034](docs/syzia-034/relatorio.md)
- [Guia de atualização e homologação local](docs/syzia-034/guia-upgrade.md)
- [Diagnóstico e decisões](docs/syzia-034/diagnostico-e-decisoes.md)
- [Solicitação integral](docs/syzia-034/request.md)

`npm run test:034`, `npm run test:034:browser`, `npm run diagnose:034`.
Para homologação local, manter a interface, a API de acesso e o gateway de mídia iniciados em terminais separados. SMTP não é requisito para criar e entregar credenciais. Consulte o guia antes de atualizar.

---

> **Entrega atual: SYZIA 033 — pós-homologação 032.** Site institucional, aquisição, self-service integrado ao onboarding existente, login/contexto, UX e despesas recorrentes. [Relatório](docs/syzia-033/report.md) · [Upgrade 032→033](docs/syzia-033/upgrade.md) · [Arquivos alterados](docs/syzia-033/changed-files.md) · [Contrato de pagamento](docs/syzia-033/payment-contract.md).
>
> Em uma instalação 032, aplique **somente a migration 033**. Migrations 001–032 preservadas byte a byte. `/` agora é o site institucional; o painel de empresas fica em `/app`; `/entrar` é a porta unificada. Pagamento real pendente, sem deploy ou Supabase real nesta rodada. Testes focados: `npm run test:033`, `npm run test:033:browser`, `npm run build`. As instruções de versões anteriores abaixo são históricas.

> **Entrega atual: SYZIA / migration 032.** Sobre a 031, aplique somente a 032. [Guia de atualização](docs/syzia-032/upgrade.md) · [Relatório](docs/syzia-032/report.md) · [Guia do usuário](docs/syzia-032/guia-usuario.md) · [Marca aprovada](brand/syzia/README.md). As instruções abaixo das entregas anteriores são históricas. Sem deploy ou homologação externa nesta rodada.

> **Histórico 031: correção de presença pública sobre a 030.** Categorias no formulário, uploads diretos, identidade visual, catálogo ordenável, portfólio, prévia privada e publicação explícita. [Relatório](docs/presence-correction/report.md) · [Arquivos alterados](docs/presence-correction/changed-files.md) · [Atualização 030→031](docs/presence-correction/upgrade.md) · [Necessidade da migration](docs/presence-correction/backend-decision.md).
>
> Em uma instalação 030, aplicar **somente a 031** antes do frontend deste pacote. Migrations 001–030 preservadas byte a byte. Validação local focada; sem Supabase real, deploy ou homologação externa. Os relatos abaixo são históricos.

> **Histórico: implementação 030.** Projeto completo cumulativo, com Financeiro empresarial, permissões granulares, categorias, capacidades e verificação cadastral. [Relatório](docs/implementation-030/report.md) · [Testes](docs/implementation-030/tests.md) · [Matriz](docs/implementation-030/permissions.md) · [Atualização 029→030 sem reset](docs/implementation-030/upgrade.md) · [Pendências](docs/implementation-030/pending.md).
>
> Aplique somente a migration 030 sobre uma instalação 029. As migrations 001–029 permanecem intactas. Concorrência nativa e homologação externa continuam pendentes; esta entrega não autoriza deploy/produção. As suspensões de vídeo citadas nos relatos históricos abaixo foram superadas pelo pedido posterior específico de vídeo, já tratado separadamente; a implementação 030 não produz ou altera esse vídeo.

> **Histórico: auditoria mestre / migration 029.** Atualização de instalação 028 sem reset: [guia](docs/master-audit/upgrade.md). [Relatório](docs/master-audit/report.md), [matriz](docs/master-audit/compliance.md), [permissões](docs/master-audit/permissions.md) e [pendências externas](docs/master-audit/external.md). Orientações de versões anteriores abaixo são histórico.

> **Histórico — Minhas empresas e onboarding (028; regra refinada pela 029).** Abrir empresa entra no ambiente empresarial; Definir administrador continua separado. Super Admin configura pela autorização global, sem membership artificial.
> Leia [o relatório desta correção](docs/company-workspace/report.md), [a atualização sem reset](docs/company-workspace/upgrade.md) e [o roteiro externo](docs/company-workspace/external-homologation.md).
> Com 001–027 já aplicadas, execute **somente 028**. As seções seguintes preservam o histórico das entregas. Vídeo cancelado; nenhum deploy ou serviço real utilizado.

> **Correção incremental após a 026 — ativação e gestão de empresas.**
> Leia [o relatório](docs/organization-activation/report.md), [a auditoria](docs/organization-activation/audit.md) e [a atualização sem reset](docs/organization-activation/upgrade.md).
> Quem já aplicou 001–026 deve executar **somente a nova 027**, após preservar suas configurações/backup.
> Instruções administrativas por e-mail: [configuração SMTP](docs/organization-activation/smtp.md). SMTP desligado por padrão; o acesso é criado e as instruções podem ser copiadas.
> [Homologação externa desta correção](docs/organization-activation/external-homologation.md) permanece pendente. Vídeo suspenso. Nenhum deploy ou operação externa executados.

# SYZIA — projeto completo cumulativo — Fases 2–8

## Acesso empresarial — base histórica (migration 026)

O acesso oficial é **código da empresa + username + senha**. Primeiro acesso e recuperação usam código temporário entregue pelo administrador, sem SMTP. Super Admin existente: na mesma `/entrar`, escolha **Acesso da operação SYZIA** e use sua conta Auth já existente. Não há autocadastro administrativo.

- **Atualizar uma instalação com 001–025:** siga `docs/access/upgrade.md`. Execute somente **026**; sem reset/reaplicar histórico. Preserve e copie seus `.env` e `.env.server` locais, não fornecidos nesta entrega.
- **Demo local:** `npm ci` → `npm run dev:demo`. Credenciais fictícias e jornadas em `docs/access/demo.md`.
- **Relatório e evidências atuais:** `docs/access/report.md`. Modelo/segurança: `docs/access/architecture.md`. Homologação externa: `docs/access/external-homologation.md`.
- Testes: `npm run test:access`, `npm run test:local`, `npm run check:bundle`, `node scripts/verify-historical-migrations.mjs`.
- Senhas permanecem no Supabase Auth; empresa lembrada não é credencial. Inatividade: 30 minutos, aviso 60 segundos antes. Termos/Privacidade são **minutas para revisão**, não contrato comercial final.
- Novo login/Storage/PostgREST/Supabase real: **PENDENTE DE HOMOLOGAÇÃO EXTERNA**. Sem deploy/serviços contratados. Vídeo **CANCELADO**.

As seções abaixo preservam o histórico funcional. Quantidades de migrations/testes de cada fase são históricas; a entrega atual contém 030, com 001–029 intactas. Guias antigos de convite por e-mail estão identificados como legados e não devem orientar o novo acesso.


## Revisão operacional e onboarding (desenvolvimento local)

A entrada da empresa agora mostra o dia de trabalho, próximos serviços, pendências e atalhos. Empresas novas recebem checklist baseada nos registros salvos. O tour opcional pode ser retomado ou refeito pela **Ajuda** e fica separado por gestor/empresa.

Novas migrations **022, 023 e 024**, aplicadas após as 21 anteriores; não substituir migrations já aplicadas. Guia: `docs/operational-homologation.md`; jornadas: `docs/company-daily-journey-matrix.md`; relatório: `Relatorio-Revisao-Operacional-Pre-Homologacao.md`.

Demo: `npm ci` e `npm run dev:demo`, apenas em localhost. Use código e username conforme `docs/access/demo.md`; operadores globais usam a opção da operação SYZIA. Senha fictícia: `FictitiousPassword123!`. Reiniciar o processo reseta a demo. Não são contas ou autenticação de produção.

Testes adicionais: `npm run test:onboarding`, `npm run test:operations`, `npm run test:operations:native` (dependência opcional, Linux não-root). `npm run test:local` inclui regressão e navegador. Se necessário, `node scripts/prepare-browser.mjs` e definir `FOUNDATION_CHROMIUM_PATH` para o caminho absoluto do binário local.

**PENDENTE DE HOMOLOGAÇÃO EXTERNA.** Nenhum deploy, publicação, cobrança real ou conexão com Supabase real foi realizado.


**Regra permanente de entrega:** o trabalho do agente limita-se a desenvolver, organizar, testar e entregar os arquivos das fases aprovadas. Publicação e lançamento serão realizados por Marcelo. Não executar deploy, ativar serviços pagos, configurar domínio de produção ou usar dados reais. Consulte `AGENTS.md` e `docs/project-boundaries.md`.

Este pacote contém o **projeto completo cumulativo das Fases 2–8**, incluindo Fundação, Empresa, Consumidor, Central, Comercial, Analytics e Planos/Assinaturas. **DESENVOLVIMENTO LOCAL** e **HOMOLOGAÇÃO EXTERNA** são distintos: Supabase/Auth/Storage/PostgREST/concorrência independente e restauração reais permanecem pendentes. Não houve deploy, contratação, dados/clientes reais ou pagamento real. **Última fase de desenvolvimento: Fase 8. Homologação externa permanece pendente e exige autorização separada. Não iniciar Fase 9.**

Comece por `docs/phase-8-report.md`, `docs/phase-8-billing.md`, `docs/phase-8-demo.md`, `docs/phase-8-sql-inventory.md`, `docs/phase-8-test-matrix.md`, `docs/phase-8-route-audit.md` e `docs/phase-8-homologation.md`. Relatórios anteriores são históricos. São **21 migrations e 63 tabelas públicas/policies SELECT**, mais dez tabelas privadas de trial sem grants para clientes, todas com RLS/FORCE RLS. Migrations 001–020 preservadas byte a byte.

## Atualização: trial e prevenção de abuso

Demo com **15 dias configuráveis**, sem meio de pagamento real. Registro persistente de concessões e identidades pseudonimizadas; troca de e-mail/organização não libera automaticamente novo benefício. Falta de prova ou benefício anterior exige análise, com concessão/extensão auditada por superadmin. Prazo, plano e efeito do término aparecem na assinatura. Verificação real de identidade/telefone não é inferida do cadastro: o fluxo atual é de conferência administrativa.

Leia `docs/trial-report.md`, `docs/trial-and-abuse.md`, `docs/trial-sql-inventory.md` e `docs/trial-homologation.md`. Testes: `npm run test:trial`, `npm run test:trial-upgrade` e, em Linux com usuário não-root, `npm run test:trial:native`. Homologação externa continua pendente.

## Novidades da Fase 8

- Planos configuráveis/versionados; assinatura, trial, vigência, troca, cancelamento, reativação e renovação explícita.
- `/painel/:orgId/assinatura`: recursos, uso, limites, cobranças fictícias e histórico. `/admin/assinaturas`: catálogo, empresas e administração autorizada.
- Quotas transacionais no banco: membros, serviços, solicitações, tickets e follow-ups. Uso mensal no fuso da empresa; operações revalidam acesso atual.
- Billing exclusivamente simulado; provider mock com assinatura HMAC, idempotência, replay e auditoria. Mock desabilitado por padrão fora da fixture local. **Sem gateway/recebimento real, receita, MRR ou ARR.**
- Fotografia sintética de capa/portfólio, catálogo com imagem/fallback, lightbox acessível, navegação touch e menu móvel expansível. Identidades fictícias A/B distintas.
- Módulos autenticados carregados sob demanda: visitante público não carrega Central, Comercial, Analytics, administração ou billing.
- Demo isolada por visitante, jornada consumidor → atendente → proposta → aprovação → agenda → métricas testável localmente.

Organizações anteriores sem assinatura e sem solicitação de trial conservam as permissões anteriores até adesão explícita; migrations não contratam planos nem geram cobranças automaticamente. Após adesão, limites e vigência passam a ser exigidos no servidor. Não há renovação automática nem pró-rata; regras completas em `docs/phase-8-billing.md`.


## Começar sem conta externa

Node.js 22.12+ (validado com Node 24), npm e dependências de desenvolvimento instaladas:

```sh
npm ci
npm run dev:demo
```

Abra `http://127.0.0.1:5173/empresa/ms-auto-ficticia`. A Empresa B está em `/empresa/horizonte-ficticio`. Tudo roda apenas em loopback, com PGlite e Auth/Storage simulados, dados fictícios e aviso visual. Ao parar, os dados são descartados. Capas e portfólio incluem fotografias e ilustrações sintéticas de teste, com origem documentada. **O servidor de demonstração nunca deve ser publicado nem usado como autenticador real.**

Para administrar A: `/entrar`, código `A1B2C3D4E5F6`, usuário `marina.costa`; B: código `B1B2C3D4E5F6`, usuário `lia.horizonte`. Senha fictícia exata: `FictitiousPassword123!`. O provedor simulado só existe no script de demonstração. A aplicação com Supabase real exige autenticação real e papéis da Fundação.

No Windows, também é possível executar `INICIAR-DEMO.cmd`; no Linux/macOS, `./iniciar-demo.sh`. É necessário instalar Node.js/npm antes. O launcher Windows está preparado, mas não foi executado em Windows nesta validação Linux.

## O que a Fase 7 entrega

- `/painel/:orgId/metricas`: funil, valores orçados/aprovados, conversões, encerramentos, origens, serviços, retornos e série diária; filtros calculados no SQL.
- `/painel/:orgId/operacao`: volume, fila atual, primeira resposta e referência de SLA; permissões operacionais da Central.
- `/admin/metricas`: capacidade agregada, somente superadmin; na demo, opção Acesso da operação SYZIA, `root@example.invalid`, senha `FictitiousPassword123!`.
- Receita explicitamente indisponível. Conversão comercial e aprovação não comprovam recebimento.
- Design system, presença pública personalizada, navegação, cards, filtros, feedback e layouts responsivos. Duas identidades fictícias distintas, com SVGs editáveis.
- Demo corrigida e testada por navegador sem interceptação de RPCs: CORS, catálogo, solicitação, painéis e áreas autenticadas. Cenários fictícios criados pelos fluxos existentes e descartados ao encerrar.
- Leia `docs/phase-7-demo.md` e `docs/design-system.md`. Os indicadores comerciais usam coorte de oportunidades criadas no período, com progresso até seu fim; detalhes e limites em `docs/phase-7-metrics.md`.

## O que a Fase 6 entrega (preservado)

- `/comercial` e `/comercial/:code`: oportunidades, tarefas, próxima ação, prazo, tentativa, responsável, origem, valor, busca e filtros. Visões Hoje/Próximos/Atrasados/Responderam/Abandonos elegíveis/Finalizados; filtro de minhas tarefas.
- `/painel/:orgId/comercial`: visão da empresa e configuração administrativa. Recuperação desligada por padrão; intervalo personalizado em minutos, sugestões 2/6/24/48 horas; limite padrão de duas tentativas, configurável entre 1 e 10.
- Precedência por campo: regra específica → serviço → empresa → padrão (24 horas/2 tentativas). Horário próprio ou horário humano do manual publicado, no fuso da empresa.
- Histórico real, tentativas e snapshots; contatos operacionais consentidos; resposta, recusa, expiração, revogação e conversão interrompem retornos incompatíveis. Visita anônima não gera tarefa.
- Conversão por aprovação ou agendamento confirmado, com evento de origem; perda estruturada. Não há receita, disparo externo ou analytics avançado.
- Assumir/transferir/reagendar/resultados protegidos por autorização atual, revisão, idempotência e transação. Notas internas continuam privadas.
- Link direto ao ticket, orçamento, agenda e respostas rápidas existentes. Sem conversa, cliente ou orçamento paralelo.

Na demo local, entre como `agenta@example.invalid` e abra `/comercial`; os retornos fictícios começam atrasados para exercitar a operação. Use o acesso empresarial de A (`docs/access/demo.md`) → painel A → Comercial e recuperação para configurar. Nenhum dado é persistido fora da execução local da demonstração.

Conciliação ao abrir/atualizar e a cada 30 segundos; contexto a cada 12 segundos. Os prazos ficam persistidos no banco e toda execução revalida janela/consentimento. Não há cron externo instalado nem mensagens automáticas. Sem janela válida, o banco não permite contato. Datas de entrada de formulários usam o horário do dispositivo, explicitado no rótulo; exibição usa fuso empresarial.

## O que a Fase 5 entrega (preservado)

- `/central` e `/central/:code`: fila compartilhada/minha fila, visão operacional, busca/filtros, responsabilidade, próxima ação e espera determinística.
- Mensagens na plataforma e notas internas separadas; autoria, idempotência, revisão e proteção transacional contra operação obsoleta.
- Manual publicado, catálogo/autonomia/respostas rápidas por empresa; descontos calculados no banco e preços excepcionais encaminhados.
- Orçamento e agenda reutilizam as estruturas seguras do consumidor, incluindo imutabilidade, conflitos e rollback.
- `/painel/:orgId/pendencias`: decisão da empresa; presença e sessão operacional sem monitoramento invasivo.
- Conversa restrita do consumidor integrada ao acompanhamento; anexos privados só por gateway autorizado.
- Pagamentos apenas em preparação; sem IA, WhatsApp API, disparo externo ou cobranças reais.

Na demonstração, entrar em `/entrar` com `agenta@example.invalid` (principal A), `backup@example.invalid` (reserva A), `agentb@example.invalid` (principal B) ou `shared@example.invalid` (atendente A/B), pela opção Acesso da operação SYZIA, usando `FictitiousPassword123!`. Acesse `/central`, escolha **Fila geral**, abra ticket e **Assumir atendimento**. os gestores A e B usam código e username em `docs/access/demo.md`. Todos os nomes são fixtures; identidade exibida em produção virá do perfil autenticado e da empresa do ticket.

A Central atualiza contexto a cada 12 segundos e fila a cada 15 segundos; operações revalidam autorização/revisão no banco imediatamente. Mudar ticket elimina rascunho para impedir cruzamento de empresa. SLA não configurado não promete prazo.

## O que a Fase 4 entrega (preservado)


- Página mobile-first `/empresa/:slug`: identidade, capa/logo, catálogo, categorias, modalidades de preço, portfólio, FAQ, contatos e agenda.
- Solicitação guiada, adicionais, perguntas, imagens privadas, revisão e retomada de rascunho; sessão técnica separada da equipe; consentimentos sem marketing implícito.
- Clientes isolados por empresa/identidade, preenchimento recorrente seguro, origem declaratória, notas/tags internas e indicação básica.
- Propostas congeladas, novas versões, aprovação/recusa idempotentes, acompanhamento restrito e timeline de eventos reais.
- Um recurso de agenda por empresa; horários, antecedência, duração/adicionais, bloqueios, cancelamento e remarcação atômica; exclusão GiST no banco.
- Gateway Node privado para imagens sanitizadas; publicação de portfólio explicitamente autorizada e separada dos anexos de consumidores.
- Configuração da jornada em `/painel/:orgId/consumidor`, integrada agora à Central da Fase 5.
- Preparação financeira OPCIONAL: regras futuras por empresa/serviço, sinal calculado no banco, planos congelados, schema de pagamentos/histórico e abstração de provedor. **Nenhuma cobrança/recebimento real ou bloqueio da agenda por pagamento nesta fase.**
- Cinco migrations novas (006–010), totalizando na entrega histórica da Fase 4 **41 tabelas públicas com RLS/FORCE RLS e 41 policies de leitura**, além dos scripts separados de Storage. Migrations 001–005 preservadas.

Leia `docs/phase-4-report.md`, `docs/phase-4-presence.md`, `docs/phase-4-payments.md`, `docs/phase-4-sql-inventory.md` e `docs/phase-4-homologation.md`. As guias e ferramentas das fases anteriores permanecem no pacote.

## Testar e gerar build

```sh
npx playwright install chromium
npm run test:local
npm run build
npm run check:bundle
npm run preview
```

Testes locais usam banco descartável/fixtures; nenhum teste local é prova de homologação real. O fallback Linux opcional está em `scripts/prepare-browser.mjs`. `dist/` é gerado pelo build; `node_modules/` é reconstituído pelo lockfile e não faz parte do ZIP. O ZIP inclui código, assets/geradores de fixtures, configurações, SQL desde a primeira migration, testes, documentos, evidências e manifesto.

Para Supabase de teste futuramente: seguir `docs/phase-8-homologation.md` e os guias anteriores, copiar `.env.example`/`.env.server.example` para arquivos locais ignorados, configurar Auth e iniciar `npm run attachments:dev` quando necessário. A chave privilegiada pertence somente ao processo Node. Ações de configuração externa são de Marcelo.

Preparação de publicação futura em `docs/future-launch.md`. Esses arquivos são instruções, não autorização para executar deploy.

## Fundação preservada

- Conta individual no Supabase Auth, login empresarial, saída e recuperação administrativa (modelo atual em `docs/access/upgrade.md`).
- Perfil sem papel automático: dados enviados no cadastro nunca concedem privilégios.
- Organizações, administrador inicial, membros e vínculos principal/reserva de atendentes.
- Papéis globais de administrador e atendente, inclusive combinados para a mesma pessoa.
- Suspensão de conta, empresa ou vínculo, aplicada nas verificações de acesso do banco.
- Administração de empresas, pessoas, papéis, membros, atendentes e auditoria.
- RLS e FORCE RLS nas seis tabelas públicas; seis policies de leitura; escrita somente por oito RPCs autorizados.
- Auditoria automática, protegida contra alterações pelos clientes, sem copiar segredos ou conteúdo pessoal nos eventos.

O ajuste de follow-up está em `docs/architecture.md`: prazos configuráveis por empresa/serviço/regra, opções 2h/6h/24h/48h/personalizado, limite de tentativas configurável e padrão de duas tentativas. A recuperação foi implementada na Fase 6; os documentos da Fundação descrevem seu estado histórico.

## Fase 3 entregue

- Cadastro/configuração empresarial, regiões, pagamentos, horários da empresa/equipe e contato interno de exceções.
- Onboarding com progresso calculado, catálogo de serviços, adicionais e perguntas por serviço.
- Preços fixos, a partir de e sob consulta; centavos inteiros; limites e constraints no banco.
- Regras empresariais e autonomia explícita da equipe, com rejeição de contradições e padrão sem concessões.
- Manual com 11 tópicos, rascunho, clone, descarte, publicação interna e snapshots imutáveis de catálogo, regras, autonomia, FAQ e respostas rápidas.
- FAQ pública estritamente projetada, habilitação/retirada explícitas e consulta em `/empresa/:slug/faq`.
- Checklist de prontidão, ativação humana e conferência de permissão efetiva no banco, reaplicadas após revogação/suspensão.
- Duas migrations adicionais: dez novas tabelas, dez policies SELECT, dez RPCs. Total: 16 tabelas e 16 policies com RLS/FORCE RLS. As três migrations e funções da Fundação foram preservadas.

Entre em **Minhas empresas → empresa → Configurar empresa e manual**. O superadmin continua responsável por criar a organização e conceder o administrador inicial, conforme a Fundação; cadastro de login não cria empresa nem concede papéis automaticamente. Colaboradores/atendentes não editam configurações.

Leia `docs/phase-3-report.md` para inventário, decisões, testes locais e limites. Serviços podem ser inativados preservando histórico. Na entrega histórica da Fase 3, upload, agenda, orçamento e clientes ainda não existiam; foram adicionados na Fase 4. O chat foi integrado na Fase 5; recuperação automática permanece fora do escopo atual. A FAQ isolada da Fase 3 não carrega imagens externas.

## Homologação externa executada pelo usuário

Siga `docs/homologation-guide.md` para a Fundação e `docs/phase-3-homologation.md` para a Empresa. O kit contém configuração de teste de exemplo, SQL de inspeção, preparação de duas empresas fictícias, testes HTTP com Auth real e roteiros de concorrência em duas conexões. Nenhum desses testes externos foi executado pelo agente. O relatório a preencher está em `docs/homologation-report-template.md`.

Valide as ferramentas localmente com `npm run test:homologation-tools`. Depois de configurar seu ambiente, `npm run homologation:read` verifica leituras; `npm run homologation:mutations` executa separadamente as mutações de teste. As credenciais ficam exclusivamente em `.homologation/connection.json`, fora do pacote e do frontend.

## Instalação local

Requisitos: Node.js compatível com o lockfile (ambiente validado: Node 24.19.0) e npm. Os testes locais usam PGlite e fixtures sem Supabase real. Para uso interativo com Auth real, Marcelo configura posteriormente um Supabase dedicado de teste.

```bash
npm ci
```

Copie `.env.example` para `.env` e substitua a URL e a chave pública do seu projeto. Use `VITE_SUPABASE_PUBLISHABLE_KEY` com chave publishable ou antiga anon. Nunca use service_role, `sb_secret_` ou senha do banco. O build rejeita chaves privilegiadas reconhecidas e variáveis públicas com nomes de segredo.

```bash
npm run dev
npm run build
```

Sem configuração válida, a aplicação apresenta uma mensagem de conexão pendente. Não existe login fictício ou modo de demonstração no código de produção.

## Banco: instruções de configuração para o usuário

Quando o ambiente externo depender de conta, credenciais, projeto ou ação de Marcelo, estas instruções ficam preparadas para ele executar. Não é necessário publicar a aplicação para preparar seus arquivos ou para realizar testes locais. Na homologação externa, usar somente um projeto dedicado e contas/empresas fictícias. Aplicar as migrations uma vez e na ordem abaixo.

Use um projeto novo e dedicado. As migrations pressupõem o schema `auth`, as funções `auth.uid()` e `auth.jwt()` e os papéis `anon`/`authenticated` fornecidos pelo Supabase. Execute com o proprietário de migrations, autorizado a criar funções e triggers. Os helpers SECURITY DEFINER pressupõem esse proprietário confiável com bypass de RLS; usuários da aplicação não são proprietários.

1. `supabase/migrations/202609150001_foundation.sql`
2. `supabase/migrations/202609150002_authorization.sql`
3. `supabase/migrations/202609150003_commands.sql`
4. `supabase/migrations/202609150004_company_schema.sql`
5. `supabase/migrations/202609150005_company_commands.sql`
6. `supabase/migrations/202609160006_consumer_schema.sql`
7. `supabase/migrations/202609160007_consumer_commands.sql`
8. `supabase/migrations/202609160008_consumer_attachments.sql`
9. `supabase/migrations/202609160009_consumer_presence.sql`
10. `supabase/migrations/202609160010_payment_preparation.sql`
11. `supabase/migrations/202609160011_central_schema.sql`
12. `supabase/migrations/202609160012_central_commands.sql`
13. `supabase/migrations/202609160013_central_integration.sql`
14. `supabase/migrations/202609160014_commercial_schema.sql`
15. `supabase/migrations/202609160015_commercial_engine.sql`
16. `supabase/migrations/202609160016_commercial_commands.sql`
17. `supabase/migrations/202609170017_analytics.sql`
18. `supabase/migrations/202609180018_billing_schema.sql`
19. `supabase/migrations/202609180019_billing_commands.sql`
20. `supabase/migrations/202609180020_billing_limits.sql`
21. `supabase/migrations/202609180021_trial_eligibility.sql`
22. `supabase/migrations/202609180022_operational_authorization.sql`
23. `supabase/migrations/202609180023_daily_operations.sql`
24. `supabase/migrations/202609180024_company_onboarding.sql`
25. `supabase/migrations/202609180025_b2b_invitations.sql`
26. `supabase/migrations/202609190026_enterprise_access.sql`

Depois, aplicar os dois scripts de `supabase/storage/`, conforme `docs/phase-4-homologation.md`. Eles dependem do Storage real e não foram aplicados pelo agente.

Aplique pelo processo de migrations do Supabase ou execute o conteúdo de cada arquivo, uma vez, no SQL Editor. Não execute `tests/auth-fixture.sql` no Supabase: ele é exclusivo do motor descartável de testes.

Não conecte a aplicação ao banco atual da MS Auto Details. Este pacote não modifica o repositório nem o banco dessa plataforma existente.

## Configuração de autenticação

A configuração atual está em `docs/access/upgrade.md`. O provider Auth continua armazenando senhas; o identificador técnico interno não depende de caixa postal. E-mail de contato não é verificado por esse fluxo. Ative o hook de provisionamento e preserve a sessão anônima do consumidor, conforme guia. SMTP não é requisito para criar/recuperar acessos empresariais.

A conta Super Admin existente continua entrando pela opção **Acesso da operação SYZIA**, na mesma `/entrar`, com sua credencial Auth existente. A migration não cria nem promove Super Admin automaticamente. O bootstrap SQL histórico fica preservado para instalações novas sob responsabilidade do proprietário; não execute novamente no upgrade. Não existe criação de conta pela aplicação pública.

Testes locais usam SQL/PGlite e adapters: emissão/assinatura de JWT, refresh, hook e Storage reais permanecem pendentes.

## Testes reproduzíveis

```bash
npx playwright install chromium
npm run test:local
```

- `npm test`: executa SQL real e policies no PostgreSQL WASM PGlite; os helpers de Auth são uma fixture local.
- `test:company`: testes de isolamento, constraints, publicação, autonomia e revogação no PostgreSQL WASM.
- `test:ui`: Chromium; testes anteriores da Fundação com respostas simuladas e testes da Empresa conectados a SQL/PGlite por uma ponte HTTP de testes. Auth e JWT continuam simulados. Não é GoTrue/PostgREST real.
- `test:homologation-tools` e `test:company-tools`: guardas de ambiente, preparação SQL e conversão monetária.
- `test:local`: executa as baterias acima, configuração, typecheck e build. Configure o Chromium antes.
- `config-security`: confirma que segredo e service_role não são aceitos no build.

Em um Linux que permita PostgreSQL sob usuário não-root, a bateria nativa pode ser executada com:

```bash
npm run test:native
```

Ela cria e destrói um cluster descartável, sem ouvir na rede, e acrescenta dois testes com conexões independentes: revogação simultânea entre administradores e atribuição simultânea de atendente principal. Neste ambiente ela **não pôde executar**, pois só existe mapeamento para UID 0 e PostgreSQL exige usuário não-root. Não foi removida essa restrição nem declarado sucesso de concorrência.

Se o download padrão de Chromium estiver indisponível em um contêiner Linux, `scripts/prepare-browser.mjs` prepara o binário da dependência opcional já instalada. Defina `FOUNDATION_CHROMIUM_PATH` com o caminho absoluto resultante ao rodar os testes. As opções de execução desse navegador local não alteram segurança da aplicação.

## Instruções para publicação futura pelo usuário

A configuração `vercel.json` mantém rotas do frontend e adiciona cabeçalhos de segurança. O frontend recebe somente variáveis públicas: URL/chave pública do Supabase, URL do gateway e sitekey CAPTCHA quando configurado. Ajustar a CSP para os destinos exatos de gateway e CAPTCHA conforme `docs/future-launch.md`. A chave service_role pertence exclusivamente ao servidor Node e não ao frontend.

A Vercel permanece apenas como opção técnica documentada para publicação futura pelo próprio Marcelo. A escolha final de hospedagem, contratação, domínio, produção e lançamento pertence ao usuário. Nenhuma conta, domínio ou implantação foi criada neste trabalho. As instruções desta seção não autorizam o agente a publicar. A homologação técnica deve permanecer separada do lançamento.

## Conteúdo do pacote

- `AGENTS.md` e `docs/project-boundaries.md`: limites permanentes de atuação e controle das fases.
- `src/`: aplicação e cliente Supabase.
- `supabase/migrations/`: estrutura, autorização e comandos.
- `scripts/`: bootstrap restrito e runners auxiliares.
- `tests/`: testes de RLS, configuração e navegador.
- `reports/`: resultados e capturas locais com dados fictícios.
- `docs/architecture.md`: Fase 1 com ajuste aprovado.
- `docs/phase-2-report.md`: relatório histórico da Fundação.
- `docs/phase-3-report.md`: inventário e resultados históricos da Empresa.
- `docs/phase-4-report.md` e `docs/phase-4-test-matrix.md`: entrega e resultados históricos do Consumidor.
- `docs/phase-5-report.md`, `phase-5-sql-inventory.md`, `phase-5-test-matrix.md` e `phase-5-homologation.md`: entrega atual e preparação externa da Central.
- `docs/phase-4-homologation.md`: validação externa do Consumidor.
- `server/`: gateway de imagens e contrato futuro de pagamentos; nenhuma cobrança real.
- `docs/phase-3-homologation.md`: preparação da validação externa da Empresa.

A Fase 8 encerra o desenvolvimento previsto. **Aguardar autorização para HOMOLOGAÇÃO EXTERNA DO PRODUTO COMPLETO.** Não iniciar Fase 9, deploy ou produção. Relatórios anteriores permanecem como histórico.

## Recriar o pacote completo

Opcionalmente, com Python 3.9+, executar `python scripts/package-project.py` após atualizar os relatórios. O script gera o ZIP fora da pasta, atualiza `MANIFEST.json` com SHA-256 e verifica todos os arquivos arquivados. Exclui dependências, builds, credenciais, dumps e artefatos transitórios. `npm run check:bundle` refaz typecheck/build com marcador fictício server-only e verifica sua ausência no frontend.

## Revisão pré-homologação — Página da empresa

Gestores encontram **Página da empresa** na navegação permanente. A central reúne o link público, cópia para compartilhamento, identidade, portfólio, atalhos para informações/serviços/horários/FAQ e os controles de publicação existentes. A URL pública única continua `/empresa/:slug`.

Na demo, entre com o código `A1B2C3D4E5F6` e usuário `marina.costa`, abra a empresa fictícia e selecione Página da empresa. As fotos do portfólio são administradas nessa área. Rascunhos não mudam a versão pública até a publicação explícita. A prévia utiliza os mesmos cartões e dados publicados; **Ver página pública** abre a experiência completa.

Teste específico: `npm run test:company-page`. Navegador com demo: `npm run test:demo:browser -- company-page.spec.ts`. Relatório: `Relatorio-Pagina-Publica-Portfolio.md`. Nenhuma migration adicional nesta revisão. Homologação externa continua pendente.

## Versatilidade multissegmento — revisão pré-homologação

A mesma página e os mesmos fluxos atendem os três exemplos fictícios da demo padrão:

| Cenário | Página local | Gestor fictício |
|---|---|---|
| Estética automotiva | `/empresa/ms-auto-ficticia` | `A1B2C3D4E5F6` + `marina.costa` |
| Designer de interiores | `/empresa/horizonte-ficticio` | `B1B2C3D4E5F6` + `lia.horizonte` |
| Nutricionista (somente administrativo) | `/empresa/clara-nutricao-ficticia` | `C1B2C3D4E5F6` + `clara.nutri` |

Senha da demo: `FictitiousPassword123!`. Reiniciar `npm run dev:demo` recria a massa descartável. Não usar esse servidor como Auth real. O modo `DEMO_MINIMAL=true` continua sendo a fixture reduzida técnica, sem o cenário C.

Portfólio já aceita uma imagem ou galeria de 1–4 imagens; antes/depois é um formato opcional de duas imagens. Também é possível operar sem portfólio. O exemplo C não contém nem solicita prontuário, diagnóstico, evolução, prescrição ou histórico médico. Perguntas e notas são administrativas; este produto não é um sistema clínico.

Teste específico: `npm run test:multisegment`. Teste visual/HTTP local: `npm run test:demo:browser -- multisegment.spec.ts`. Auditoria: `docs/multisegment-audit.md`; relatório: `Relatorio-Versatilidade-Multissegmento.md`. Nenhuma migration nesta revisão; homologação externa continua pendente. Ao atualizar uma instalação existente, preserve suas configurações locais e banco; não execute fixtures de demo sobre dados persistidos.

## Revisão cumulativa SYZIA — pré-homologação

Marca oficial: **SYZIA — Onde tudo se alinha.** A identidade pública de cada organização permanece própria. Entradas administrativas provisionadas por código empresarial e username; navegação de plano/equipe explícita; preservação de rascunhos durante foco e renovação da sessão.

Relatório histórico desta revisão: `docs/vireloq/review-report.md`. **Para atualizar agora, siga `docs/access/upgrade.md`: 001–025 preservadas, somente 026 nova.** O antigo guia 025 foi substituído para fins operacionais.

- Demo segura e descartável: `npm ci`, `npm run dev:demo`.
- Platform API: `.env.server.example`, `npm run platform:dev`; credenciais exclusivamente server-side. SMTP deixou de ser necessário para acesso; Auth real da revisão 026 permanece pendente de homologação.
- Novos testes: `npm run test:vireloq`; regressão cumulativa: `npm run test:local`.
- Concorrência nativa opcional: `node scripts/test-native.mjs --invitations` (Linux, usuário comum).
- Histórico SQL: `node scripts/verify-historical-migrations.mjs`.
- Identidade e brand board: pasta `brand/`; vetores/ícones em `public/brand/`.
- Cobrança: catálogo/trial/mock existentes preservados; contrato de integração em `server/billing/hosted-checkout.mjs`. **Gateway não escolhido, adapter e persistência de eventos reais pendentes, checkout real não habilitado.** Não apresentar essa preparação como integração financeira concluída.
- Vídeo cancelado. Planejamento anterior em `docs/video-arquivado/`; não retomar sem nova solicitação expressa.

Nenhum deploy, conexão com Supabase real, contratação de serviço ou cobrança foi realizado nesta revisão. Parar após a entrega.

Ajuste visual posterior: caixas de seleção compactas e alinhadas ao texto. Relatório e verificações específicas em `docs/vireloq/checkbox-review.md`.

## Auditoria final de usabilidade e desempenho sobre a 044

Entrega de refinamento pré-lançamento, sem nova migration ou mudança de regra. Consulte:

- `RELATORIO-USABILIDADE-DESEMPENHO.md`: causas, correções, regressão e limites;
- `MATRIZ-ANTES-DEPOIS.md`: medições locais por fluxo/dispositivo;
- `UX-AGUARDANDO-APROVACAO.md`: decisões estruturais não implementadas;
- `ARQUIVOS-ALTERADOS.md`: inventário e integridade da base;
- `GUIA-ATUALIZACAO-UX.md`: aplicação dos arquivos e reprodução local.

O gate oficial permanece `npm run test:current-gate`. As evidências desta rodada estão em `reports/ux-performance/`; os relatórios anteriores permanecem preservados. Sem publicação automática.

## Correção final UX-001 e feature freeze

Entrega sobre o consolidado final de usabilidade da 044. Relatório vigente desta intervenção: [RELATORIO-UX001-FINAL.md](RELATORIO-UX001-FINAL.md), [matriz antes × depois](MATRIZ-ANTES-DEPOIS-UX001.md) e [inventário](ARQUIVOS-ALTERADOS-UX001.md). Evidências em `reports/ux001/`. Nenhuma migration nova; nenhuma publicação executada. UX-002 permanece adiado para pós-lançamento.

Gate oficial: `npm run test:current-gate`, com cobertura UX-001 aditiva. Os relatórios anteriores continuam como registros históricos. Após os critérios de encerramento documentados no relatório: **SYZIA — FEATURE FREEZE FUNCIONAL PRÉ-LANÇAMENTO**. Nenhuma próxima atividade automática está autorizada.
