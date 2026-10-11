# Hotfix consolidado sobre 049 + Sharp 0.35.5

Escopo: checklist opcional por serviço, contexto humano das não lidas, contato manual via WhatsApp, recuperação da página original de acompanhamento, prévias da plataforma e orientação do cadastro. Não altera planos, preços, trial, Auth Hook, CAPTCHA, billing, entrada unificada ou permissões gerais.

## Banco e contratos

Aplicar somente `202610110050_service_checklists_contact.sql` depois da 049 já existente, pelo proprietário em sua janela de atualização. Não reaplicar/editar as migrations históricas. A migration possui transação; preserva agendamentos e etapas anteriores e não contém credenciais.

- `company_service_checklist`: `services.read`; leitura por empresa e serviço.
- `company_service_save_with_checklist`: `services.manage` e leitura do serviço; salva cadastro e modelo atomicamente através do `company_save` existente. Revisão do cadastro, revisão do modelo e chave de idempotência. Até 100 etapas por modelo, remoção lógica e histórico privado.
- Criação de um agendamento: trigger copia os modelos vigentes dos serviços contratados, resolvidos pelos metadados da proposta aceita quando disponíveis. Cada período possui seu checklist. A remarcação que conserva o ID conserva a cópia; novos períodos recebem cópias novas e o período cancelado permanece intacto. Agendamentos anteriores à 050 continuam manuais.
- `operations_checklist` e `operations_checklist_save`: mesmos argumentos e grants da 049. Cópias agrupadas por serviço; até 100 extras manuais por atendimento, além das etapas copiadas. Completar itens não altera estados nem pagamentos.
- `central_unread`: mantém código para navegação e contador individual; acrescenta nome/serviço autorizado. Não retorna telefone ou corpo das mensagens.
- `operations_request_contact`: preserva consentimento e permissão de WhatsApp; acrescenta nome autorizado e possibilidade de recuperação administrativa.
- `operations_tracking_link`: `issue`/`revoke`; somente administrador autorizado (`permission_manager` + autorização de orçamento), com vínculo à empresa. Não basta ter `quotes.manage`. O token de escopo `manage` permite ações do consumidor e não pode conceder poderes adicionais a um funcionário limitado.

## Link de acompanhamento

Reutiliza `/acompanhar/:code`, a mesma solicitação e o mesmo chat. O identificador não basta para acesso. A reemissão gera 32 bytes aleatórios, guarda somente SHA-256, expira em sete dias e revoga os links anteriores. A sessão original do consumidor não é removida. O resgate usa a exclusão mútua existente e vincula o token à primeira identidade anônima/autenticada do navegador. Outro navegador, expiração e revogação exigem novo acesso.

O segredo transita no fragmento `#secret` e é removido ao abrir a página. Não é persistido pelo operador, registrado em auditoria nem enviado automaticamente. O administrador deve conferir o destinatário, não abrir o link do cliente e revisar a mensagem no WhatsApp. Em falha de clipboard, há campo para cópia manual. Sem telefone válido/consentimento, o WhatsApp permanece indisponível; a recuperação administrativa continua possível por canal autorizado.

A abertura compartilha uma tentativa de autenticação/resgate em andamento para impedir sessões anônimas duplicadas durante a repetição de efeitos React. A lógica do CAPTCHA, Auth Hook e cadastro não é alterada.

## Validação local

```
npm ci
npm run build
npm run test:049
npm run test:sharp
npm run test:hotfix:049
npm run test:hotfix:049:browser
npm run test:current-gate
npm audit --omit=dev
```

O gate inclui as suítes SQL/unidade e navegador deste hotfix, sem remover etapas anteriores. Chromium pode ser instalado pelos comandos Playwright já adotados pelo projeto ou indicado por `FOUNDATION_CHROMIUM_PATH`.

Teste adicional de concorrência real, exclusivamente em PostgreSQL local descartável, Linux x64 com usuário comum: `npm run test:hotfix:049:native`. Nunca apontar a ferramenta para Supabase/banco real. Se o ambiente impedir a criação do cluster, o comando termina sem declarar PASS.

As quatro imagens `public/marketing/produto-*.webp` são assets usados pela página pública, capturados da aplicação com dados fictícios. Não são evidências históricas descartáveis. Regeneração opcional: executar `test:hotfix:049:browser` com `HOTFIX_CAPTURE_PREVIEWS=1` no ambiente de demonstração local.

## Retorno seguro

Antes de aplicar, guardar cópia dos arquivos substituídos e backup do banco. Se a transação 050 falhar, corrigir a causa antes de tentar novamente; não reaplicar a 049. Se precisar voltar o frontend/backend depois de uma aplicação bem-sucedida, restaurar os arquivos anteriores e manter as tabelas, histórico, colunas e funções aditivas da 050. O código 049 continua usando os contratos antigos. Não remover dados nem executar `DROP ... CASCADE`.

Se for necessário interromper novas cópias automáticas, o proprietário pode desabilitar somente o trigger `instantiate_service_checklists` em uma transação localmente revisada: `ALTER TABLE public.appointments DISABLE TRIGGER instantiate_service_checklists`. Reabilitar com `ENABLE TRIGGER` após correção; não preencher retroativamente o intervalo desabilitado sem decisão explícita. Esse procedimento não foi executado no banco real.

## Pendências externas preservadas

Aplicação da 050 no banco real, cache de esquema PostgREST e acessos reais; concorrência PostgreSQL nativa quando indisponível localmente; homologação de cadastro/confirmacão de e-mail/Auth Hook/CAPTCHA/SMTP; Mercado Pago, incluindo MP-01. Publicação e ativação de produção são exclusivas do proprietário. Nada neste hotfix autoriza deploy ou cobrança.
