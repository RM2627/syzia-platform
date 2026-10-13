# Complemento jurídico 050 — autorização atual

Preparar versionamento e novo aceite sobre a 050, sem refazer o hotfix financeiro. Contrato em `docs/legal-050/README.md`. Operador inicial pessoa física: não inserir CPF completo, residência ou dados pessoais reais; configuração preenchida/saídas ficam fora do checkout. Identificação e contatos dependem de avaliação e aprovação expressa. Sem execução no Supabase real, publicação, deploy, push, credenciais ou cobrança. Preservar versões, aceites, trigger, RLS/FORCE RLS, todas as migrations e `server/`. Testes `test:legal:050`, `test:legal:050:browser`, gate completo; concorrência nativa tem comando separado e bloqueio ambiental deve ser declarado. Entrega incremental complementar, depois parar. A autorização atual substitui somente a pendência de preparar o versionamento registrada abaixo, não autoriza publicação.

# Hotfix 050 — notificações e conteúdo jurídico

Escopo e limites atuais em `docs/hotfix-050/README.md`. Modo de observação Mercado Pago explícito e desligado por padrão; sem comandos comerciais, trial, capabilities ou reconciliação em observação. Preservar HMAC MP-01, motor financeiro e todas as 46 migrations. Não executar Supabase real, deploy, cobrança, assinatura externa ou configurar credenciais. Textos legais revisados em `docs/hotfix-050/` são propostas: a integração em `legal_documents` depende de autorização específica e identificação jurídica/contato. Nunca substituir no frontend o conteúdo de um aceite imutável. Não declarar MP-01 ou documentos jurídicos públicos concluídos sem essas evidências/decisões. Testes focados `test:hotfix:050`, navegador `test:hotfix:050:browser`, regressão jurídica `test:hotfix:050:legal` e gate vigente. Parar após entregar; não iniciar outra rodada.

# Continuidade do hotfix consolidado 049 + Sharp

Escopo e contratos: `docs/hotfix-049/README.md`. Atualização por sobreposição; migration incremental 050. Preservar byte a byte 001–049 e Sharp 0.35.5. Novos testes: `test:hotfix:049`, `test:hotfix:049:browser` e concorrência local opcional `test:hotfix:049:native`; o gate vigente continua obrigatório. Não ampliar a emissão de credenciais de acompanhamento para funcionários limitados. A aplicação no Supabase real, Auth Hook, SMTP, Mercado Pago e MP-01 dependem do proprietário. Sem commit/push/deploy/DNS/produção. As instruções históricas abaixo não autorizam outra rodada nem substituem a entrega incremental solicitada.

# Continuidade da base 049

Escopo autorizado e concluído nesta rodada: `docs/syzia-049/request.md`. Entrega por sobreposição na raiz de foundation; ver `SYZIA-049-INSTALACAO.md` e os dez relatórios 049. Não ampliar funcionalidades. Preservar migrations 001–048 byte a byte e a nova 049. Banco/credenciais reais e MP-01 continuam sob homologação externa do proprietário. Não repetir configuração dos seis planos, não ativar billing no Render, não publicar/push/DNS/deploy. Validar base limpa e PARAR. Instruções anteriores abaixo são históricas e não autorizam nova rodada.

# Continuidade da base 048

Exceção autorizada: backend único (`server/unified.mjs`, `PORT`, um Node/uma porta) e Manual opcional para a equipe própria. Fonte atual: `docs/syzia-048/escopo.md`, `GUIA-UPGRADE-048.md` e `GUIA-HOSPEDAGEM-PORTA-UNICA.md`. Preservar migrations 001–047 byte a byte e a nova 048. Equipe SYZIA compartilhada conserva exigência de orientação publicada, grants, autonomia, disponibilidade e consumo. Billing 047 e MP-01 permanecem preservados. Não comercializar Assistido, não reabrir UX-002, não fazer deploy, DNS, SQL no Supabase real ou cobrança real. Validar a extração limpa; entregar e PARAR. As autorizações anteriores abaixo são históricas e não ampliam o escopo atual.

# Continuidade da base 047

Exceção autorizada ao freeze: exclusivamente Checkout/Assinaturas Mercado Pago 047 e limpeza de artefatos. Não reabrir UX-002, não alterar planos/preços/trial, não comercializar Assistido e não fazer deploy. Ver GUIA-UPGRADE-047.md e docs/billing-047/ESTADOS-E-POLITICAS.md. Preservar toda a cadeia de migrations, inclusive 045/046/047. Resultados históricos ficam fora do pacote; testes/fixtures e entradas listadas em reports/README.md permanecem. Executar gate sobre extração limpa. MP-01 é pendência externa explícita, não presumir configuração de Checkout Pro para Assinaturas.

# Instruções permanentes do projeto

Leia `docs/project-boundaries.md` e `docs/scope-phase-8.md` antes de trabalhar. Estas regras foram determinadas expressamente por Marcelo e devem acompanhar todas as entregas.

- Estado atual: Fases 2–7 aprovadas para continuidade do DESENVOLVIMENTO; Fase 8 — Finalização do Produto autorizada e última fase. Ao terminar, parar. Não criar Fase 9; homologação externa exige autorização separada.
- Trabalho autorizado: desenvolver, organizar, testar e entregar o PROJETO COMPLETO E ATUALIZADO com arquivos portáteis. Não entregar somente diffs. Código, migrations desde a primeira, configurações, lockfile, scripts, testes, fixtures, documentação, guias e relatórios devem acompanhar o pacote.
- DESENVOLVIMENTO local é distinto de HOMOLOGAÇÃO EXTERNA. Dependências de Supabase real, Auth, SMTP, Storage, PostgREST, credenciais, concorrência e restauração ficam PENDENTES DE HOMOLOGAÇÃO EXTERNA quando não executadas. Preservar ferramentas e instruções para Marcelo; pendência externa não impede fases expressamente autorizadas e viáveis localmente. Nunca apresentar mocks como validação real.
- PRODUÇÃO/LANÇAMENTO são exclusivos de Marcelo. Não executar deploy em serviço algum, publicar, disponibilizar a clientes reais, contratar/ativar serviço pago, comprar/configurar domínio de produção ou tomar decisões de lançamento em seu nome. Preparar instruções não autoriza executar publicação.
- Usar exclusivamente dados fictícios. Não conectar, copiar ou importar o banco real da MS Auto Details nem dados de clientes reais.
- Preservar RLS/FORCE RLS, constraints, autorização atual, isolamento multiempresa/consumidor, auditoria, operações transacionais e idempotência. Não relaxar proteções para fazer testes passar. Nenhuma chave privilegiada no frontend.
- Central genérica e multiatendente: nomes vêm de perfis; nenhum operador real hardcoded. Ticket é a unidade, sem camada conversation paralela. Reutilizar manual publicado/autonomia, orçamento e agenda existentes.
- Nesta fase não há IA, chatbot, WhatsApp Business API, telefonia, gateway real, cobrança real, ponto/folha ou automação comercial fora do escopo. Billing fictício e planos estão autorizados na Fase 8.
- Pagamentos da Fase 4 permanecem OPCIONAIS e em preparação. Nenhuma custódia, carteira, transação financeira real ou confirmação de pagamento pela Central.
- Follow-up/recuperação: intervalos e limite de tentativas configuráveis por empresa e, quando aplicável, serviço/regra. Não fixar dois dias úteis. Padrão proposto: duas tentativas. Não implementar a automação antes da fase autorizada.
- Relatar testes efetivamente executados, resultados, falhas/correções e limitações; separar local de externo; não ocultar validação que não pôde ocorrer. Preservar guias de homologação das fases anteriores como histórico.

- Qualidade profissional de UI/UX e demo fictícia completa/resetável são requisitos de produto. Métricas server-side, sem receita presumida, rankings ou vigilância. Não executar homologação externa agora.

- Encerramento local da Fase 7: implementação, regressão e pacote completo entregues; relatório docs/phase-7-report.md. Aguardar aprovação expressa antes de Fase 8. Homologação externa não concluída.

- A autorização posterior em docs/scope-phase-8.md substitui as pausas históricas para Fase 8. Preservar histórico, registrar novo resultado sem reescrever relatórios anteriores.

- Encerramento local da Fase 8: projeto cumulativo e 500 casos únicos aprovados; evidências e limites em docs/phase-8-report.md. Desenvolvimento previsto encerrado. Aguardar autorização explícita para HOMOLOGAÇÃO EXTERNA DO PRODUTO COMPLETO. Não iniciar Fase 9, deploy, piloto ou produção.

- Complemento posterior expressamente autorizado: trial configurável, demo de 15 dias, elegibilidade entre organizações, histórico persistente, exceções/extensões auditadas e testes. Escopo em docs/trial-and-abuse.md. Essa autorização permite atualizar a Fase 8 localmente; não autoriza nova fase, homologação externa ou produção. Identificador informado nunca é identidade verificada.

## Autorização posterior — revisão operacional e onboarding

Marcelo autorizou a revisão final pré-homologação (`docs/scope-operational-review.md`) e o onboarding guiado: Home por tarefas, agenda e ficha, operação manual, distinção de atendentes, notificações e tutorial persistido. Trata-se de complemento cumulativo das Fases 2–8, não de Fase 9. Preservar migrations 001–021; novas migrations 022–024. Sem Supabase real, deploy, dados reais ou serviços pagos. Entregar projeto completo, relatório e guia externo; parar ao concluir.

## Autorização posterior — página pública e portfólio

Revisão pré-homologação autorizada em `docs/public-page-review-scope.md`: central Página da empresa, compartilhamento, portfólio e integração com onboarding. Reutilizar a estrutura existente; não criar segunda página pública ou modelo paralelo. Preservar migrations 001–024. Sem Supabase real/deploy/produção. Entregar ZIP cumulativo e relatório; parar.

## Autorização posterior — versatilidade multissegmento

Revisão pré-homologação autorizada: auditar antes de alterar; preservar o que já for genérico. Ajustes locais de linguagem e contraste, fixtures de três segmentos e testes na mesma estrutura. Não criar profissão obrigatória, modelos paralelos, page builder ou funções clínicas. Preservar migrations 001–024. Auditoria em `docs/multisegment-audit.md`; sem conexão externa/deploy/produção. Entregar pacote cumulativo e parar.

## Autorização posterior — revisão integrada VIRELOQ

Revisão única pré-homologação autorizada: identidade VIRELOQ (“Onde caminhos se conectam.”), acesso B2B por convite, gestão de equipe, trial existente, descoberta da assinatura, caminho de checkout/provider server-side e preservação de formulários. Auditar/reutilizar antes de alterar; manter 001–024 byte-identical. Gateway comercial ainda não escolhido: não hardcodar, contratar ou cobrar; dependência externa explícita. Não modificar Supabase real nem executar deploy. Vídeo atual CANCELADO: preservar roteiro/levantamento, mas não gravar, editar, renderizar, finalizar ou retomar sem nova solicitação explícita após homologação. Entregar uma versão cumulativa e relatório; parar.

## Autorização posterior — acesso empresarial (026)

A solicitação integral em `docs/access/request.txt` substitui convites por e-mail por código empresarial + username + senha, provisionamento/código temporário, recuperação administrativa, inatividade e documentos legais. Preservar 001–025 byte-identical, sem reset, novas alterações somente aditivas. A arquitetura atual está em `docs/access/architecture.md`. Não reativar convites, não produzir vídeo, não acessar Supabase real, não contratar provedores nem executar deploy. Entrega cumulativa e parada após relatório. Termos/Privacidade são minutas pendentes de revisão pelo proprietário.

## Correção posterior — ativação empresarial após homologação da 026

Escopo autorizado: `docs/organization-activation/request.txt`. Preservar 001–026 byte-identical; alterações persistentes somente na 027 incremental. Reutilizar enterprise access, permitir empresa sem administrador, entrega de instruções, primeiro login unificado, gestão global e exclusão conservadora. Não reativar convite Auth, não criar membership artificial, não apagar auditoria/trial. O proprietário informou homologação do Super Admin na 026; esta correção 027 e SMTP continuam pendentes de validação externa. Não acessar Supabase real, enviar e-mail real, publicar, contratar ou retomar vídeo. Entregar ZIP completo e relatório, depois parar.

## Correção posterior — Minhas empresas e onboarding (028)

Marcelo autorizou explicitamente abrir e configurar o ambiente empresarial com a autorização global do Super Admin, sem membership artificial, independentemente de haver administrador. Essa autorização substitui a restrição histórica de gestão global no ambiente empresarial. Reutilizar CompanyExperience e módulos existentes; Abrir empresa e Definir administrador são ações distintas. Preservar 001–027 byte-identical; correção de autorização somente na 028 incremental. Manter sessão, escopo, status, RLS/FORCE RLS, auditoria, trial e restrições dos usuários empresariais. Relatório e atualização em docs/company-workspace/. Sem Supabase real, deploy, vídeo ou dados reais; entregar o projeto completo e o relatório, depois parar.

## Auditoria funcional mestre — 029

O anexo em docs/master-audit/request.md refina a 028: acesso operacional global direto apenas sem ADM responsável; com ADM, suporte temporário autorizado ou emergência controlada. Preservar 001–028. Reutilizar onboarding e módulos; entregar projeto completo, matrizes e relatório. Sem Supabase/SMTP/Storage/provider reais, deploy ou vídeo. Guia atual: docs/master-audit/upgrade.md.

## Implementação 030 — autorização posterior

O escopo integral autorizado está em `docs/implementation-030/request.md`: financeiro empresarial, métricas, permissões granulares, categorias, capacidades, verificação cadastral e empresas internas/isentas. Esta autorização substitui as pausas históricas para essas alterações locais. Preservar 001–029; somente 030 incremental, sem reset. Sem serviços reais, deploy ou dados reais. Entregar projeto cumulativo completo e parar para homologação do proprietário.

- Entrega local da 030 preparada com migration incremental, matrizes e evidências em `docs/implementation-030/`. Limite explícito: concorrência PostgreSQL nativa não executada por bloqueio do contêiner; oito casos preparados. Após entregar, parar para homologação do proprietário, sem deploy nem nova fase.

## Correção pós-homologação da 030 — presença pública

Autorização atual em `docs/presence-correction/request.txt`: corrigir apenas categorias no formulário, identidade visual, catálogo/imagens, portfólio, prévia, publicação e apresentação das formas de pagamento. Testar somente os fluxos afetados, isolamento básico, navegador e build/typecheck. Preservar migrations 001–030 byte a byte. A 031 só é autorizada mediante necessidade persistente documentada. Não acessar ambiente real, alterar módulos financeiros/Auth/trial/billing ou fazer deploy. Entregar projeto completo e parar.

## Rodada pós-homologação 031 — SYZIA

Autorização atual: `docs/syzia-032/request.txt`. Implementar rebranding conforme referência aprovada, identidades independentes de empresas/equipe global, pessoas e acessos, operação solo, configuração real da agenda, tema público claro/escuro e diagnóstico de mídia/autorização. Preservar migrations 001–031; persistência nova apenas em 032 justificada. Testes focados, sem auditoria mestre, dados reais, Supabase real, deploy, domínio ou vídeo. Entregar projeto completo e parar.

- Encerramento local da rodada SYZIA 032: documentação e limites em `docs/syzia-032/`. Preservar 001–031. Após entrega, parar para homologação pelo proprietário; nenhuma publicação ou nova fase autorizada.

## Rodada pós-homologação 032 — SYZIA 033

Autorização atual em `docs/syzia-033/request.md`: UX, site institucional, aquisição, self-service integrado ao onboarding, billing preparado, recorrências financeiras e autenticação/diagnóstico. Preservar 001–032; somente 033 incremental se necessária. Sem reset, deploy, cobrança real, dados reais ou nova auditoria mestre. Entregar consolidado completo e parar para homologação.

- Encerramento local da rodada SYZIA 033: relatório, upgrade e limites em `docs/syzia-033/`. Migrations 001–032 intactas. Após a entrega, parar para homologação do proprietário; nenhuma publicação ou nova fase autorizada.

## Autorização posterior — rodada 034

Escopo explícito em `docs/syzia-034/request.md`: entrega manual de credenciais, mídia/enquadramento e enriquecimento da landing sobre a 033. Preservar migrations 001–033, Auth/RLS/grants/Storage e histórico. Desenvolvimento e testes locais focados; sem reset, deploy, produção, serviços reais ou vídeo. Entregar pacote completo e parar para homologação do proprietário.

- Encerramento local da 034: fontes, testes focados, evidências e entrega cumulativa documentados em `docs/syzia-034/relatorio.md`. Aguardar homologação do proprietário. Sem autorização para nova fase, reset, deploy ou produção.

## Autorização posterior — rodada 035

Escopo em `docs/syzia-035/request.md`: apresentação da demo, consistência da capa 4:3 e diagnóstico/correção de provisionamento Auth. Preservar 001–033 byte a byte e fluxos 034; testes focados, sem auditoria mestre, reset, deploy ou serviços reais. Entregar consolidado completo e parar para homologação do proprietário.

- Encerramento local da 035: escopo concluído e validação focada em `docs/syzia-035/relatorio.md`. Sem migration nova. Entregar e parar para homologação; não iniciar outra rodada.

## Autorização posterior — rodada 036

Escopo em `docs/syzia-036/request.md`: primeiro acesso por link opaco e código temporário, login por identidade sem código empresarial visível, diagnóstico e compatibilidade. Preservar 001–033 byte a byte; migration incremental somente se indispensável. Sem reset, deploy, produção ou nova auditoria mestre. Entregar consolidado e parar para homologação.

- Encerramento local da 036: primeiro acesso/login implementados na base 035; migration 036 incremental e 001–033 intactas. Evidências/limites em `docs/syzia-036/relatorio.md`. Causa exata dos dois eventos históricos não comprovada pelos logs fornecidos. Após entrega cumulativa, parar para homologação do proprietário.

## Autorização posterior — rodada 037

Escopo em `docs/syzia-037/request.md`: reapresentar credenciais após reemissão, com foco/scroll e feedback específico. Base exclusiva 036; reutilizar Instructions e emissão existente. Preservar Auth, RPCs, seletor, migrations, dados e módulos fora do escopo. Sem reset, deploy, serviços reais ou nova fase. Entregar consolidado e parar para homologação do proprietário.

- Encerramento local da 037: correção da reapresentação de credenciais entregue com testes focados, sem migration ou alteração de backend. Relatório em `docs/syzia-037/relatorio.md`. Parar para homologação do proprietário, sem nova fase ou deploy.

## Autorização posterior — rodada 038

Escopo integral em `docs/syzia-038/request.md`: publicação, tema público, solicitação multisserviço, relações de catálogo, revisão discriminada e visualizador de senhas. Base exclusiva 037. Preservar migrations anteriores; nova 038 incremental justificada, sem reset. Reutilizar Central, orçamento e acesso seguro. Testes focados, sem auditoria mestre, serviços reais, deploy ou produção. Entregar consolidado e parar para homologação do proprietário.

- Encerramento local da 038: implementação e 36 casos focados aprovados, com migration incremental e histórico 037 preservado. Relatório em `docs/syzia-038/relatorio.md`. Entregar e parar para homologação do proprietário; sem homologação externa completa, reset ou deploy.

## Autorização posterior — rodada 039

Escopo integral em `docs/syzia-039/request.md`: configurador comercial, entitlements reais, limites/cotas, validação de atribuições, preparação provider-neutral e limpeza pré-lançamento. Base exclusiva 038; preservar todas as migrations anteriores. Somente 039 incremental justificada e testada sobre banco populado; sem reset, provedor real, cobrança, deploy, produção ou auditoria mestre. Manter contratos e concessões existentes. Entregar consolidado e parar para homologação do proprietário, sem iniciar automaticamente a homologação completa do atendimento.

- Encerramento local da 039: 74 casos focados aprovados, build/typecheck/bundle aprovados e histórico preservado. Relatório em `docs/syzia-039/relatorio.md`. Entregar e parar para homologação do proprietário; sem provider real, reset, deploy ou homologação completa de atendimento.


## Autorização posterior — rodada 040

Executar o escopo em `docs/syzia-040/request.md` exclusivamente sobre o consolidado 039. Trial automático com elegibilidade; plano real temporário de homologação; planos e grants; Central e continuidade; Equipe SYZIA; identidade publicada do consumidor; FAQ e labels. Somente migration 040 incremental, com upgrade populado e preservação integral das anteriores. Testes focados e regressão necessária, sem auditoria mestre, reset, integrações reais, deploy ou produção. A implementação está autorizada pelo documento anexado nesta sessão. Entregar projeto completo e parar para validação manual do proprietário, sem próxima rodada automática.

## Autorização posterior — rodada 041

Executar o escopo integral em `docs/syzia-041/request.md` exclusivamente sobre o consolidado 040. Autoatendimento determinístico, horário pretendido para avaliação, roteamento por autoridade, ajuda contextual, anexos privados e calculadora de proposta. Reutilizar motores, tokens, entidades, grants, RLS e auditoria; preservar todas as migrations anteriores byte a byte. Somente 041 incremental se indispensável. Testes focados e regressão necessária; sem reset, dados reais, deploy, publicação, provider ou auditoria mestre. Entregar projeto completo e parar para validação manual.

- Encerramento local da 041: autoatendimento, avaliação, ajuda contextual, anexos e calculadora implementados. Evidências e limites em `docs/syzia-041/relatorio.md`. Entregar consolidado e parar para validação manual do proprietário; sem deploy, próxima rodada ou homologação externa automática.

## Autorização posterior — rodada 042

Executar o escopo integral em `docs/syzia-042/request.md` sobre o consolidado 041: identidade global versus autonomia local, Home operacional, UX de proposta/agenda e execução divisível em múltiplos períodos. Reutilizar arquitetura, preservar migrations anteriores byte a byte, somente 042 incremental quando necessária. Sem reset, serviços reais, dados reais, deploy ou bateria mestre. Entregar todos os arquivos e parar para homologação manual curta.

- Encerramento local da 042: 124 casos focados/regressão/navegador aprovados, build/typecheck/bundle aprovados, upgrade populado e integridade preservados. Relatório em `docs/syzia-042/relatorio.md`. PostgreSQL nativo bloqueado pelo ambiente; homologação externa e bateria final pendentes. Entregar consolidado e arquivos individuais, e parar para homologação manual curta. Não iniciar 043, deploy ou bateria mestre.

## Rodada 044 — correções expressamente aprovadas da auditoria 043

Escopo atual: `docs/syzia-044/request.md`. Somente AUD-001 a AUD-004: aprovação antes da reserva pública, manual legítimo, buffer vigente na remarcação, ordem das partes e gate cumulativo. Base exclusiva 042 intacta; históricos preservados; somente migration 044 incremental, sem 043/reset. Gate oficial `npm run test:current-gate`; instruções e mapa em `docs/testing/current-regression-gate.md`. Relatório e upgrade em `docs/syzia-044/`. Após corrigir/testar/documentar/entregar, PARAR. Não iniciar bateria final ampla, 045, homologação externa, deploy, publicação, demo oficial ou vídeo sem nova autorização.

## Auditoria final de usabilidade e desempenho — sobre a 044

Escopo: `docs/usability-performance/request.md`. Somente otimizações de baixo risco de carregamento, consultas redundantes, feedback e estabilidade visual. As 40 migrations existentes permanecem intactas; nenhuma migration nova. Regras, capacidades, planos, autorização, RLS e navegação estrutural não foram alterados. Gate vigente continua `npm run test:current-gate`. Relatório desta rodada: `RELATORIO-USABILIDADE-DESEMPENHO.md`; decisões não implementadas: `UX-AGUARDANDO-APROVACAO.md`. Ao entregar, parar; feature freeze previsto pelo proprietário, exceto bug sério. Sem deploy, publicação, dados reais ou nova rodada automática.

## Autorização posterior — correção cirúrgica UX-001

Escopo integral: `docs/ux001/request.md`, sobre `SYZIA-044-UX-Final-Consolidado`. Somente preservar o contexto empresarial na abertura/troca de tickets, filtros por empresa/área e links de origem, mantendo Central global. UX-002 explicitamente ADIADO_PARA_POS_LANCAMENTO: não modificar login/AuthProvider/sessão/revalidação. Migrations, backend e testes históricos intactos. Gate vigente ampliado de forma aditiva, mesmo comando `npm run test:current-gate`. Relatório desta entrega: `RELATORIO-UX001-FINAL.md`.

Após gate PASS e entrega: **SYZIA — FEATURE FREEZE FUNCIONAL PRÉ-LANÇAMENTO**. Não adicionar funcionalidades, redesign, arquitetura ou alteração de fluxo; não implementar UX-002 antes do lançamento. Exceções: bug sério, segurança, perda/corrupção de dados, bloqueio de lançamento ou autorização explícita do proprietário. PARAR após consolidar e entregar. Sem deploy, publicação, homologação externa ou marketing automático.

## Exceção controlada ao freeze — disponibilidade e Assistido (045)

Autorização integral: `docs/team-availability/request.txt`, base obrigatória `SYZIA-044-UX001-Feature-Freeze-Consolidado`. Somente disponibilidade individual integrada à Agenda e política global/configuração de consumo do Assistido. Preservar migrations 001–044 byte a byte; migration 045 incremental, transacional e sem reset. Valores comerciais e horários definitivos permanecem pendentes do proprietário. Manter UX-001, PERF-001–013 e UX-002 adiado. Gate cumulativo no mesmo comando `npm run test:current-gate`. Sem deploy, publicação, provider/checkout, preços, trial ou novas fases. Após validação e entrega, parar. Limites externos permanecem separados da validação local.


## Refinamento autorizado — suporte compartilhado flexível (046)

Escopo integral: `docs/flexible-support/request.txt`, base obrigatória 045 consolidada. Acrescentar modo conforme disponibilidade da equipe, reutilizando presença e fila da Central; preservar modo programado, disponibilidade individual, Agenda, consumo por ticket/ciclo, limites e auditoria. Migrations até 045 intactas; somente 046 incremental necessária para persistir o modo. Sem horário comercial ou quota definitiva, SLA, RH, preço/trial, pagamento, UX-002, deploy ou publicação. Após testes, gate e entrega, restabelecer freeze se aprovado e PARAR.
