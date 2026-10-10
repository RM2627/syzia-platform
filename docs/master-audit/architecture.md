# Consolidação funcional — migration 029

A especificação anexada substitui a autorização irrestrita da 028. A aplicação mantém React, Supabase Auth, RPCs transacionais e RLS/FORCE RLS; não há onboarding, identidade empresarial ou agenda paralelos.

## Regimes de acesso operacional

- **Sob gestão da VIRELOQ:** organização ativa sem ADM responsável válido. Super Admin usa seu papel global, sessão válida e escopo; nenhum membership é inserido.
- **Suporte normal:** motivo de 15–500 caracteres; solicitação de 1, 4 ou 24 horas; decisão de um ADM válido da organização. O solicitante não pode decidir a própria solicitação. Expiração calculada no servidor a partir da decisão. Recusa e revogação são explícitas.
- **Emergência:** confirmação separada na interface, motivo obrigatório, 15 minutos; uma por organização a cada 30 minutos, até três por solicitante/dia. Limite total de dez solicitações por solicitante/dia e três normais por empresa/hora. Há idempotência e serialização na mesma trava transacional da Fundação.

Responsabilidade exige vínculo ADM ativo, profile/Auth elegíveis e ativação empresarial concluída; organização que exige aceite deve ter registro institucional. Mudanças posteriores da versão legal não removem a responsabilidade já assumida. Recuperação de senha também não remove responsabilidade. ADM legado elegível permanece responsável; vínculo anterior à criação da conta empresarial representa adoção de identidade existente. Ausência de ADMs válidos permite gestão VIRELOQ novamente. Proteção do último ADM existente permanece.

`private.support_requests` preserva solicitação, decisão, escopo, prazo e revogação. `private.support_visits` registra entradas confirmadas no ambiente, com regime e vínculo à autorização quando aplicável. Ambas têm FORCE RLS e sem grants diretos para clientes; projeções autorizadas vêm das RPCs `support_*`. Eventos entram na auditoria global e a empresa recebe seu próprio histórico de suporte, sem auditoria global.

`company_can_manage/read`, `commercial_can_operate`, elegibilidade de atendentes e do provisionador, inicialização empresarial, gestão/reserva/retomada de usuários e alteração de membership foram revisados. A decisão é server-side; o painel consulta a autorização a cada cinco segundos, no foco e no vencimento, removendo o conteúdo ao perder acesso. A próxima RPC/RLS já recusa após a revogação confirmada. Grants não ressuscitam após suspender e reativar empresa.

Cadastro global, estado da organização, planos/trial/billing, usuários/papéis globais e métricas globais mantêm suas autorizações administrativas. Links de diagnóstico global levam ao cadastro administrativo; não abrem clientes, conversas ou orçamentos.

## Continuidade e códigos

001–028 permanecem idênticas. A 029 não reseta dados nem concede aprovações retroativas. `onboarding_context` e as métricas globais usam o mesmo checklist extraído para `private.onboarding_readiness`; progresso e etapas são preservados.

Novas empresas recebem prefixo ASCII normalizado (até oito caracteres, fallback EMPRESA) mais cinco caracteres hexadecimais aleatórios. Até 32 tentativas de colisão, com constraint UNIQUE. Código não muda quando nome/slug mudam. Nomes continuam sujeitos ao limite existente de 2–120 caracteres. Slug e código permanecem independentes.

**Decisão de produto pendente:** converter ou não os códigos hexadecimais já distribuídos antes da 029. Foram preservados para não trocar os identificadores de login existentes. Uma conversão futura exige política de aliases/transição; não foi inventada.

Primeira ativação passa a preservar `activated_at` em redefinições. Para registros antigos, mantém-se a data já armazenada, sem inventar uma primeira data inexistente. SMTP é apenas canal de entrega: falha não desfaz empresa/usuário.

## Limites

Auth, senhas, JWT, PostgREST, Storage e SMTP reais não foram acessados. Billing disponível é simulado e não apresenta receita real. Concorrência nativa requer Linux com usuário não root; não se deve confundir execução SQL serial em PGlite com concorrência real.
