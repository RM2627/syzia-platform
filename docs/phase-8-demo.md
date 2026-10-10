> **LEGADO — anterior à revisão de acesso empresarial (026).** Preserve como histórico. Para instalação/login/primeiro acesso atuais, siga `docs/access/upgrade.md` e `docs/access/demo.md` (caminhos relativos à raiz do projeto). Convite por e-mail não é mais o fluxo operacional. Não reaplique migrations antigas.

# Demo final — Fases 2–8

Instalar Node.js 22.12+ (validado em Linux com Node 24) e npm. Extrair o ZIP e abrir a pasta foundation. Rodar `npm ci` e `npm run dev:demo`. No Windows, INICIAR-DEMO.cmd prepara as dependências; em Linux/macOS, `sh iniciar-demo.sh`. O launcher Windows não foi executado em Windows nesta entrega.

Aguardar a mensagem LOCAL e abrir `http://127.0.0.1:5173/empresa/ms-auto-ficticia`. Empresa B: `/empresa/horizonte-ficticio`. Não abrir index.html direto. Tudo é fictício, em loopback, banco em memória, Auth/Storage simulados. Não publicar esse servidor. Parar com Ctrl+C e reiniciar reseta inclusive links, assinaturas e cobranças fictícias. Sessões antigas podem exigir sair/limpar os dados do site local.

## Contas de demonstração

Entrar em `/entrar`, senha fictícia não vazia:

| Conta | Uso |
|---|---|
| admin@example.invalid | Administração da Empresa A |
| adminb@example.invalid | Administração da Empresa B |
| agenta@example.invalid | Atendente principal A |
| backup@example.invalid | Reserva A |
| agentb@example.invalid | Atendente B |
| shared@example.invalid | Atendente vinculado A/B |
| root@example.invalid | Administração da plataforma |

E-mail desconhecido não vira administrador. Visitante público recebe identidade anônima descartável própria ao precisar de sessão; novas sessões não compartilham automaticamente a pessoa fictícia Alice. Ainda é **Auth simulado**, não autenticação segura para uso público.

## Percurso demonstrável

1. Público A: identidade, catálogo, adicionais, preços e FAQ. Abrir antes/depois; usar botões, teclado ←/→, Escape ou gesto horizontal para navegar. Fotografias publicadas de serviço são suportadas; falta/falha de imagem usa fallback completo. A fixture inclui fotografias sintéticas nas capas e no portfólio, além de ilustrações antes/depois e exemplos sem foto. Nenhuma imagem comprova trabalho real; origem em assets/demo/IMAGE-PROVENANCE.md.
2. Solicitar orçamento → escolher adicionais → responder pergunta → nome/WhatsApp/aviso → notas/imagens permitidas → revisar/enviar. Consentimento de contato é separado; não autoriza marketing.
3. Acompanhar no mesmo navegador. Enviar mensagem na área de atendimento. ID isolado não concede acesso em outra sessão; link seguro usa mecanismo próprio de segredo, validade e revogação.
4. Em OUTRO perfil/contexto de navegador, entrar como agente A → Atendimento humano → Fila geral → buscar nome → assumir → responder. Notas internas não vão ao consumidor.
5. Aba Orçamento: serviço fixo permite proposta com condições do manual. Informar motivo, enviar. Consumidor atualiza, aprova versão e escolhe dia/horário. Reservas da fixture podem ocupar alguns horários; consultar disponibilidade atual.
6. Comercial: cenários fictícios já incluem oportunidades e tarefas elegíveis atrasadas. Assumir/iniciar/registrar resultado conforme janela e consentimento. Não há disparo WhatsApp. Conversão vem do critério persistido e eventos reais de aprovação/agendamento.
7. Painel A → Métricas e resultados: filtros, coorte e valores comerciais. Receita aparece indisponível. Empresa B possui dados próprios.
8. Painel A → Plano e utilização: plano com equipe ativo por pagamento simulado; Empresa B em trial. Cancelar ao fim/reativar, comparar ofertas, solicitar troca e ver utilização/histórico.
9. Root → Planos e assinaturas: criar/editar versões, selecionar empresa, ver uso/cobranças, suspender com motivo. Na demo habilitada, simular pagamento/falha/vencimento/reembolso. Isso não movimenta dinheiro. Nenhum cartão ou dado bancário é solicitado.
10. Root → Empresas/Pessoas e papéis/Auditoria/Métricas: administração cumulativa. Menu do celular é expansível; todas as rotas permanecem acessíveis conforme papel.

Planos e preços fictícios são editáveis. As regras comerciais definitivas ficam a cargo de Marcelo. A edição não reescreve versões contratadas. Na demo, as empresas são mantidas operacionais para percorrer os fluxos anteriores; billing não reduz RLS, autonomia ou validações existentes.


## Trial de 15 dias e análise fictícia

A Empresa B começa em trial de 15 dias definidos na versão da oferta. Abra sua assinatura com adminb@example.invalid para ver prazo e condições. Root, em Planos e assinaturas → selecionar B → Período gratuito, pode estender com motivo/confirmar e examinar o histórico. Política de elegibilidade permite configurar tipos e teto administrativo.

Para demonstrar recadastro: root cria empresa fictícia adicional, com um administrador já conhecido. Na visão da empresa, solicitar trial encaminha à análise se houver consumo anterior ou falta de identidade verificada. Root registra evidência exclusivamente fictícia no formato ZZ:DEMO:IDENTIFICADOR, ou analisa exceção legítima. Um campo preenchido não prova identidade. Nunca usar CPF/CNPJ/telefone real nessa demo. Fluxo e testes em docs/trial-and-abuse.md.
