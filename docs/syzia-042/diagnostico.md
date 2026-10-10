# SYZIA 042 — diagnóstico e decisões

Base: ZIP SYZIA 041, SHA-256 `760c30e5180b30d4db4618097591ca0ab650b1eb792c5e2369e3dc22a7f82f66`. A recuperação conferiu os 2.665 arquivos, CRC e manifesto. O catálogo de funções e colunas da base acompanha `reports/syzia-042/baseline-*`; o gerador usa essas definições como referência imutável.

| Achado na base | Causa e correção 042 | Evidência local |
|---|---|---|
| Compartilhado também aparece como funcionário próprio | Listagens e precedência de papel admitiam representação empresarial legada da mesma identidade. Classificação global tem precedência; dados e ações globais saem da visão empresarial; comandos sensíveis verificam o alvo global. | SQL 02–07 e 12–13; navegador 03. |
| Autonomia e grants não representavam a mesma autorização efetiva | Permissões antigas não cruzavam de modo uniforme o grant individual e a autorização publicada/atual. O predicado efetivo exige a interseção, com semântica limitada por ação. | SQL 08–17; regressão 040 sobre revogação, capacidades e atribuições. |
| Home pode falhar por inteiro com mensagem genérica | `operations_home` era `STABLE`, mas chama `operations_agenda` → `permission_enter`, que faz `INSERT` em contexto temporário de autorização. A execução em transação somente leitura reproduz SQLSTATE `25006`. RPC corrigida para `VOLATILE`, leitura dividida por seções e erros específicos. | `diagnosis.json`, SQL 18–21, navegador 01–02. |
| Botão de proposta bloqueado sem instrução clara | Explicação era obrigatória indiscriminadamente e a condição do CTA não era apresentada. Comparação server-side identifica mudanças relevantes; UI usa o resultado e explica o bloqueio. | SQL 22–24; navegador 06. |
| Aprovação com mensagem antiga de avaliação | Apresentação condicionada ao tipo original do serviço em vez de considerar a aprovação vigente. Estado aprovado agora orienta a Agenda e mantém a proposta. | SQL 40–41, navegador 06, regressão 041 10–13. |
| Duração maior que expediente não tinha alternativa divisível | Motor existente valida uma janela contínua; faltava configuração e agrupamento mínimo. A 042 conserva o validador e acrescenta planejamento opt-in e gravação transacional de appointments do mesmo pedido. | SQL 25–47; navegador 04–05. |

## Limite do diagnóstico da Home

A chamada normal direta em PGlite retornou dados; a mesma cadeia executada em transação somente leitura falhou no `INSERT` do contexto de permissão. Isso identifica um defeito concreto da base e um modo de falha compatível com a declaração da RPC. Não foram consultados os logs do ambiente externo do proprietário; não se atribui todo erro genérico de conexão exclusivamente a essa causa. A nova UI também trata falhas de transporte, autorização e resposta inválida separadamente.

## Extensão mínima de dados

| Entidade existente | Campos novos / alteração | Compatibilidade |
|---|---|---|
| `services` | `execution_mode`, `execution_max_periods`, `price_max_cents` | Contínuo por padrão; limite e faixa opcionais. Faixa só para preço `from`, com máximo ≥ mínimo. |
| `quote_versions` | `execution_mode`, `execution_max_periods` | Nulos para versões antigas; novas versões congelam a política da composição. |
| `quote_requests` | `desired_periods` | Preferência opcional, não ocupa capacidade. |
| `appointments` | `execution_group`, `part_number`, `service_minutes` | Registros antigos permanecem parte 1; grupo só para reservas. Buffer continua na janela ocupada, separado da duração de serviço exibida. |
| Índice de reserva ativa | Unicidade por pedido e parte | Mantém unicidade dos registros antigos e permite grupo controlado. Constraint GiST de capacidade mantida. |
| `attendant_permissions` | Restrição de preço fixo atualizada | Explicar condições publicadas não é editar preço; bloqueio de desconto e teto zero continuam quando preço não pode mudar. |

Não há novas tabelas de operação nem membership artificial. Os helpers novos do schema privado não são RPCs executáveis por `anon`/`authenticated`. Os comandos públicos novos possuem grants explícitos e verificam identidade, escopo e objeto.

## Decisões de execução

- Cada período respeita a publicação, recurso, horário, bloqueios, capacidade, buffer, antecedência, grade e horizonte existentes.
- O planejamento tenta consumir a maior janela válida e procura a próxima janela publicada para a duração restante. A busca evita percorrer minutos fora do funcionamento; o horizonte e o máximo de períodos limitam o trabalho.
- Sem máximo definido pela empresa, há teto técnico de 30 períodos. O limite configurável é de 2 a 30 períodos, não uma promessa de combinação disponível.
- Um único item contínuo impede divisão de uma composição. Item manual sem política de divisibilidade é tratado conservadoramente como contínuo.
- O plano apresentado é revalidado antes da reserva. Nova duração ou conflito pode exigir reconfirmação; a aprovação comercial permanece.
- Replanejamento mantém as linhas canceladas e seus eventos. A remarcação contínua conserva o identificador público anterior, preservando a regressão 041.
- Uma parte concluída não representa contratação concluída nem pagamento. Total realizado é contado uma vez, após todas as partes confirmadas concluídas.

## Reprodução do SQL

`npm run build:migration:042` usa `scripts/syzia-042/build.py`, fragmentos `.sql`, patches explícitos e as definições da base. O arquivo SQL entregue já está gerado e validado. `ui.py` registra a transformação inicial da interface; é um script histórico aplicado à base, não um comando de manutenção a executar novamente sobre o fonte atual.
