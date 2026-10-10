# Pendências de homologação e decisões de produto

## Homologação ainda não executada

1. Concorrência em PostgreSQL nativo com conexões separadas. O runner foi tentado, mas o contêiner não permite mapear um usuário Linux não root exigido pelo PostgreSQL. Nenhuma corrida nativa foi executada. Rodar `node scripts/test-native.mjs --030` em ambiente local compatível e repetir no Supabase de homologação autorizado.
2. Upgrade/backup/restauração sobre banco externo autorizado: Auth, roles reais, PostgREST, cache de schema, RLS com JWT reais e limites operacionais.
3. Primeiro acesso, troca de senha, legal, verificação, renovação/revogação de sessão e recuperação com Auth real.
4. Revisão de logs/APM/proxies: não registrar CPF/CNPJ nem bodies da verificação; validar retenção, acesso e suporte excepcional.
5. SMTP e Storage reais e integrações de billing/provider existentes, conforme guias anteriores. Nenhum gateway ou cobrança nova foi criado.
6. Desempenho, contention do lock transacional, paginação em volume, acessibilidade assistiva e navegadores reais no ambiente de homologação. O lock compartilhado prioriza consistência; medir antes de produção.

## DECISÃO DE PRODUTO PENDENTE

- Preços, nomes finais, franquias, limites e SLA dos planos/atendimento compartilhado; esta entrega não os define.
- Critério operacional e aprovadores das concessões internas/isentas, concessões concretas a empresas reais e manutenção de contratos preexistentes antes de conceder isenção.
- Tratamento de renegociação de orçamento que já originou conta/recebimento. A 030 preserva a conta original; não reescreve dívida/caixa silenciosamente. Futuro ajuste financeiro precisa de fluxo explícito aprovado.
- Política de migração de contas a receber históricas: nenhum orçamento anterior virou dívida automaticamente.
- Eventual migração cadastral obrigatória de todos os clientes legados, retenção dos registros de documento e revisão jurídica das minutas legais. A 030 exige novos casos aplicáveis e preserva legados.
- Eventual ticket médio por serviço/cliente, rateio de custos, margem por serviço e histórico imutável do valor executado. A entrega nomeia precisamente a média por recebimento e não apresenta DRE/margem inventada.
- Critérios finais de lançamento e homologação são exclusivos do proprietário. Nenhuma decisão acima bloqueia a configuração fictícia/local já autorizada; aprovação de produção não é presumida.
