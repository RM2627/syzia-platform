# SYZIA 050 — relatório do complemento jurídico

Data: 13/10/2026. Escopo: preparar integração versionada dos Termos e da Política, sobre a entrega 050, incorporando a proteção de privacidade do proprietário pessoa física.

## Resultado implementado

- Consulta somente leitura das versões correntes, grupos de aceite, hashes do conteúdo imutável, contrato das funções, RLS/FORCE RLS e contagens do alcance de aceites. Não depende de valores presumidos para o banco real.
- Preparador offline em duas etapas: revisão dos textos e compilação vinculada ao hash da revisão. Configuração preenchida e arquivos gerados ficam fora do projeto. Exemplo versionado vazio; nenhuma credencial ou dado pessoal real.
- Publicação transacional do par, sem alterações de schema ou novas migrations. A versão anterior só muda em `current`; corpo, identificação da versão, data de criação e grupo de aceite permanecem intactos.
- Uso da mesma trava transacional da RPC de aceite, seguido de lock da tabela, expectativas exatas e limites de espera. Reexecução/stale snapshot recusados; sem upsert que sobrescreva conteúdo.
- Rollback transacional que conserva todos os registros. Recusa após qualquer aceite das novas versões/grupos ou diante de versão posterior, exigindo uma revisão corretiva.
- Versões e grupos de aceite novos para a revisão material. Reutiliza a RPC existente, com identidade, empresa, data e versões aceitas. Não concede acesso por simples geração de arquivos nem exige aceite antes da publicação.
- Interface passa a exibir literalmente o corpo salvo, sem substituição retroativa de marca. Se uma publicação ocorrer durante a leitura, a RPC recusa a versão antiga; a tela oferece carregar a nova e limpa os checkboxes para nova revisão. Quebra de linhas longas mantém contatos legíveis em telas estreitas.

## Redação e privacidade do proprietário

Os três documentos da entrega anterior foram lidos integralmente. Os textos-base de Termos/Privacidade foram preservados byte a byte. Na geração, acrescenta-se identificação e contato a partir de dados aprovados, e substituem-se somente as duas referências genéricas ao formulário comercial pelos canais confirmados. Mantêm-se condições comerciais, Manual opcional, Assistido indisponível, responsabilidades, direitos, categorias de tratamento, finalidades e limites. Nenhum detalhe interno foi acrescentado aos textos destinados ao público.

Não foi inserido nome pessoal real, CPF, residência ou contato inventado como identificação do operador. Não há campo para CPF completo. O endereço profissional depende de necessidade e aprovação; a residência não é usada como padrão. O gerador rejeita configuração incompleta, campos inesperados, padrões de identificação pessoal proibida e pendências de aprovação. Não se presume que esses bloqueios substituam avaliação jurídica.

O relatório `DADOS-JURIDICOS-PENDENTES.md` registra a questão de identificação do fornecedor à luz da legislação brasileira e as decisões que o proprietário precisa resolver. Não se presume dispensa legal nem se expõe dado pessoal por inferência. Caso a avaliação exija divulgação adicional, ela deve ser submetida a aprovação expressa antes de qualquer publicação. As confirmações em configuração não constituem parecer jurídico automático.

## Alcance do novo aceite

Esta revisão é material. Usar um grupo de aceite novo, não o grupo editorial anterior. O mecanismo atual exige aceite institucional do administrador nas empresas com `legal_required=true`. Um aceite de A não libera B. Funcionários não passam a assumir contrato; consumidores permanecem nos fluxos existentes. A ciência da Política não equivale a consentimento genérico.

A exceção já existente para empresas legadas sem exigência de aceite não foi removida. A inspeção informa sua quantidade; seu alcance deve ser conferido antes da publicação. Não há aceites presumidos nem alteração retroativa dos registros. Caso o proprietário queira encerrar a exceção de transição, essa decisão precisa ser expressa e tratada separadamente, sem transformar este complemento em mudança silenciosa de acesso.

## Preservação

Nenhum arquivo de `server/` foi alterado. O hotfix financeiro 050, seu modo de observação e o HMAC MP-01 estão preservados. Todas as 46 migrations, lockfile, assets e módulos de negócio permanecem byte a byte. O manifesto `preserved-sha256.json` e o teste L050-T05 verificam essa preservação. Não se alterou trigger, RPC, políticas, preços, trial, tolerância, cancelamento, capabilities ou autorização.

A única alteração no servidor de demo é uma fixture jurídica local condicionada a `DEMO_TEST_MODE=true` e `DEMO_LEGAL_050=true`; está ausente do backend de produção. Ela publica documentos de ensaio apenas em PGlite descartável e permite testar a corrida entre publicação e tela aberta. Não é uma rota de publicação da aplicação real.

## Testes e limites

Resultados finais constam de `MATRIZ-TESTES.md` e do arquivo de gate entregue separadamente. O pacote incremental é sobreposto a uma cópia nova da base 050 para executar instalação, build/typecheck e todas as etapas vigentes do gate, acrescidas dos testes jurídicos. Nenhum teste histórico foi removido ou enfraquecido.

O ensaio PostgreSQL nativo com conexões concorrentes foi preparado e tentado, mas o contêiner recusou atribuir o usuário necessário ao cluster (`chown`, `EINVAL`). Resultado explícito: **BLOQUEADO, não executado**. PGlite comprova regras SQL, rollback e rejeição de versões desatualizadas; não comprova contenção entre sessões PostgreSQL independentes. Os quatro casos nativos permanecem para execução posterior em Linux compatível, sem apontar para banco real.

Na preparação dos testes, foram corrigidos erros das novas fixtures: e-mail repetido, alias SQL ambíguo e argumentos de provisionamento/username fora do contrato. As validações reais foram mantidas. Essas tentativas intermediárias não integram o pacote principal; a matriz apresenta os resultados finais e a limitação nativa.

## Pendências externas

1. Identificação suficiente e canais verdadeiros aprovados pelo proprietário; avaliação específica de eventual obrigação de divulgar dados pessoais, com aprovação expressa antes de fazê-lo.
2. Confirmação de fatos jurídicos, comerciais e de tratamento de dados. Os documentos desta entrega são bases de revisão, não textos incompletos anunciados como definitivos.
3. Consulta das versões e alcance do aceite no banco real pelo proprietário, revisão do hash e execução futura do par de scripts aprovado.
4. Concorrência nativa em ambiente compatível e validação externa de sessão/aceite no Supabase quando autorizada.
5. MP-01 continua pendente de homologação externa; nenhum avanço financeiro foi presumido.

Não houve deploy, push, publicação, SQL no Supabase real, alteração de credenciais, cobrança ou uso de dados pessoais reais. Após a entrega, parar.

## Validação final da sobreposição

- `npm ci`: PASS em extração nova (`validation-final`).
- `npm run build`: PASS, incluindo typecheck. Aviso preexistente de chunk PDF acima de 500 kB, sem alteração neste escopo.
- `npm run test:current-gate`: PASS, **28/28 etapas**. As 25 anteriores permanecem; três etapas jurídicas foram acrescentadas.
- Testes jurídicos focados: 19 PASS; regressões jurídicas históricas: 4 PASS; navegador jurídico: 6 PASS.
- Inspeção visual de cabeçalho/corpo/rodapé em desktop e celular: sem corte, sobreposição ou transbordamento, inclusive contatos longos.
- Integridade: 218 arquivos protegidos idênticos, incluindo os 18 arquivos de `server/`, HMAC, motor financeiro, 46 migrations e lockfile.
- Concorrência PostgreSQL nativa: BLOQUEADA pelo ambiente, 4 casos preparados e não executados. Não incluída no PASS do gate local.

A publicação jurídica permanece pendente de dados, avaliação e aprovação do proprietário. Nenhum documento foi publicado no ambiente real.
