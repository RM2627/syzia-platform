# SYZIA 039 — atualização 038 → 039 e homologação futura

Este pacote é cumulativo. Desenvolvimento local concluído; aplicação em ambiente externo e lançamento continuam sob decisão do proprietário. Nenhum reset, deploy ou pagamento foi executado.

## Atualização incremental

1. Confirme a base consolidada 038 e obtenha backup pelo procedimento já adotado para o ambiente. Preserve a configuração e segredos server-side existentes.
2. Aplique **somente** `supabase/migrations/202609250039_commercial_plans.sql` após 038. O arquivo é transacional. Não reaplique/reset as migrations antigas, não edite seu histórico e não converta assinaturas por script.
3. Atualize os fontes da aplicação e do servidor com o pacote 039. Não opere o criador antigo durante a atualização; o novo formulário envia explicitamente a modalidade contratual.
4. Instalação portátil: `npm ci`; build: `npm run build`. Use as mesmas configurações documentadas na base. As dependências e o lockfile não mudaram.
5. No ambiente de homologação escolhido pelo proprietário, entre como Super Admin e abra Administração → Planos e assinaturas. Crie um plano interno, revise recursos/limites, execute **Testar atribuições do plano**, revise o resumo e salve.
6. Confira Administração → Cobrança: Não configurado / Aguardando integração / Não disponível / Não configurados. A configuração de planos deve funcionar sem provider.
7. Confira uma empresa com assinatura anterior: mesma versão contratada, preço, trial, tetos, capacidades e histórico. Edição da oferta deve criar nova versão sem alterar essa empresa.
8. Confira empresa com financeiro/métricas excluídos, terceiro/quarto membro, ausência de capacidade humana compartilhada e isolamento de duas empresas. Confira onboarding e regularização com as autorizações existentes.

A migration não altera `billing_subscriptions`, versões contratadas, trial, concessões ou uso histórico. O campo aditivo de modalidade marca versões existentes como 1; novas versões explicitamente configuradas usam 2. Não execute atualizações em massa para “migrar” contratos. Retornar ao frontend 038 não equivale a reverter a migration; correções de persistência devem ser incrementais e revisadas.

## Reproduzir as verificações locais

```bash
npm run test:039
npm run test:039:regression
npm run test:039:browser
npm run build
```

O navegador depende de Chromium: use a instalação Playwright usual ou defina `FOUNDATION_CHROMIUM_PATH` para um executável disponível. O webServer da configuração Playwright sobe a demo descartável no mesmo ambiente do teste. `npm run dev:demo` usa dados sintéticos e habilita explicitamente a simulação local. Não use a demo nem `VITE_LOCAL_DEMO=true` em produção.

A regressão reutiliza a suite 038 sobre a sequência populada 036 → 038 → 039, e grava resultados no diretório 039. Nenhum relatório histórico é sobrescrito. PGlite e Auth de teste não substituem Supabase real, PostgREST, Auth real ou concorrência de PostgreSQL nativo.

## Diagnóstico de atribuições em ambiente externo

O diagnóstico executa o servidor existente sobre entidades sintéticas que são revertidas. Para limites pequenos, inclui inserção real de membros e recusa do próximo. Para limites grandes, informa que verificou o cálculo do limite. Homologue a compatibilidade dessa subtransação com o schema/triggers do Auth real e a restauração do contexto da sessão. Não conceda acesso a funções privadas nem remova RLS para fazer o diagnóstico passar.

Caso apareça **Inconsistência**, não publique a oferta: revise recursos, flags comerciais e aplicação da migration. Erros inesperados descartam o cenário e não retornam dados internos ao navegador. O script `scripts/syzia-039/diagnose-plan.mjs` fornece diagnóstico técnico somente no banco local descartável.

## Protocolo futuro para provider sandbox — não executado nesta rodada

Só após o proprietário selecionar e autorizar um fornecedor:

1. Implementar seu adapter no servidor pela fronteira de hosted checkout. Configurar credenciais exclusivamente server-side e separar sandbox de ambiente real. Homologar primeiro sem cobrança real.
2. Implementar o store durável transacional usando os planos, versões e assinaturas existentes. Persistir associações internas/provider e idempotência com unicidade, comparação de payload, lock e sequência. Preservar suspensão administrativa, trial, dados e histórico. Não apontar a confirmação real para a RPC histórica de eventos **mock**.
3. Reservar checkout com preço/moeda/versão lidos no servidor. Validar origem da URL do checkout. Tentativas de enviar preço, capacidade, organização alheia ou versão arbitrária pelo navegador devem falhar.
4. Confirmar que abrir/voltar/atualizar a página de retorno e informar “paguei” não ativa assinatura. Pagamento recusado também não libera acesso.
5. No webhook, validar assinatura e timestamp sobre bytes originais. Consultar o contrato na API autenticada do provider. Rejeitar associação, valor, moeda, checkout ou versão divergentes.
6. Aplicar confirmação validada atomicamente: assinatura ativa na versão correta → exatamente as capacidades contratadas. Repetir webhook/checkout/chave deve produzir o mesmo efeito; payload conflitante deve ser recusado. Evento antigo não reverte estado novo.
7. Testar falha, vencimento, cancelamento, suspensão e estorno/contestação com a regra comercial aprovada. Dados e histórico permanecem; novas operações sujeitas ao contrato ficam bloqueadas; regularização permanece acessível.
8. Testar regularização e renovação: nova confirmação válida restaura somente recursos da versão contratada. Suspensão administrativa não pode ser retirada por webhook de cobrança.
9. Testar upgrade explícito com versão/preço alvo confirmados e downgrade com aplicação no período correto. Alterar o catálogo não muda contratos ativos.
10. Testar isolamento A/B, usuário revogado, webhook forjado, repetição concorrente, falha após reserva e antes de gravar URL, retentativa após queda e restauração do banco. Registrar evidências sem segredos completos.

Atualmente não há fornecedor configurado, store real conectado, webhook externo ou pagamento real. A lista acima é preparação para uma homologação futura separada; não autoriza sua execução automática.

Após esta entrega: **parar para homologação do proprietário**. Não iniciar a homologação completa de atendimento, outra rodada ou produção automaticamente.
