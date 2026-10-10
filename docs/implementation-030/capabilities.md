# Capacidades dos planos — 030

A fonte é `billing_plan_versions.capabilities`, na infraestrutura de planos/versionamento existente. Não há regra baseada no nome comercial do plano. Versões existentes recebem o equivalente dos booleanos anteriores; assinaturas continuam vinculadas à versão contratada.

| Capacidade | Efeito | Sem capacidade |
|---|---|---|
| `software` | Operação empresarial, financeiro e métricas, sempre sujeitos às permissões | Configuração inicial e contratação permanecem acessíveis; novas operações comerciais bloqueadas |
| `human_support` | Permite atribuição global e operação de atendentes compartilhados | Nem Super Admin pode criar/reativar vínculo compartilhado |
| `commercial_followups` | Libera follow-up autorizado | Leitura/operação comercial protegidas pelo entitlement |
| `setup` | Capacidade interna de configuração, para empresa ativa | Empresa suspensa continua bloqueada |

Plano elegível não atribui atendente automaticamente. A VIRELOQ atribui; o ADM define permissões/autonomias dentro do teto de compartilhado. Alteração de assinatura ou concessão que retire a capacidade suspende os vínculos ativos e preserva histórico. Expiração também impede operações na verificação atual da capacidade, mesmo antes de qualquer manutenção do status do vínculo. Retorno da capacidade exige reativação explícita.

Condição interna/isenta é uma concessão global separada, com tipo, capacidades, justificativa, ator, data, estado e revogação auditados. Não gera assinatura ou trial. Não depende de nome da empresa. Criar ADM não revoga a concessão. A MS Auto Details pode receber essa condição posteriormente pelo proprietário, sem inserir dados reais nesta entrega.

Compatibilidade de upgrade: empresas antigas sem assinatura mantêm o acesso de software anterior enquanto a linha cadastral permanecer `legacy`; esse caminho nunca libera atendimento compartilhado. Organizações novas sem contrato não recebem gratuidade automaticamente. Configuração inicial permanece possível pelo Super Admin.

Nenhum preço, nome comercial, SLA ou franquia foi definido nesta implementação. Exemplos da demo são fictícios.
