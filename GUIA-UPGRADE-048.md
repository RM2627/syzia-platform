# SYZIA 048 — upgrade da base limpa 047

Escopo: entrada Node única e Manual opcional para a equipe própria. Nenhuma migration ou credencial foi aplicada no Supabase real. Não é uma autorização de deploy ou cobrança.

## Conferência e ensaio local

A origem é `SYZIA-047-BASE-LIMPA-CONSOLIDADA.zip`, SHA-256 `4786336ac5f2e998e5510d1a645c818a78bd9a3b4e847abb8ce6f5a1e185d517`. A cadeia possui 43 arquivos até 047; a 048 é o 44º arquivo existente. Lacunas históricas de numeração não foram preenchidas artificialmente.

Extrair a 048 em diretório novo e entrar em `foundation/`. Com Node 24:

```sh
npm ci
npm run build
npm run test:048
npm run test:current-gate
```

O build executa typecheck e Vite. O gate inclui os 24 testes Node focados 048, navegador 048, os 33 testes de billing 047 e todas as etapas de regressão vigentes. Chromium é preparado pelo runner no Linux x64 usando Playwright instalado ou a dependência opcional existente. Em outros sistemas, usar `npx playwright install chromium` e instalar as bibliotecas de sistema necessárias, ou informar `FOUNDATION_CHROMIUM_PATH`. Portas de fixture 5173/54321 devem estar livres. Não é necessário preencher credenciais para o gate.

`npm run test:048:browser` requer o navegador instalado/configurado; o gate prepara automaticamente o caminho suportado. `test:local` continua como comando histórico, sem substituir o gate vigente.

## Aplicação futura no banco populado

1. O proprietário deve obter backup verificado e preparar uma cópia de homologação antes de qualquer aplicação real.
2. Conferir `docs/syzia-048/preserved-047-sha256.json`: migrations anteriores e lockfile estão byte a byte preservados. Não resetar, juntar ou reaplicar a cadeia como baseline.
3. Após a 047, aplicar somente `supabase/migrations/202610090048_unified_backend_optional_manual.sql`, pelo procedimento incremental existente.
4. A migration usa transação. Não cria tabelas ou novas RPCs públicas, não altera dados existentes e não desliga RLS/FORCE RLS.
5. Ela atualiza as condições de onboarding, prontidão e autonomia de funcionários próprios. Em `central_quote_actions`, `manual_id` passa a permitir `NULL` para novos orçamentos próprios sem Manual; links históricos permanecem. Um trigger impede esse caso para identidade SYZIA compartilhada. Autorizações/RLS da tabela continuam intactas.
6. Atualizar frontend e backend da mesma entrega, preservando o ambiente real fora do repositório. Ver o guia de porta única para endereços e variáveis.
7. Confirmar em homologação: empresa sem Manual publica/opera; shared sem orientação é negado; grants revogados continuam negados; bucket e sessão de mídia continuam isolados; nenhuma nova RPC privilegiada fica acessível ao navegador.

O teste 048-M01 aplica a migration na 047 populada e compara conteúdo de todas as tabelas existentes e flags RLS/FORCE RLS. É ensaio local PGlite; PostgreSQL/Supabase remoto e concorrência de conexões reais permanecem pendentes.

## Comportamento do Manual

- Equipe própria: Manual ausente ou parcial não impede publicação, onboarding mínimo, cadastro de funcionário, atendimento, orçamento/proposta, Comercial ou Agenda. Continuam valendo dados mínimos, capacidade do plano, vínculo, papel, grants, autonomia e disponibilidade.
- Autonomia própria: as concessões e limites salvos pelo ADM são usados sem exigir publicação do Manual. Não se concedem ações automaticamente.
- Equipe SYZIA compartilhada: continua dependente de prontidão, Manual publicado/atualizado, grants, autonomia publicada e vigente, atribuição, disponibilidade e quota. Falta de Manual bloqueia somente essa atuação.
- Onboarding: Manual aparece como opcional; pendências específicas de suporte compartilhado não deixam a configuração mínima geral incompleta.
- Manual publicado continua imutável; novas revisões e publicação mantêm seu fluxo anterior. FAQ vinculada ao Manual mantém seu contrato específico. A página pública já possui seu próprio rascunho/publicação e FAQ, independente dessa opção legada.

Não é necessário criar, completar ou publicar Manual para migrar uma empresa com equipe própria. Não preencher automaticamente orientações fictícias para contornar regras.

## Inicialização e retorno conservador

`npm start` abre um listener em `PORT`. Não depende de `.env.server` no servidor hospedado. `npm run api:dev` lê esse arquivo no desenvolvimento; os três comandos separados antigos continuam disponíveis. As rotas não receberam prefixo novo.

Em um incidente de entrada HTTP, é possível voltar aos comandos separados locais/controlados com os mesmos handlers, sem reverter dados. Um rollback de código de produto para 047 precisa de planejamento: novos registros de auditoria podem ter `manual_id=NULL`, e a regra de Manual opcional deixaria de existir. Não desfazer a migration por edição das antigas nem preencher/apagar histórico. Preferir correção incremental validada.

## Preservação financeira e pendências

Nenhuma alteração em preços, trial de sete dias, três dias de tolerância, cancelamento, planos/capabilities ou núcleo de integração Mercado Pago. O reconciliador 047 pode ser agendado no processo único; o CLI continua disponível. `MERCADO_PAGO_ENABLED=false` permanece no exemplo. MP-01 continua aberta. Não configurar notificações de Checkout Pro como substituto de Assinaturas.

Os guias de upgrade anteriores e `GUIA-MERCADO-PAGO-TESTE.md` permanecem no consolidado. O guia 048 prevalece apenas para inicialização unificada e Manual opcional. Parar após validar e entregar esta rodada.
