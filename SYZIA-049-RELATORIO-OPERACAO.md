# SYZIA 049 — Operação

## Presença

A confirmação do consumidor é um registro privado separado do estado comercial/financeiro. A RPC exige consumidor associado com direito de gerenciamento e agendamento da mesma solicitação/empresa, confirmado, futuro e ainda não iniciado. Repetição não duplica registro. A resposta aparece no acompanhamento, na Agenda e na ficha como “Presença confirmada pelo cliente”, com horário; não equivale a comparecimento físico.

`appointments.attendance_revision` muda quando horário ou estado de reserva mudam. A confirmação só vale para a revisão atual; reagendamento exige novo ato e mantém o anterior na tabela histórica. Atualização de responsável ou checklist não invalida presença. Atendimento não depende de confirmar presença.

## Não lidas

Na migration, um lock transacional da tabela impede entradas entre o backfill e a instalação do trigger. Depois, a tabela auxiliar atribui sequência por conversa sob bloqueio do ticket; não altera mensagens históricas imutáveis. Índice único `(ticket_id,message_number)` e índice de mensagem permitem cursor estável. Marcador privado `(ticket,user)` só avança por `greatest`; uma aba antiga não retrocede leitura feita por outra. Contagem exclui mensagens do próprio usuário e se restringe às conversas realmente visíveis por grants/vínculo/roteamento.

Home e Atendimento exibem contagem real, com acesso à conversa. Ler no final visível atualiza apenas o usuário atual. Sem push, cobrança externa ou afirmação de leitura pelo cliente. Histórico anterior não tinha marcadores confiáveis: começa não lido e é zerado individualmente na visualização.

## Checklist

Lista vazia por padrão, com até 100 itens personalizados de 1 a 200 caracteres por agendamento. Adicionar, editar, marcar, desmarcar e remover usam RPC com autorização da Agenda e `agenda.manage`; compartilhado não ganha edição. Progresso e último autor/horário aparecem na ficha. Serviços antigos sem lista funcionam normalmente.

Gravação bloqueia o agendamento e usa revisão otimista do item, chave de idempotência e histórico de valores/autor/ação. Conflito de outra sessão recarrega os dados para revisão. Remoção é lógica; auditoria permanece. Serviço cancelado ou concluído permite consulta, mas não nova edição. Completar todos os itens não altera estado do serviço, proposta, faturamento ou cobrança. Não existia sistema de modelos reaproveitável nessa base: não foi criado catálogo de modelos ou módulo de treinamento.

## Migration e segurança

`202610110049_customer_operation.sql`, transacional e incremental. Seis tabelas privadas novas com RLS e FORCE RLS, acesso direto revogado; operações por funções com autorização explícita. A coluna nova preserva agendamentos existentes. Não edita migrations anteriores nem dados comerciais reais.

Testes O01–O04, U01/U02 e C01–C04 verificam autorização, idempotência, histórico, revisão, progresso e isolamento; G01 compara todos os registros e proteções pré-existentes antes/depois do upgrade populado. B01/B02 cobrem interfaces e persistência após refresh. Testes usam PGlite local; paralelismo PostgreSQL com duas conexões físicas deve ser homologado no ambiente separado antes de produção. A sequência/cursor e a chave de idempotência são protegidas por locks/constraints no banco, além das travas da UI.
