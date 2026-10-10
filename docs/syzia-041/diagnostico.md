# SYZIA 041 — diagnóstico da base 040

Data: 26/09/2026. Fonte exclusiva: `SYZIA-040-Consolidado.zip`, SHA-256 `de33c3e97b80192f4a331bd12ca1839641f745a865d11f3580e92bde7f2390bf`. O ZIP foi verificado por CRC antes da extração. A análise usa código e banco local descartável; não houve acesso ao banco da MS Auto Details ou a serviços externos.

## Causas encontradas e reaproveitamento

| Tema | Situação inspecionada na 040 | Correção 041 |
|---|---|---|
| Equipe SYZIA | O menu global e a rota da operação compartilhada usavam o mesmo nome. A rota antiga possui atalhos úteis por permissão. | Uma entrada principal global para gestão de pessoas. Rota antiga preservada como “Minha operação”, com atalho para staff e funções autorizadas. |
| Contratação | O wizard multisserviço enviava a solicitação antes de consultar a agenda. Já existiam cálculo publicado, disponibilidade, reserva e histórico. | Escolha de horário no wizard e conclusão direta atômica com os motores existentes. Nenhuma proposta final artificial. |
| Avaliação | A proposta e a agenda existiam, mas não havia preferência de horário persistida antes da avaliação. | `desired_start` na solicitação e versão final; aprovação tenta reservar com a duração final. |
| Roteamento | A abertura de tickets não distinguia autoridade para preço variável da operação compartilhada. | Escopo e motivo no mesmo ticket, escolha do próprio elegível ou ADM e filtro de autorização/RLS. |
| Ajuda inicial | A Central abria após envio comercial; não retomava o wizard antes da finalização. | Rascunho contextual da mesma solicitação, ticket e oportunidade; sem versão de orçamento antes da retomada. |
| Fotos | Anexos privados, validação e gateway já existiam, com escrita limitada à etapa de rascunho. | Reutilização para envio no acompanhamento nas etapas de avaliação, associação ao serviço e pedido público de fotos. |
| Perguntas | Campos simples já existiam. | Instrução, texto longo, foto e condição simples, conservando respostas por item. |
| Orçamento | Revisão discriminada 038 e versões imutáveis já existiam. Edição empresarial e Central tinham experiências distintas. | Um componente de calculadora e um cálculo servidor para originais, catálogo, complementos, duração e descontos. |
| Apresentação | Marca publicada 040 e conversa segura já estavam implementadas. | Progresso adequado à jornada, resumo, proposta destacada, fotos, novas mensagens e próxima ação. |

As 461 definições de funções inspecionadas estão em `reports/syzia-041/baseline-functions/`. `inspect.mjs` carrega somente a 040 em fixture descartável e exporta também colunas/catálogo. O gerador `build.py` usa essas definições e fragmentos SQL locais; não consulta produção.

## Persistência indispensável

A preferência de horário, jornada, política de fotos, condições de perguntas, motivo de roteamento e discriminação de descontos precisam sobreviver à sessão e ser validados no servidor. Por isso a 041 adiciona metadados às tabelas existentes. Não cria Central, cliente, agenda, token ou armazenamento paralelos. A migração preserva as colunas e linhas anteriores; a prova local compara 119 tabelas nos campos preexistentes.

## Limites deliberados

Segmentos continuam sugestões de configuração; nenhuma decisão de backend depende do segmento. Publicações antigas permanecem imutáveis. Quando não há `contract_mode` no snapshot anterior, a interpretação usa o `direct_booking` já publicado. Nenhuma empresa é republicada automaticamente. A operação compartilhada mantém as ações determinísticas já autorizadas, sem acesso arbitrário ao cálculo empresarial.
