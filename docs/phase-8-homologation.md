# HOMOLOGAÇÃO EXTERNA DO PRODUTO COMPLETO

**PENDENTE. NÃO EXECUTADA. Requer autorização futura de Marcelo.** Esta é a etapa seguinte ao desenvolvimento das Fases 2–8, não uma Fase 9 e não autorização de piloto/produção.

## Ambiente dedicado

Projeto Supabase novo de teste, dados/contas fictícios A/B, sem reutilizar banco MS real. Aplicar migrations 001–021 em ordem lexical. Se partir da Fase 7, aplicar somente 018–021. Não aplicar auth-fixture.sql nem seeds PGlite no Supabase. Não desativar RLS, triggers, constraints ou autorização para facilitar testes. Manter as instruções de bootstrap restrito, Auth, redirects, confirmação, recuperação e proteção contra abuso dos guias anteriores.

Preparar aplicação local apontando ao projeto dedicado; isso não exige deploy. Variáveis públicas somente URL e publishable/anon key. Service role, segredo do webhook e conexão SQL somente no servidor/operador. Nunca copiar credenciais aos exemplos, relatórios ou frontend. Configurar gateway de anexos, buckets privados e URLs temporárias conforme guia Consumidor.

## Sequência de validação

1. Fundação: identidades, bootstrap superadmin, membros/papéis/vínculos, suspensão/revogação com sessões anteriores, RLS via PostgREST e segurança de configuração.
2. Empresa: configuração, onboarding, manual versionado/publicado, autonomia e publicação pública sem rascunhos/dados internos.
3. Consumidor: navegação, sessão real, identificação sem autenticar telefone, consentimentos, versões, cálculo, upload autorizado, agenda, links restritos e idempotência.
4. Central: fila, assumir/transferir, mensagens/notas, autorização atual, orçamento/agenda, conflitos e revogação.
5. Comercial: regras/intervalos/tetos, consentimentos, tentativas, perdas/conversão e conflitos concorrentes. Sem WhatsApp API real.
6. Analytics: agregados A/B, filtros/timezone, vazio, coortes, valores sem receita, SLA e exclusividade de plataforma.
7. Planos/assinaturas: matriz abaixo e scripts preparados. **Somente mock em ambiente dedicado, nenhum pagamento real.**

Preservados os guias e scripts anteriores em docs/ e scripts/homologation/. Registrar versão, projeto, papéis sem tokens, dados fictícios, resultado esperado/obtido e evidência. Nenhum PASS local deve virar PASS externo por cópia de relatório.

## Billing: ferramentas preparadas

Copiar `scripts/homologation/billing.example.json` para `.homologation/billing.json`. Configurar projeto dedicado, chave pública, identidades/tokens reais distintos e fixtures solicitadas pelo validador cumulativo. `adminB` e `superadmin` também são necessários. Só marcar testOnlyAcknowledged após validar ambiente; manter realCustomerData false.

- `npm run homologation:billing:read`: somente leitura; confirma Auth/user, isolamento e papéis, visão administrativa e receita indisponível.
- `npm run homologation:billing:concurrency`: exige --mutations (incluído no script), BILLING_TEST_DATABASE_URL correspondente ao projeto, superadmin real e pendingMockInvoice preparada. Dois backends PostgreSQL distintos concorrem pelo mesmo evento fictício, verificando uma única mudança de vigência. **Grava pagamento SIMULADO e histórico; não apaga evidência.** Executar somente com dataset dedicado. Exige habilitação explícita do mock pelo operador: `update private.billing_runtime set mock_enabled=true where singleton;`. Nunca habilitar em produção. Sem configuração válida encerra antes de conexão.
- `server/billing/provider.mjs`: ligar o handler a um endpoint backend de teste, preservando bytes brutos e headers x-billing-timestamp/x-billing-signature. apply chama billing_provider_event com service role no servidor. Testar assinatura inválida, corpo alterado, expiração, replay e erro transacional. Não inventar protocolo de um gateway real; o adapter é fictício.

## Matriz obrigatória de Fase 8

| Caso | Resultado esperado |
|---|---|
| A/B, anon, consumidor, colaborador, atendente | Sem acesso a assinatura/admin indevidos; troca de UUID não concede acesso |
| Membro/papel/perfil/empresa revogado | Próxima chamada falha com token ainda válido |
| Plano editado | Nova versão; preço/limites contratados preservados |
| Manipulação frontend | Preço calculado no banco; estados e provider não editáveis diretamente |
| Trial | Prazo configurado; uma por organização; sem renovação gratuita por repetição |
| Upgrade/downgrade | Alteração imediata confirmada ou agendada conforme regra; sem mudança silenciosa |
| Cancelamento/reativação/expiração/suspensão | Transições válidas, preservação de dados, vigência reavaliada sem cron |
| Membros/serviços | Duas conexões disputando última unidade: no máximo uma inserção/reativação |
| Solicitação/ticket | Concorrência na última quota: no máximo um envio; falha reverte ledger e ticket |
| Follow-up | Quota e recurso server-side, sem duplicação; consentimentos anteriores preservados |
| Virada mensal | Recife, limite inferior inclusivo, mês seguinte separado; renovação não zera artificialmente uso |
| Webhooks | Autenticação antes do banco; mesmo ID/payload idempotente; payload diferente recusado |
| Eventos fora de ordem | Não revertem pagamento nem reabrem cancelamento; suspensão invalida pendência |
| Financeiro separado | Cobrança SaaS não altera pagamento consumidor; simulação não gera receita/MRR/ARR |
| Storage/links | Fotografias privadas/autorizadas, expiração e revogação; nenhuma leitura cruzada |
| UI/cache | Troca de empresa/conta, erro e revogação limpam dados anteriores; confirmar em aparelho físico |

Para quotas concorrentes, preparar plano ativo fictício com exatamente uma unidade livre e usar duas conexões autenticadas independentes chamando comandos originais (foundation_set_member/company_save/consumer_submit_request/commercial_act), nunca INSERT privilegiado como substituto da autorização. Confirmar contagem, resultado recusado, rollback, histórico e ausência de dados cruzados. Não usar PGlite para declarar essa concorrência homologada.

## Performance, abuso e operação

EXPLAIN (ANALYZE,BUFFERS) com dados fictícios representativos; medir RPCs agregadas, políticas, quotas e trava global. Medir usuário frio, rede móvel e imagens grandes. Rate limits/timeouts, CAPTCHA/Auth real, confirmação/SMTP, CSP e origem permitida do gateway devem ser revistos no ambiente escolhido. Testar Chrome/Firefox/Safari, tablet/celular físicos, teclado/leitor de tela, longos textos e estado offline. Definir preços, limites e política de pró-rata antes de qualquer cobrança real.

## Backup e restauração

Preservar migrations e manifesto fora do host; exportar schema/dados e mídia de teste conforme capacidade do projeto. Documentar retenção, frequência, responsável e RPO/RTO compatíveis com o plano futuro. Guardar segredos separadamente. Restaurar somente em projeto/banco descartável distinto, confirmar IDs/relações/Auth/Storage e executar smoke/isolation antes de comparar resultados. Nunca restaurar sobre o alvo original como primeiro teste. Nenhum backup/restauração externo foi executado nesta entrega.

Somente após resultados documentados e correções poderá Marcelo autorizar piloto/produção. Desenvolvimento concluído não equivale a homologação concluída nem a lançamento autorizado.

## Complemento posterior autorizado: trial e prevenção de abuso

Versão cumulativa atual: **21 migrations (001–021)**. Aplicar também `202609180021_trial_eligibility.sql`, preservando 001–020. Elegibilidade entre organizações, registro privado persistente, identidade verificada, exceções/extensões, unicidade e expiração devem seguir `docs/trial-homologation.md`. A demo usa 15 dias configuráveis. Verificação de identidade/telefone é atestação administrativa de evidência conferida; provedores reais não foram integrados. Nenhum teste externo foi executado.
