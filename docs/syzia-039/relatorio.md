# SYZIA 039 — relatório técnico de entrega

Data: 25/09/2026. Base exclusiva: consolidado 038. **74 casos locais aprovados**, typecheck/build/bundle aprovados. Nenhum reset, deploy, provedor real, cobrança real ou dado pessoal real. Entrega cumulativa para homologação do proprietário.

## 1. Limpeza pré-lançamento

Removidos “Preço fictício (R$)”, “valor fictício”, a classificação genérica de todo preço como demonstrativo e mensagens comerciais de simulação fora do seu contexto. O criador usa **Preço (R$)**, **Teste gratuito (dias)** e **Ordem de exibição**. O self-service distingue texto de preparação real e identificação da demo.

A imagem da landing foi recapturada da página pública atual do **Estúdio Horizonte**, sem o nome antigo “• Fictício” nem “Demonstração local · dados fictícios”. Há uma única identificação na própria captura: **Exemplo de página criada com a SYZIA**. Sem redesign de marca ou landing.

A varredura de `src` e das rotas públicas/administrativas verificou resíduos. Ocorrências remanescentes são: validações de origem local em código; nomes de propriedades/RPCs internas; mensagens condicionais de dados explicitamente simulados; fluxo histórico de convites com proteção de demo. Fixtures e documentação técnica mantêm a identificação necessária de dados sintéticos. Não se alteram automaticamente nomes/dados cadastrados pelo proprietário para “limpar” seu banco.

Os rótulos de invoices/eventos simulados permanecem honestos: **Simulação — sem pagamento real**. Eles não são apresentados como recebimentos reais.

## 2. Novo criador comercial

O configurador separa informações, recursos, disponibilidade comercial e capacidade. Não preenche preço definitivo. Tem nome livre, descrição, periodicidade, teste, ordenação, status, opções comerciais e limites opcionais.

Inclui a operação básica existente: presença pública/portfólio, clientes/acompanhamento, solicitações/orçamentos/agenda, pendências, atendentes próprios, membros e papéis. Recursos opcionais: financeiro, métricas, follow-up/recuperação e atendimento humano compartilhado SYZIA. Itens do pacote básico não ganham seletores artificiais sem capacidade independente.

A seção comercial diferencia plano ativo, disponível para novas empresas, mostrar no site, cadastro self-service e oferta de teste no cadastro. Plano interno usa o mesmo domínio, com publicação/cadastro desmarcados.

## 3. Recursos e limites

`null` aparece explicitamente como **Ilimitado**. Novos planos não recebem cotas numéricas por padrão. Membros/serviços podem ter teto; solicitações também podem receber um limite explícito se o proprietário decidir. Orçamentos e agendamentos não têm cota numérica. Atendimento e follow-up próprios são ilimitados na nova modalidade.

Capacidade humana da SYZIA aparece separada e somente quando o recurso correspondente está incluído. Super Admin não ocupa vaga empresarial; vínculos de atendentes compartilhados continuam fora de `organization_members`. Administrador e colaboradores/atendentes próprios ativos contam como membros.

## 4. Semântica das cotas

Um pedido multisserviço = uma solicitação. A primeira ação substantiva humana compartilhada no ticket consome uma unidade; abrir, ver, assumir, transferir, reabrir e anotar não consomem. Mensagens sucessivas não consomem novamente. Orçamento/agenda registrados no ticket também podem estabelecer o primeiro atendimento.

Follow-up é contado no registro efetivo do resultado/tentativa. Criar, consultar, assumir ou iniciar tarefa não consome. Tentativas próprias não usam a capacidade humana SYZIA. Os registros ficam na tabela de uso existente, com unicidade e auditoria.

A marca `quota_semantics` distingue contratos anteriores (1) e novas condições (2). Histórico anterior não é recontado/excluído; seus tetos são preservados. O editor permite adotar a nova modalidade em uma **nova versão**, sem converter assinaturas existentes. Detalhes de compatibilidade em `architecture.md`.

## 5. Mapa recurso → entitlement

| Oferta | Backend |
|---|---|
| Operação básica | `software` + permissões/RPCs existentes e guardas de novas solicitações, propostas e agendamentos |
| Configuração inicial | `setup`; preserva preparação, papéis e regularização |
| Financeiro | `finance` no catálogo de permissões, RPCs e RLS |
| Métricas | `analytics`; métricas financeiras exigem também `finance` |
| Follow-up | `commercial_followups`, permissões e trigger de tentativas |
| Atendimento compartilhado | `human_support`, elegibilidade, vínculos e autonomia existentes |
| Membros/serviços | Contagem e limite aplicados em triggers sob lock |

Financeiro/métricas foram estendidos no JSON de capacidades já existente. Versões e concessões antigas sem essas chaves herdam o comportamento de `software`. Não há sistema paralelo.

## 6. Validação das atribuições

O bloco mostra incluído/não incluído e vínculo ao servidor, limite de membros e **Plano consistente**. A validação detecta capacidade desconhecida, divergência de flags, inconsistência de site/self-service/trial, capacidade humana sem recurso correspondente e ausência de vínculos de enforcement. O servidor repete a validação no salvamento; não depende de botão oculto.

O teste de metadados alterados confirmou que retirar um vínculo esperado do catálogo torna o plano inconsistente e impede salvamento. Não se concede autoridade empresarial por editar ofertas globais.

## 7. Resumo e versionamento

Antes de salvar, o resumo mostra nome, descrição, valor, periodicidade, teste, recursos, itens não incluídos, limites/ilimitados, oferta humana, site, cadastro e status. A passagem ao resumo recebe foco e scroll, inclusive no celular.

Cada alteração cria uma versão imutável. Testes confirmaram assinatura antiga na versão antiga, nova adesão na versão atual, recusa de edição direta da versão, upgrade confirmado explicitamente e downgrade aplicado apenas na renovação. Preço/capacidades/limites não são substituídos por editar a oferta.

## 8. Assinatura e capacidades

O navegador não ativa por retorno de checkout nem informa pagamento confirmado. Na simulação local explicitamente habilitada, apenas o evento validado correspondente muda a assinatura. A ausência de provider bloqueia a preparação de cobrança nos ambientes sem runtime de simulação e não concede assinatura substituta gratuita.

Falha/pagamento pendente não libera software. Suspensão bloqueia novas operações aplicáveis, conserva os dados e mantém acesso à regularização. As concessões administrativas e o regime legacy seguem preservados.

## 9. Billing Provider Adapter

Reutilizado hosted checkout, com vocabulário estável em `server/billing/contract.mjs` e ação explícita de alteração de plano. A fronteira trata reserva de preço/versão, criação de checkout, validação de webhook, consulta autenticada do contrato, normalização, cancelamento/reativação, renovação/regularização e mudança de versão. Confirmação compara associação, preço, moeda e versão antes de aplicar o estado.

Os testes exercitam autenticação de webhook, retorno sem ativação, repetição idempotente, evento antigo, divergência de associação/valor, revogação, ausência de fallback e preparação de upgrade/downgrade. O store dos testes é em memória; **store durável real e adapter de fornecedor continuam pendentes**. A 039 não afirma que uma integração externa já está pronta ou homologada.

## 10. Administração → Cobrança

Nova rota `/admin/cobranca`, protegida para Super Admin, com RPC autorizada e sem segredos:

| Campo | Estado |
|---|---|
| Provedor | Não configurado |
| Status | Aguardando integração |
| Checkout | Não disponível |
| Webhooks | Não configurados |

É possível configurar planos e voltar a Planos e assinaturas. Nenhum fornecedor foi escolhido, conta externa criada, webhook ativado ou pagamento efetuado.

## 11. Testar atribuições do plano

A ação executa verificações reais do backend em cenário temporário: capacidades, RPCs, vagas, suspensão, regularização e A/B. Retorna **Permitido / Bloqueado / Inconsistência**. Todo cenário é revertido, inclusive identidades, membros, contratos e auditoria de linhas. O ator/contexto original é restaurado. As contagens antes/depois confirmaram ausência de registros persistidos.

Para até 20 membros, há inserção real até o limite e tentativa do membro excedente; para limites maiores, o resultado identifica a verificação do cálculo usado pelo trigger. Não é uma homologação completa dos módulos nem um pagamento. O teste de 3 membros mostrou o 4º bloqueado.

## 12. Migration

Nova `202609250039_commercial_plans.sql`, incremental e transacional. Justificada por capacidades adicionais no domínio existente, modalidade de cotas, novas métricas de uso, guardas, validação, diagnóstico e estado de provider.

Upgrade exercitado em banco populado, com assinaturas, versões, trial administrativo, concessão interna, uso, tickets, propostas e histórico. Comparação antes/depois preservou os registros existentes, exceto a coluna aditiva de modalidade na projeção das versões. **As 35 migrations anteriores estão byte a byte intactas.** Nenhum reset ou reescrita do histórico de migrations.

## 13. Testes executados

| Verificação | Resultado |
|---|---:|
| SQL 039: configurador, capacidades, RLS, cotas, imutabilidade, assinatura, upgrade populado e diagnóstico | 26/26 |
| Suite 038 reutilizada sobre a 039: pedido multisserviço, orçamento, Central, agenda, tokens, publicação e isolamento | 22/22 |
| Fronteira de provider e hosted checkout, incluindo extensão 039 | 20/20 |
| Navegador: captura/limpeza, configurador/teste/resumo, disponibilidade/versionamento, cobrança, mobile e rotas | 6/6 |
| **Total de casos locais únicos** | **74/74** |
| Typecheck + build de produção + marcador server-only ausente do bundle | **PASS** |

Evidências em `reports/syzia-039/`. Chrome/Playwright no ambiente local, banco PGlite e identidades sintéticas. A fonte do mockup e as telas de resumo desktop/mobile e cobrança foram inspecionadas visualmente. Repetições de correção não são somadas ao total.

Durante o desenvolvimento, as verificações encontraram e corrigiram: caminho de métricas financeiras com recurso financeiro excluído; referência a coluna de trigger em tabela diferente; conflito na preparação de verificação cadastral do cenário descartável; posicionamento de scroll do resumo. Ajustes de seletores/argumentos dos testes também foram realizados. Os resultados finais acima correspondem ao estado corrigido.

## 14. Compatibilidade

Pacote completo desde a primeira migration, com fontes, assets, lockfile, scripts, testes, fixtures e documentos históricos. Nenhum arquivo anterior foi removido. **23 arquivos de marca preservados**, sem redesenho; lockfile/dependências preservados. Autenticação, primeiro acesso, onboarding, solicitação multisserviço, autonomia e regras de isolamento não foram reconstruídos.

O inventário de mudanças está em `release-inventory.json`. A revisão de entitlements acrescenta opções comerciais, preservando capacidades implícitas dos contratos antigos. Não há conversão automática de clientes, remoção de dados nem cobrança presumida.

## 15. Pendências e encerramento

Pendentes de homologação externa: Supabase/PostgREST/Auth real, compatibilidade do diagnóstico transacional com triggers externos do Auth, concorrência de PostgreSQL nativo, fornecedor de cobrança, store durável, webhooks reais e todo o fluxo sandbox futuro. Nenhum resultado de fixture/memória/PGlite foi tratado como confirmação externa.

O guia entregue prepara a sequência checkout → confirmação validada → assinatura → capacidades, com falhas, suspensão, recuperação, duplicidade e mudança explícita de versão. Executá-la depende de autorização posterior e configuração do fornecedor pelo proprietário.

**Entregar e parar para homologação do proprietário.** Não iniciar automaticamente outra rodada, homologação completa de atendimento, publicação ou produção.
