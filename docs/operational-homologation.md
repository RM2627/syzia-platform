# Homologação externa — revisão operacional e onboarding

**PENDENTE DE HOMOLOGAÇÃO EXTERNA. Não executada nesta entrega.** A demonstração usa Auth fictício e SQL local; não comprova Auth, PostgREST, SMTP, Storage ou concorrência distribuída no Supabase.

Somente quando Marcelo autorizar: criar projeto dedicado de testes, sem dados reais, seguir os guias anteriores e aplicar todas as migrations 001–024 em ordem. Nunca reutilizar o projeto real da MS Auto Details. Não fazer deploy público para validar estes itens.

## Preparação

1. Executar `npm ci`, copiar `.env.example` e configurar URL/chave pública do projeto de homologação. Chaves privilegiadas ficam exclusivamente no servidor/configuração restrita descrita nos guias anteriores.
2. Criar empresas fictícias A/B, dois gestores em A, um gestor também vinculado a B, atendente próprio A, compartilhado A, consumidor A/B e superadmin sem vínculo empresarial. Confirmar e-mails e obter tokens reais.
3. Configurar horas, catálogo, recurso único, publicação e modalidades própria/compartilhada/mista. Verificar plano vigente quando o recurso compartilhado exigir esse direito.
4. Para a inspeção HTTP somente leitura, copiar o formato de `.homologation/central.json` descrito no guia da Central para `.homologation/operations.json`. Informar os tokens e identificadores fictícios exigidos por `central-config.mjs`. Executar explicitamente `node scripts/homologation/operations-http.mjs --read-only`. Não versionar credenciais. O script não faz deploy ou mutações.

## Matriz obrigatória com sessões reais

| Cenário | Resultado exigido |
|---|---|
| Organização nova | Checklist incompleta; campos não salvos não geram progresso |
| Salvar dados e retornar à Home | Checklist reflete registros persistidos |
| Optar por atendimento compartilhado | Manual, FAQ, regras, autonomia e prontidão aparecem |
| Tutorial | Iniciar, avançar, voltar, recarregar, pular, concluir e refazer persistem |
| Dois gestores em A; mesmo gestor em A/B | Estado independente por par usuário/organização |
| Duas abas e revisão antiga | Uma transição válida; outra recebe conflito; recarregar sem perder estado salvo |
| POST/PATCH direto em tabelas | Escrita negada; nenhuma policy de escrita |
| Superadmin sem vínculo e atendentes | Sem clientes, ficha, Home ou indicadores gerenciais privados |
| Revogar gestor/atendente ou suspender empresa | Próxima chamada com token anterior negada |
| Mesmo telefone em clientes/empresas diferentes | Sem mescla ou concessão de identidade |
| Criar cliente + orçamento manual | Consentimento/finalidade, cálculo, oportunidade e histórico corretos |
| Duas reservas do mesmo recurso/horário | Uma confirmação apenas, em conexões independentes |
| Bloqueio contra reserva simultânea | Constraint impede sobreposição; operação perdedora reverte |
| Reagendamento para horário ocupado | Reserva anterior permanece intacta |
| Iniciar e concluir | Revisão, idempotência, histórico e acompanhamento; nenhuma receita inferida |
| Notificação | Link abre objeto correto; leitura não é compartilhada com outro gestor |
| Métricas | Conclusão por data do evento; filtros/Recife; sem somar como faturamento |
| Rascunho/publicação e anexos | Repetir proteção de conteúdo interno, Storage privado e URLs expiradas |

As chamadas de mutação devem reutilizar os argumentos dos testes `tests/onboarding.test.mjs` e `tests/operations.test.mjs`, substituindo exclusivamente identidades e objetos pelas fixtures do projeto dedicado. A chave de idempotência permanece igual para repetição da mesma intenção; dados diferentes exigem chave nova.

## Concorrência local independente preparada

`npm run test:operations:native` cria e remove um cluster PostgreSQL local descartável. Exige Linux capaz de executar PostgreSQL como usuário sem privilégios e o pacote opcional instalado. Usa conexões independentes para revisão do tutorial, idempotência e disputa de reserva. Neste ambiente o servidor não iniciou devido à impossibilidade de mapear usuário não-root; portanto **não houve aprovação desses testes**. Mesmo aprovação futura local não substitui repetição via HTTP/PostgREST externo.

Repetir também os testes anteriores de trial, recuperação, permissões, uploads, backups/restauração e limites. Registrar data, projeto dedicado, migrations, tokens/roles usados (sem segredos), resultado por cenário e evidências. Não declarar a plataforma homologada enquanto essa verificação não for concluída.
