# Homologação externa pendente

Não executada e não autorizada nesta tarefa: Supabase real, Auth/senhas/JWT e renovação reais, PostgREST e cache de schema reais, Storage/URLs assinadas reais, SMTP/recebimento efetivo, provider de billing/cobrança e concorrência remota. Os testes de navegador usam HTTP e aplicação reais contra Auth controlado + SQL PGlite local; não são homologação Supabase.

PostgreSQL nativo foi tentado: `npm run test:master:native`, exit 2, o ambiente não permite mapear o usuário não root necessário ao cluster descartável. Nenhum teste nativo/concorrente foi aprovado. Script preparado testa pedidos duplicados simultâneos, decisões concorrentes, revogação versus operação e códigos concorrentes. Os scripts nativos anteriores continuam cobrindo username/provisionamento/ativação/reset/agenda/trial; executá-los num host local adequado antes de considerar a concorrência validada.

Roteiro autorizado posteriormente: usar empresas A/B fictícias e todos os papéis; repetir a jornada de 34 etapas; testar API/RLS sem depender da interface, alteração de UUID, Storage, grants expirados/revogados, suspensão e refresh de sessão, SMTP indisponível e posterior retry, tentativas e consumo único de códigos. Nunca usar dados reais ou considerar mock de cobrança como pagamento.

Decisões do proprietário: política de eventual conversão dos códigos legados; provider comercial real; dados/revisão jurídica das minutas; regras comerciais futuras não definidas (carência/reembolso/downgrade/retenção). O comportamento seguro existente foi preservado.
