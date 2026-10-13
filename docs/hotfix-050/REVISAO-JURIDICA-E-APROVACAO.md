# Revisão jurídica — conteúdo preparado, integração pendente

## Trabalho concluído

Os arquivos `TERMOS-DE-USO-REVISADOS.md` e `POLITICA-DE-PRIVACIDADE-REVISADA.md` foram reescritos integralmente para empresas e consumidores. Não contêm MP-01, homologação, Webhooks, Render, Supabase, migrations, resultados de testes ou instruções de desenvolvimento. Informações técnicas desta rodada permanecem nos relatórios.

Foram preservados e esclarecidos: finalidade do serviço, responsabilidade das empresas por seus serviços, papéis e permissões, Manual opcional, indisponibilidade comercial do Assistido, distinção entre assinatura da plataforma e pagamentos dos serviços, condições de cancelamento/tolerância, direitos do consumidor, dados tratados, finalidades, compartilhamentos relevantes, papel do Mercado Pago, conservação, segurança, armazenamento no navegador e direitos dos titulares.

Os textos não anunciam contratação paga ou trial disponível. Não contêm contatos, CNPJ, endereço ou certificações inventados. Não instituem taxa, pró-rata, exclusão automática de histórico, foro restritivo ou exoneração geral de responsabilidade.

## Impedimento real à integração automática

`src/access/Legal.tsx` consulta `public.legal_documents` e usa esse mesmo conteúdo na página pública, na tela de aceite e nos links da área legal. `public.access_legal_accept` registra `version` e `acceptance_version` em `private.legal_acceptances`.

Na migration histórica 026, `private.legal_immutable` impede editar ou apagar o conteúdo de uma versão existente. A alteração de `current` é permitida para que uma nova versão assuma a vigência sem apagar a anterior. Os documentos presentes na base são minutas, com campos de identificação pendentes. O banco real não foi consultado: eventuais versões adicionadas pelo proprietário devem ser consideradas antes da aplicação.

O pedido desta rodada diz expressamente **“Não alterar ... banco de dados”**. Por isso, não foram criados registros novos, migration, SQL de atualização executável ou máscara de frontend que alterasse o contrato exibido sob o identificador de uma versão antiga. Não se enfraqueceu o trigger, a RPC, o aceite ou o histórico.

**Consequência prática:** aplicar somente este hotfix não substitui o corpo dos documentos públicos que vem do banco. A única alteração já aplicada na interface é a remoção do parágrafo fixo sobre homologação da tela “Antes de começar”. As minutas antigas continuarão visíveis enquanto forem as versões vigentes no banco. Essa pendência não é apresentada como correção concluída.

## Decisão concreta solicitada ao proprietário

Autorizar, após revisar estes dois textos, **a preparação de novas versões de conteúdo em `legal_documents`, preservando schema, versões antigas, aceites e regras de acesso**. Não se trata de autorizar execução no Supabase real ou deploy; essas ações continuam excluídas.

A criação seria transacional: conferir a versão atual esperada; desmarcá-la como corrente; inserir a nova versão dos dois documentos; manter os conteúdos antigos e seus aceites. O identificador exato da versão atual deve ser conferido para não substituir uma revisão posterior desconhecida. Não atualizar `body` da versão anterior nem redefinir aceites existentes.

Como os documentos atuais são minutas com lacunas e os textos revisados contêm esclarecimentos substantivos, **não foi presumido que se trata apenas de correção editorial para fins de aceite**. A necessidade de novo aceite e sua versão devem ser aprovadas junto do conteúdo, considerando o comportamento existente da plataforma. Não se alterou silenciosamente a exigência de aceite.

## Informações ainda necessárias

1. Nome/razão social do responsável pela SYZIA, CPF/CNPJ aplicável e endereço profissional que devam ser divulgados. A marca “SYZIA” não substitui a identificação jurídica do fornecedor/controlador.
2. Canal efetivo e monitorado para privacidade e exercício de direitos; identificação/contato do encarregado, quando aplicável. O formulário `/contato` existe, mas é voltado a interesse comercial e exige empresa e telefone. Não foi declarado que ele, sozinho, satisfaz o atendimento de direitos de qualquer titular.
3. Confirmação dos fornecedores efetivamente utilizados, categorias compartilhadas, regiões/transferências e critérios concretos de retenção. O texto descreve categorias conhecidas; não inventa regiões, contratos ou garantias internacionais já celebradas.
4. Aprovação jurídica e comercial dos textos e do tratamento dos aceites anteriores. Não se declara uma certificação de conformidade legal da plataforma.

As informações de identificação e contato deverão ser incorporadas de forma clara aos documentos, antes de sua aprovação para publicação. Não foram espalhados marcadores internos “[A DEFINIR]” pelo texto destinado ao usuário. Isso não significa que as informações ausentes sejam dispensáveis.

## Testes de apresentação

O navegador recebe uma resposta **fictícia e explícita** com os textos revisados para avaliar 1440, 768, 390 e 320 pixels, links, conteúdo e ausência de transbordamento. Esse teste verifica apenas a apresentação do componente existente. Não publica documentos, não grava aceite e não comprova substituição no banco.

O teste de contrato conserva a consulta ao banco e a RPC de aceite. A regressão adicional de acesso empresarial verifica versões, aceite e preservação de histórico no banco local descartável. Resultados efetivos constam no relatório de testes.

## Referências oficiais de revisão

- [LGPD — texto compilado](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm), especialmente transparência, direitos dos titulares, bases legais, conservação, transferências e segurança.
- [Código de Defesa do Consumidor](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm), especialmente informação, responsabilidades e arrependimento quando aplicável.
- [Decreto 7.962/2013](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm), identificação e contato do fornecedor, informação da oferta e atendimento eletrônico.

Consulta realizada em 13/10/2026. Os textos revisados são uma entrega de redação e adequação ao produto, sujeita à confirmação dos fatos jurídicos acima; não são apresentados como documentos já vigentes ou juridicamente aprovados pelo proprietário.
