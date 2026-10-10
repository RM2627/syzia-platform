# Auditoria anterior à correção — versão 026

Base: última entrega cumulativa VIRELOQ, migrations 001–026. O proprietário informou que aplicou a 026 e homologou o acesso de Super Admin usando uma identidade Auth limpa e o bootstrap oficial. Essa validação externa foi relatada pelo proprietário; não foi executada neste trabalho.

## Problemas confirmados no código

| Ponto | Evidência na versão 026 | Correção delimitada |
|---|---|---|
| Criação parcialmente concluída | `access_reserve` grava organização/reserva em uma transação; depois a API chama Auth; somente depois `access_finish_provision` grava membership/código. São operações em sistemas diferentes. O frontend recebia um erro genérico e atualizava a lista apenas no sucesso. | Preservar a reserva existente; retornar etapa e identificadores autorizados; atualizar a listagem também no erro; mostrar configuração incompleta e retomar a mesma reserva. |
| Consulta Auth ambígua | Ausência de `data.user` era tratada como usuário inexistente sem classificar `getUserById.error`. | Somente ausência confirmada/404 permite criar. Falha de consulta não dispara outra criação. Após conflito de criação, consultar novamente o ID reservado. |
| Empresa sem administrador | O formulário exigia nome, sobrenome e e-mail do primeiro administrador. Não havia comando idempotente para criar somente a organização. | Comando adicional, com autorização global, geração de código existente e nenhum usuário artificial. |
| Acesso global à empresa | `/painel/:id` verificava vínculo de gestor, mesmo quando o operador tinha `super_admin`. | Direcionar Super Admin para a gestão de acessos/cadastro existente; não ampliar leitura dos módulos empresariais nem criar membership. |
| Primeiro login | `/entrar` apenas tratava senha; o código exigia descobrir `/ativar-acesso`. | Resolver código válido na mesma entrada e abrir criação de senha. Manter a rota anterior por compatibilidade. |
| Entrega administrativa | O provisionamento 026 não tentava envio de instruções. | SMTP separado, posterior ao provisionamento, com adapter controlado nos testes. |
| Auditoria global | Menu/rota já eram exclusivos do Super Admin; a consulta usava diretamente `audit_logs`, cuja RLS também permite histórico da própria empresa. | Preservar RLS do histórico empresarial e acrescentar RPC global explicitamente exclusiva do Super Admin. Renomear a seção empresarial para Histórico de acessos da empresa. |
| Ciclo de vida | Suspensão/reativação já existiam no comando da Fundação; faltavam ações claras na listagem e exclusão segura. | Reutilizar o comando de estado, revogar sessões ao suspender e permitir somente exclusão de organização vazia elegível. |

## O que não pode ser concluído sobre a falha real

Não foram fornecidos a resposta HTTP original, o `request_id`, a categoria do erro Auth nem os registros da tentativa em que a organização permaneceu criada. Portanto, não é possível afirmar qual chamada externa específica falhou naquela ocasião. A causa confirmada da **experiência parcial e ambígua** é a separação das etapas sem feedback/retomada adequados. As falhas em consulta Auth, criação Auth e finalização foram reproduzidas com adapters controlados e corrigidas localmente. Isso não prova qual dessas condições ocorreu no Supabase real.

Não atribuímos a falha ao SMTP: o provisionamento da 026 sequer enviava essas instruções. Nenhuma alteração foi feita no projeto Supabase, no bootstrap real ou nas credenciais do proprietário.
