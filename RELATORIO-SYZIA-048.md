# SYZIA 048 — backend unificado e Manual opcional

Base: `SYZIA-047-BASE-LIMPA-CONSOLIDADA`, conferida por SHA-256 antes das alterações. Rodada limitada às duas mudanças autorizadas. A versão 047 não foi reconstruída.

## Resultado implementado

Uma entrada `server/unified.mjs` reúne Plataforma, Anexos e Billing no mesmo processo Node e listener `PORT`. Os handlers existentes foram extraídos e reutilizados; seus construtores de servidor continuam disponíveis para desenvolvimento/testes. Os paths, payloads, autenticação, autorização por empresa, sanitização de imagens e núcleo de billing permanecem.

Manual ausente ou parcial deixa de bloquear a operação própria. As condições reais foram corrigidas no banco, além das mensagens e do checklist. A publicação da página já tinha um caminho independente (`consumer_publish_draft`), que foi preservado e testado; não se criou outra página ou outro fluxo de publicação.

## Diagnóstico e antes × depois

| Ponto | 047 inspecionada | 048 |
|---|---|---|
| Entrada HTTP | Três listeners separados, 8787/8788/8789 | Um listener em `PORT`, padrão 10000; mesmo processo |
| Composição | Handlers definidos dentro dos construtores; Billing iniciava ao importar seu entrypoint | Funções de handler reutilizáveis; entradas diretas protegidas; nenhum listener extra ao importar |
| Saúde/encerramento | Health por módulo e startup local; sem ciclo de produção comum | `/health`, SIGTERM/SIGINT, drenagem e prazo de encerramento |
| Reconciliação | CLI server-side 047 | Mesmo reconciliador; CLI preservado e agendamento serial no processo único quando MP estiver habilitado |
| Funcionário próprio | Grants e autonomia salva ainda podiam depender do snapshot publicado do Manual | Usa autonomia vigente do ADM, mantendo grants, vínculo, papel, capacidade e teto de desconto |
| Onboarding | Manual oculto no modo próprio e exigências shared misturadas à prontidão geral | Manual explicitamente opcional; requisitos shared não bloqueiam configuração mínima |
| Proposta da Central | Auditoria exigia manual_id não nulo | Vínculo opcional para proposta própria sem Manual; identidade SYZIA continua exigindo Manual |
| Comercial | Permissão de follow-up e horário padrão dependiam de snapshot do Manual | Equipe própria usa concessões atuais; horário da empresa é fallback quando não há Manual |
| Shared | Manual publicado/atualizado, autonomia, grants, atribuição, disponibilidade e quota | Regras preservadas; ausência de Manual continua negando somente essa atuação |

O ensaio 048-M01 registra a negação anterior para funcionário com grants/autonomia e sem Manual publicado. Após a migration, M03/M05–M08 verificam a operação própria permitida, limites e negações preservadas. M13 verifica uma empresa nova com **zero versões de Manual**. M09/M10 verificam o tratamento separado do shared.

## Migration incremental

`202610090048_unified_backend_optional_manual.sql` é necessária para remover as dependências server-side. Mantém transação, RLS/FORCE RLS, grants e dados. Nenhuma migration anterior foi editada. São 43 arquivos históricos intactos mais a 048.

A migration altera funções existentes de prontidão/onboarding, autonomia, Comercial e proposta. Acrescenta apenas helpers privados e o guard de auditoria. Não cria tabela, plano, oferta, treinamento ou nova RPC pública. O campo opcional de auditoria não apaga vínculos anteriores.

## Preservação e segurança

O teste de integridade confere lockfile e núcleo financeiro 047 byte a byte, além da cadeia de migrations. Preços, sete dias de trial, meio de pagamento obrigatório, três dias de tolerância, cancelamento, upgrade/downgrade e capabilities não foram modificados. Os testes 047 continuam executando esses contratos na base atual.

Os handlers mantêm seus contratos de erro, tamanho de body e CORS. O roteador não interpreta preço ou cartão, não altera JWT/tenant e não usa parâmetros de retorno do navegador como confirmação financeira. O servidor inicializa por variáveis de ambiente e emite erros seguros. Nenhum segredo foi incluído no frontend ou pacote.

Equipe SYZIA global, grants, autonomia, atribuições, disponibilidade, consumo por ticket/ciclo, histórico e auditoria seguem nas regressões 045/046. Assistido não foi habilitado comercialmente. UX-001 foi preservada, e UX-002 não foi reaberta.

## Testes e evidências

Os 24 testes Node focados passaram na implementação local: 9 HTTP, 14 Manual/upgrade e 1 integridade. O build/typecheck passou. A validação cumulativa e da **extração nova do ZIP** é registrada em `RESULTADO-GATE-048.md`, entregue junto da base, com SHA-256 e códigos de saída. A matriz descreve o que cada teste comprova.

O gate mantém 19 etapas: as 17 da 047 e as duas da 048. Uma execução intermediária identificou duas expectativas antigas de onboarding contrárias à nova política aprovada. Somente três asserções dessas cópias temporárias foram adequadas para exigir o novo comportamento; arquivos históricos permanecem intactos e as negações shared têm testes específicos. Nenhum cenário de segurança ou regressão foi removido para obter PASS.

As imagens de desktop/mobile, JSON e logs da execução atual ficam em `SYZIA-048-EVIDENCIAS.zip`. A base principal conserva somente as oito entradas JSON de `reports/` realmente utilizadas pelas ferramentas vigentes, mais seu README. `node_modules`, `dist`, caches, traces, screenshots, logs e ZIPs antigos ficam fora.

## Limites e parada

PGlite, Auth/Storage e Mercado Pago simulados não comprovam integrações externas. MP-01 permanece aberta; demais pendências estão em `PENDENCIAS-HOMOLOGACAO-048.md`. O guia de Render é preparação, com dimensionamento inicial estimado e limitações explícitas, não homologação de carga.

A declaração de freeze funcional da entrega depende de PASS na extração limpa. Ela não encerra MP-01 nem autoriza produção. Após entregar, PARAR: sem deploy, DNS, publicação, ativação de Mercado Pago, cartão real, SQL no Supabase real ou nova rodada.
