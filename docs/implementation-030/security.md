# Segurança e autorização — 030

A decisão efetiva combina usuário/sessão válidos, organização ativa, papel máximo, capacidade vigente, grant de ação e escopo. Os grants são consultados em cada RPC/RLS; não são confiados ao JWT. Revogação não depende de logout. A UI revalida ao foco e a cada 15 segundos; uma tela já carregada pode permanecer momentaneamente visível, mas novas consultas/mutações são recusadas imediatamente pelo servidor.

## Proteções adicionadas

- RLS e FORCE RLS em todas as tabelas novas. Tabelas privadas não têm SELECT/DML para clientes. Novas tabelas financeiras públicas concedem apenas SELECT com política; escrita exige RPC.
- Foreign keys compostas por organização impedem vincular cliente, serviço, agenda, conta e recebimento de outro tenant.
- Recursos financeiros usam escopo `organization` ou `assigned`. Atribuição é explícita na conta ou herdada do responsável ativo do ticket ligado; o usuário deve continuar elegível. A listagem não revela outras contas nem agrega valores ocultos.
- Consolidados exigem ações próprias. Compartilhado não pode receber caixa, resultado, métricas financeiras, Pessoas e acessos, billing ou configurações. Estorno de recebimento confirmado exige ADM ou Super Admin com autorização operacional 029.
- RPCs antigas foram preservadas como implementações privadas e envolvidas por autorização explícita. Delegação temporária ocorre em tabela privada vinculada a backend/transação/ator/organização/ação. Não há GUC que o cliente possa forjar para obter gestão; aliases privados têm EXECUTE revogado.
- Projeções retiram valores de orçamentos quando não autorizados. O consumidor conserva somente suas projeções próprias, sem notas internas, financeiro ou gestão de usuários.
- Lançamentos financeiros/auditoria são imutáveis. Estorno cria outro registro referindo original, valor, motivo, ator e data. Índice único evita dois estornos do mesmo original. Cancelamento de conta com recebimento líquido exige estorno prévio.
- Escritas financeiras, permissões, categorias e verificação usam transação, revisão quando aplicável, chave de idempotência e locks. A prova de corrida em múltiplas conexões permanece pendente; validação sequencial não a substitui.
- O gate cadastral é separado de validade da sessão, aceite legal e situação comercial. Login continua genérico contra enumeração; revalidação distingue sessão, usuário, empresa, cadastro e autorização.
- CPF/CNPJ completo é transitório na requisição da verificação; não é persistido em tabelas, logs de aplicação ou auditoria. Persistência: fingerprint privado, tipo e máscara. Não há consulta governamental nem prova de titularidade. Proxies/APM/PostgREST externos devem ter captura de bodies/parâmetros sensíveis desabilitada na homologação.

## Preservações

Super Admin abre/configura empresa sem ADM responsável, sem membership artificial. Com ADM responsável, permanecem suporte autorizado e emergência controlada da 029. Condição comercial interna/isenta não relaxa sessão, verificação, RLS ou suporte. Admin empresarial continua limitado às suas organizações. Vínculo compartilhado exige capacidade mesmo para ação global.

## Limites desta evidência

Testes executam SQL real em PostgreSQL via PGlite e navegador Chromium local com Auth/transportes fictícios. Supabase real, políticas de logs externas, concorrência com conexões nativas, Storage, SMTP, restauração e provider não foram homologados. A inspeção de bundle não equivale a auditoria de infraestrutura.
