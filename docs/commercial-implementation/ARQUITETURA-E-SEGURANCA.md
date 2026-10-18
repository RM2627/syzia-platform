# Arquitetura comercial 054

## Fronteiras

A base operacional armazena interessados, autorização de contato, convites, resultados de envio, preparação aprovada, reivindicações e histórico de decisão. O banco demonstrativo armazena exclusivamente identidades fictícias, empresas de cada visitante, serviços e operações simuladas pelo SQL real, além de imagens locais. Não compartilha usuários, sessões, contratos ou tabelas com o Supabase operacional.

`server/commercial/demo-store.mjs` recebe um pool injetável. Cada operação tem transação, timeout, claims locais e role autenticado. O pool nunca recebe SQL do navegador. Somente nomes/argumentos de RPC reconhecidos são aceitos. Operações globais, cobrança e provisionamento de Auth real ficam fora da superfície. Planos imutáveis são espelhados para aplicar limites reais usando a homologação local de capabilities; não se criam assinaturas ou trials fictícios.

O bootstrap recusa banco com schemas `auth`, `private` ou `demo_private`. O schema demonstrativo exige um marcador de bootstrap vazio. O runtime exige o propósito `syzia-commercial-demo-054` e verifica a identidade do banco antes de atender. O acesso ao PostgreSQL é exclusivamente server-side; nenhum endpoint permite escolher connection string, tabela, usuário SQL ou organização de outra sessão.

## Configuração e ativação

`commercial_config_fields` define campos permitidos; IDs são remapeados e referências permanecem no novo tenant. Importa apresentação, serviços, categorias, adicionais, perguntas, checklists de serviço, regras, FAQ, respostas, branding, portfólio e regras da agenda. Não importa execuções de checklist nem histórico operacional.

A revisão do Super Admin e o aceite do responsável se vinculam ao hash da configuração. Alteração/revogação/expiração invalida convites e revisão. Uma preparação só pode materializar uma organização. A organização surge pelo cadastro existente, com assinatura local pendente/restrita; nenhuma operação financeira é inventada nesta camada. A liberação do catálogo preparado ocorre somente após confirmação oficial já processada pelo financeiro existente.

Imagens da apresentação permanecem no banco demonstrativo até a ativação aprovada. Nessa etapa, o servidor verifica pertencimento à preparação, hash e MIME e copia somente os assets aprovados ao bucket já usado pela aplicação. O caminho revisado é preservado; conflito exige mesmos bytes. A RPC de conclusão exige confirmação server-side dessa preparação quando há imagens. Falha após copiar uma imagem pode deixar objeto órfão, mas não cria acesso ou contrato. Sua limpeza deve ser auditada posteriormente, verificando todas as referências; não há remoção automática de assets operacionais.

## Convites e envios

Convites têm segredo aleatório de 256 bits; a tabela de resolução armazena SHA-256. Para permitir envio após a prévia, a cópia necessária do segredo fica cifrada com AES-256-GCM e chave server-side. Não aparece em projeções administrativas, logs ou query strings. O link de ativação é somente uma entrada para autenticar, requerer revisão e aprovar configuração.

Uma prévia persiste hash canônico da seleção, operador e validade de dez minutos. A confirmação exige a mesma seleção. O banco deduplica contato/endereço, exige carteira/grant, autorização de finalidade, validade e não supressão. O envio é individual, sem CC/BCC coletivo. Estado: queued → sending → accepted/failed/uncertain/cancelled. Aceitação SMTP não comprova entrega em caixa postal. Resultado incerto nunca é reenviado automaticamente; nova tentativa exige revisão e nova confirmação.

O POST retorna a fila persistida, e o worker desta instância processa as mensagens. Reiniciar a instância não retoma convites automaticamente. Após 15 minutos, a atualização do histórico classifica envios interrompidos como incertos e audita a recuperação. Antes de cada envio, o servidor revalida operador, carteira, destino, autorização, geração e expiração. Não há pixel de abertura nem promoção de interesse por clique.

## Limites e operação

Defaults conservadores: pool de quatro conexões; sessão de 60 minutos; 200 visitantes ativos; teto de 1.000 instâncias acumuladas e 128 MiB de imagens no banco demonstrativo. O teto acumulado inclui sessões expiradas: impede crescimento indefinido, mas exige manutenção do ambiente descartável pelo proprietário. Não existe expurgo automático de organizações, pois seu grafo histórico usa as FKs reais. Nunca apagar ou resetar o banco operacional.

O proprietário deve definir retenção e dimensionamento antes da disponibilização externa. Ao atingir o teto, novas experiências falham de forma fechada. Uma rotação controlada do banco demonstrativo exige preservar/recriar preparações ainda utilizadas e reemitir acessos; imagens pendentes de ativação precisam permanecer disponíveis. Não foi comprovado suporte a determinada oferta gratuita de hospedagem, memória, throughput ou SLA. Node, banco, sanitização de imagens e PDF exigem medição com carga e imagens representativas em homologação; não prometer capacidade com base em testes unitários.

## Preservação

Os 49 arquivos históricos de migration e os módulos financeiros permanecem preservados. O adaptador SMTP recebeu apenas um renderer opcional, mantendo comportamento anterior por padrão. Os manifests antigos continuam intactos; a autorização 054 é uma camada adicional com hashes e predecessores explícitos. Não há alteração do CPF, preços, trial, HMAC, reconciliação ou políticas de cancelamento.
