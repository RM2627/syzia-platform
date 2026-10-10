# Definições das métricas — 030

A aba Métricas existente foi evoluída. Nenhum indicador financeiro representa confirmação externa de pagamento: o recebido depende de lançamento manual autorizado.

| Indicador | Fonte e cálculo | Recorte |
|---|---|---|
| Orçado | Última proposta final enviada por solicitação dentro do período; soma de `quote_versions.total_cents` | Data de emissão da versão; propostas estimativas excluídas |
| Aprovado/contratado | Valor da versão atualmente aprovada, com evento `approved` no período | Evento de aprovação, sem duplicar eventos da mesma solicitação |
| Realizado | Valor da versão aprovada vinculada a agendamento concluído | `appointments.completed_at`; referência comercial do serviço concluído, não recebimento |
| Recebido | Recebimentos explícitos menos estornos | Data financeira efetiva de cada lançamento |
| Despesas | Lançamentos não cancelados | Data financeira efetiva |
| Resultado | Recebido menos despesas | Mesmo período; não é lucro líquido contábil |
| A receber | Total das contas não canceladas menos recebimentos líquidos | Posição atual, não saldo histórico na data final do filtro |
| Vencido | Saldo positivo com vencimento anterior ao dia atual da empresa | Posição atual |
| Contas pendentes | Quantidade de contas não canceladas com saldo positivo | Posição atual |
| Valor médio por recebimento | Média dos recebimentos do período sem estorno vinculado | Unidade é lançamento, não cliente nem serviço; sem base retorna vazio |

Datas usam `organizations.timezone`, com início inclusivo e final exclusivo no dia seguinte para eventos. Filtros: hoje, 7 dias, 30 dias, mês e personalizado até 366 dias. Recebimentos/despesas usam datas civis informadas; auditoria conserva timestamp do registro. O estorno entra na data atual da empresa, sem apagar o período do original.

O bloco financeiro em Métricas é consolidado da empresa no período. A interface informa que os filtros adicionais de serviço/origem se aplicam aos indicadores operacionais. Não é apresentada margem por serviço: os custos necessários não existem no ledger atual.

Indicadores operacionais anteriores, suas coortes e fontes foram preservados: solicitações, propostas, aprovações/conversão, agendamentos, execução, clientes, atendimento e recuperação. Consulte também `docs/analytics` e os relatórios anteriores. Consultar métricas não executa recuperação comercial, não lança recebimentos e não cria tutorial.

Limites: uma nova aprovação pode mudar a versão comercial de referência; valores financeiros já lançados não são reescritos. O número de serviços da calculadora de meta é uma estimativa, não previsão de vendas. Para distinguir ticket médio por serviço de média por recebimento, a UI utiliza o segundo nome, sustentado pelo ledger disponível.
