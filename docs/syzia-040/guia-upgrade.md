# SYZIA 040 — guia de atualização sem reset

Esta entrega parte exclusivamente do ZIP consolidado 039. O pacote 040 contém todos os fontes, assets, migrations e documentos anteriores, acrescidos das correções autorizadas. Nenhuma implantação foi feita nesta rodada.

## Atualização 039 → 040

1. Confirme que o ambiente está no consolidado 039 e preserve o backup e as configurações server-side pelo procedimento já usado no projeto.
2. Programe a atualização conjunta de banco e frontend. Aplique **somente** `supabase/migrations/202609260040_post_homologation.sql` depois da 039. Não resete o banco e não reaplique, renumere ou edite migrations antigas.
3. A migration é transacional. Se falhar, interrompa a atualização e trate o erro; não continue com frontend 040 sobre banco sem as RPCs 040. Ao concluir, ela solicita a atualização do schema cache do PostgREST.
4. Atualize os fontes para 040. Rode `npm ci` e `npm run build` com a configuração do ambiente. Nenhuma dependência nova ou segredo novo é necessário. Não publique o servidor de demonstração nem habilite `VITE_LOCAL_DEMO=true` fora da demo descartável.
5. A validação local já foi executada. A aplicação dessa atualização e a homologação externa dependem da decisão manual do proprietário.

As 36 migrations anteriores permanecem byte a byte iguais à base 039. Não há migração automática de assinaturas, mudança em versões contratadas, reset de trial, concessão em massa ou publicação de novos planos. Os nomes comerciais, valores, dias e limites continuam vindos dos registros versionados.

## Uso das correções

**Trial.** No site: escolher plano → confirmar dados → servidor verifica elegibilidade → aceitar condições → ativar período configurado. Não há etapa de pagamento simulado para conceder o trial. Na empresa existente, Plano e assinatura solicita a confirmação do documento. Histórico consumido bloqueia novo benefício; política/dados inconclusivos mantêm o caminho de análise. Uma revisão antiga continua preservada. A contratação paga segue a disponibilidade real do fluxo de cobrança da base 039.

**Homologação de plano.** Super Admin: Administração SYZIA → Empresas → Plano para homologação, ou Planos e assinaturas → selecionar empresa. Escolha uma versão real, informe motivo e aplique. Entre separadamente com o ADM real da empresa. O aviso de homologação aparece no painel. Para trocar, selecione outra versão; para encerrar, informe motivo e confirme Encerrar homologação. Retirar o teste restaura a avaliação da assinatura/isenção legítima existente. Os dados operacionais permanecem. Nenhum membership, assinatura, trial ou pagamento é criado por essa aplicação.

A retirada de `human_support` suspende as atribuições compartilhadas atingidas e bloqueia novas ações. Repor a capacidade não reativa pessoas silenciosamente: o Super Admin deve revisar e reativar a atribuição. Serviços e membros que ultrapassem um limite menor permanecem registrados; novas inclusões respeitam o limite efetivo.

**Equipe SYZIA.** Administração → Equipe SYZIA concentra as identidades globais, provisionamento, reemissão, edição, revogação de sessões, suspensão/desativação/reativação e atribuições por empresa. Administração → Pessoas e acessos continua disponível para pessoas e vínculos empresariais. ADM empresarial ajusta apenas grants/autonomia locais dos atendentes atribuídos, dentro do teto; não recebe controles de identidade ou credencial global.

**Permissões.** Ler a Central é diferente de assumir/responder. Grants efetivos, papel, vínculo/atribuição, plano, escopo e estado continuam sendo validados no servidor. Fila geral recebe solicitações não atribuídas; Minha fila exige atribuição ao usuário. Falta de leitura de Clientes é exibida como falta de acesso.

**Consumidor.** Acompanhar, conversa, propostas, agendamento e Meus pedidos no contexto de uma empresa usam a identidade publicada. Alterar um rascunho não muda esses canais até publicar. Propostas que dependem de aprovação não mostram consulta de agenda antecipada. Consulta de horários sempre informa resultado ou erro.

## Reproduzir testes locais

```bash
npm ci
npm run test:040
npm run test:040:regression
npm run test:040:browser
npm run build
npm run check:bundle
```

O navegador usa a demo descartável com Auth fictício e SQL real em PGlite. Instale o Chromium do Playwright ou configure `FOUNDATION_CHROMIUM_PATH`. A configuração inicia e encerra o servidor local. Dados, contas, documentos e contatos dos testes são fictícios.

`npm run test:040:native` repete a suíte SQL em cluster PostgreSQL descartável, sem aceitar banco remoto. Nesta execução, o ambiente não permite criar o usuário de sistema necessário e o comando terminou sem executar testes. A validação com conexões concorrentes e infraestrutura externa continua pendente. Não use os comandos de homologação com mutações em um ambiente externo sem sua autorização específica.

## Validação manual após autorização

Conferir os quatro perfis comerciais configurados e limites reais; empresa sem assinatura, com assinatura e com isenção; aplicar/trocar/retirar plano temporário; conta ADM real em sessão aberta; grants de leitura/ação; trial novo/usado/inconclusivo/manual; atribuições A/B; nova solicitação e cliente; Central, proposta, aprovação/recusa, agenda e execução; temas claro/escuro; retorno à Administração. Confirmar também serviços externos de Auth, links, e-mail e anexos no ambiente escolhido.

Não desfazer a 040 apagando tabelas ou histórico. Um retorno de frontend deve ser acompanhado de avaliação de compatibilidade: o cadastro 039 exige o consentimento antigo e pagamento simulado, enquanto a 040 usa confirmação própria. Correções de persistência devem ser incrementais e revisadas. Após entregar, esta rodada para para validação do proprietário.
