> Registro histórico. A autorização posterior inclui a Fase 4 e sua ampliação; estado atual em `phase-4-report.md`. Homologação real continua pendente. Não interpretar limites de fase abaixo como o estado atual do desenvolvimento.

# Fase 3 — roteiro de homologação externa

**PENDENTE DE HOMOLOGAÇÃO EXTERNA.** Este arquivo contém instruções para Marcelo executar posteriormente. Os testes locais não comprovam Auth, PostgREST, SMTP, concorrência entre conexões nem restauração em Supabase real. A pendência não impede desenvolver fases expressamente aprovadas. Produção e lançamento continuam exclusivos do usuário.

## Preparar o ambiente

1. Preserve e siga `docs/homologation-guide.md` para Supabase dedicado, Auth, seis contas fictícias confirmadas, bootstrap restrito e duas empresas da fixture da Fundação. Não use o projeto ou dados da MS Auto Details.
2. Aplique as três migrations da Fundação, caso ainda não aplicadas. Em seguida aplique **uma vez**, nesta ordem, `202609150004_company_schema.sql` e `202609150005_company_commands.sql`. Se já aplicou a Fundação, não repita os três arquivos iniciais. Registre hashes, versão PostgreSQL, executor, horário e resultado.
3. Execute `scripts/homologation/company-inspect.sql`. Espere 16 tabelas públicas com RLS/FORCE RLS e 16 policies SELECT para `authenticated`, sem grants de escrita direta. São 10 RPCs novos. Entre os RPCs da aplicação, apenas `company_public_faq(text)` aceita execução de `anon`; os oito RPCs da Fundação permanecem exclusivos de `authenticated`.
4. Use a aplicação somente no host local, com `.env` contendo URL e chave pública. Não abra túnel, domínio, deploy ou acesso público. Configurações de FAQ e manual são estados de dados no projeto dedicado, não autorização de lançamento.
5. Mantenha credenciais no seu computador, em `.homologation/connection.json`, usando `homologation.example.json`. Nunca inclua essa pasta, senhas ou dumps em Git, ZIP ou frontend.

## Runner HTTP da Empresa

```bash
npm run homologation:company:mutations
npm run homologation:company:read
```

O modo `mutations` exige exatamente o conjunto fictício da Fundação: seis perfis ativos conhecidos, somente o superadmin inicial, duas organizações com IDs configurados e slugs `homologacao-fundacao-...`. Exige **módulo Empresa ainda vazio nas duas empresas**, evitando sobrescrever configuração existente. Primeiro execute e conclua os testes da Fundação; não execute dois runners ao mesmo tempo.

O runner autentica com as seis contas reais de teste e usa apenas a chave pública. Cria configuração, regras, permissões, serviço, adicional, pergunta, FAQ, resposta rápida e manual completo em A/B usando os RPCs autorizados. Depois testa leituras PostgREST, acesso cruzado, alteração direta de autonomia, FK composta, contradição de preço, imutabilidade de manual, conflito de revisão e revogação de autonomia reutilizando o access token original.

**Efeitos esperados:** os dados fictícios e a auditoria permanecem no projeto. Ao final do modo de mutações, A fica intencionalmente com autonomia revogada, atendimento humano desabilitado e publicação desatualizada. A FAQ pública não é habilitada automaticamente pelo runner. Revise esses estados na interface; uma nova publicação requer novo rascunho. Nenhum dado é apagado automaticamente e não há rollback global das chamadas HTTP.

Se a execução falhar no meio, guarde o relatório e inspecione o estado. O runner não aceita reaplicar a preparação sobre dados parciais. Corrija e continue os casos manualmente no mesmo ambiente fictício; não remova proteções nem troque para uma base real para obter sucesso. O modo de leitura pode ser repetido após configuração completa, inclusive depois das mutações, pois confere isolamento e existência dos registros.

Relatórios sem senhas/tokens são gravados em `.homologation/reports/company-http-*.json`. O campo `homologated` permanece `false`: o runner não comprova sozinho todos os critérios desta fase.

## Jornadas manuais e FAQ

- Admin A configura A; Admin B configura B. Tente trocar o UUID no endereço e nas requisições. Confirme ausência de dados e impossibilidade de alterar registros de outra empresa.
- Com colaborador e atendente, tente enviar diretamente `company_save` para `permissions`, `settings`, `section` e `rules`; espere SQLSTATE `42501`. Tente inserir/atualizar tabelas diretamente pelo PostgREST. Não deve haver alteração.
- Salve serviços fixos, a partir de e sob consulta; valide centavos, duração, adicionais e perguntas. Rejeite preço negativo, fixo sem valor, consulta com valor, pergunta de escolha sem opções válidas, referência a serviço de B e agendamento direto sem preço fixo/duração.
- Publique um manual incompleto: espere recusa. Complete todos os tópicos e requisitos, publique e confira ator, versão, data e snapshot. Uma atualização deve ocorrer em novo rascunho. Atendente vinculado só consulta versões publicadas e respostas aprovadas.
- Revise explicitamente o conteúdo fictício antes de habilitar a FAQ no projeto de teste. Consulte `/empresa/:slug/faq` em janela sem login. A resposta deve conter somente nome, slug, versão, data e perguntas/respostas publicadas. Não deve incluir contato interno, regras, permissões, observações ou IDs. Nenhuma tabela privada deve aceitar leitura anônima.
- Altere uma FAQ sem nova publicação: a consulta pública deve manter a resposta aprovada anterior. Retire a FAQ e repita a consulta: deve ficar indisponível. Suspenda a empresa: a próxima consulta deve retornar `null` e a interface deve ocultar o conteúdo na revalidação (até 15 segundos). Nada pode recolher conteúdo que já tenha sido visto/copiadο por um visitante.
- Sem principal ativo, mantenha o atendimento humano bloqueado. Catálogo interno e FAQ aprovada não exigem esse vínculo. Não desative CAPTCHA, confirmação de e-mail ou constraints para conseguir testar.
- Repita os testes da Fundação de suspensão de perfil, revogação de membro, vínculo e papel com tokens preexistentes, incluindo `company_context` e `company_attendant_permission`. Baixe o desconto e confirme que o limite anterior não autoriza a próxima operação.

## Concorrência real com conexões independentes

O teste sequencial local de revisão obsoleta não substitui este caso. Use duas sessões psql independentes, com PIDs diferentes, em conexão direta ou modo session do banco dedicado. Os arquivos usam claims de teste no banco; não substituem os testes HTTP com JWT real.

1. Obtenha, no contexto da empresa fictícia A, `settings.revision`. Use esse mesmo valor nos dois processos. Use UUID de um administrador empresarial ativo dessa empresa.
2. Execute A e, durante os 15 segundos de retenção do lock, execute B:

```bash
psql "$TEST_DATABASE_URL" -v admin_uuid=UUID_ADMIN_A -v organization_uuid=UUID_EMPRESA_A -v expected_revision=REVISAO_ANTES -f scripts/homologation/company-concurrency-a.sql
```

```bash
psql "$TEST_DATABASE_URL" -v admin_uuid=UUID_ADMIN_A -v organization_uuid=UUID_EMPRESA_A -v expected_revision=REVISAO_ANTES -f scripts/homologation/company-concurrency-b.sql
```

3. A deve confirmar sua alteração; B deve aguardar e falhar com `40001`, sem sobrescrever A. Guarde PIDs, horários e resultado. A configuração fica alterada para um nome fictício, o manual desatualizado e o atendimento humano desabilitado; revise e republique depois.
4. Repita o cenário com publicação contra revisão obsoleta (`company_publish_manual`) e criação de duas revisões de manual: somente uma deve ser aceita. Não confunda dois pedidos HTTP paralelos com prova de bloqueio em conexões independentes.
5. Repita concorrência de suspensão/revogação da Fundação contra edição empresarial, usando um segundo administrador elegível para respeitar a proteção do último administrador. A operação que ocorre depois da revogação confirmada deve falhar em autorização. O lock `734921501` é compartilhado pelas duas fases.

## Segredos, abuso, backup e restauração

Mantenha o roteiro original de SMTP, redirects, rate limits, CAPTCHA e restore. Refaça a inspeção do build com a configuração final do ambiente: nenhuma service role, `sb_secret_`, senha ou chave administrativa pode aparecer no bundle. O build local rejeita os padrões privilegiados conhecidos; isso não substitui conferir os valores configurados posteriormente pelo operador.

No backup, inclua as dez novas tabelas, versões/snapshots imutáveis, FKs compostas, triggers, funções, policies e a auditoria compartilhada. Na restauração isolada, compare as **16 tabelas** e sequências, autenticação e configurações externas necessárias. Repita os testes de isolamento, publicação, FAQ, revogação e prontidão. Nunca restaure sobre a origem nem ative plano pago sem decisão do usuário. Método, plano disponível e destino seguro ainda dependem de Marcelo.

## Registro de evidências

Use `docs/phase-3-external-report-template.md`. Diferencie cada resultado real dos relatórios locais incluídos no pacote. Mesmo com homologação concluída, **a Fase 4 exige aprovação expressa de Marcelo**. Nenhuma publicação ou lançamento é realizado por este guia.
