# Página pública e portfólio — homologação externa pendente

Não executada nesta revisão. Usar somente projeto dedicado e empresas/contas fictícias, após autorização. Não exige deploy de produção: a aplicação pode rodar localmente conectada ao ambiente dedicado.

1. Aplicar as migrations 001–024 existentes na ordem, conforme os guias cumulativos. Esta revisão não cria migrations.
2. Configurar Auth, gateway e Storage privado conforme guias anteriores. Validar usuário gestor A/B, atendente próprio, compartilhado, usuário suspenso e permissão revogada.
3. Entrar como gestor e abrir Página da empresa. Conferir status persistido, URL derivada da origem, nova aba, cópia e alternativa manual. Repetir desktop/mobile e navegador com permissão de clipboard negada. HTTPS ou localhost são necessários para Clipboard API; fallback permanece disponível.
4. Enviar JPEG/PNG/WebP válidos e arquivos inválidos. Repetir limites/tipo real e autorização do gateway. Não permitir leitura privada de mídia de B ou de anexos de solicitação por troca de identificador.
5. Incluir/editar/ordenar trabalhos, antes/depois e retirar da próxima publicação. Rascunho não pode alterar o público. Publicar os dados aprovados e comparar a prévia com /empresa/:slug em sessão anônima independente.
6. Validar ocultar/reativar e organização suspensa. Conferir no PostgREST com JWT real que publicar/editar/ler contexto administrativo continua proibido para atendentes e outra organização, inclusive após revogação com token ainda vigente.
7. Inspecionar respostas públicas: nenhum manual interno, regras privadas, autonomia, notas, clientes, métricas ou identificadores privados. Testar imagens publicadas/retiradas e expiração das autorizações de mídia conforme guia anterior.
8. Conferir auditoria real das alterações/publicações, rejeição de revisão concorrente e preservação de snapshots históricos.
9. Repetir onboarding: Identidade visual, Portfólio e Página pública abrem a nova central; progresso continua baseado no estado persistido.

Registrar ambiente, versões, casos, resultados e falhas. Testes locais não substituem esta validação. Permanecem pendentes Auth/Storage/PostgREST/RLS com tokens reais e dispositivos físicos. Preservar guias de concorrência/backup das entregas anteriores.
