# Dados e decisões pendentes — uso interno do proprietário

Este relatório não faz parte dos documentos públicos. Não preencher dados pessoais no repositório nem anexar CPF/endereço residencial a este pacote.

## Operação inicial por pessoa física

A instrução é preservar a privacidade do proprietário sem ocultar a identidade do fornecedor/controlador. O gerador não solicita CPF completo, não oferece campo para publicá-lo e não presume que seja dispensável por lei. Nenhum número fictício foi acrescentado neste complemento. Também não se presume que um CPF mascarado satisfaça eventual exigência de identificação.

Há uma questão que deve ser avaliada antes da publicação: o art. 2º, I–II, do Decreto 7.962/2013 prevê identificação cadastral do fornecedor, quando houver, e endereços físico/eletrônico em meios utilizados para oferta ou conclusão de contratos de consumo. A norma não diz que o endereço deva ser residencial. O enquadramento das ofertas da SYZIA, o alcance da divulgação cadastral e a possibilidade de endereço profissional válido precisam de avaliação jurídica específica. Não foi concluído que o CPF completo possa ser omitido em toda situação, nem autorizado expô-lo.

Se a avaliação concluir pela divulgação de algum dado pessoal adicional, registrar em documento **privado**: fundamento, finalidade, dado estritamente necessário, local e forma de divulgação, alternativas consideradas e decisão expressa do proprietário. Se houver exigência de CPF completo ou endereço residencial, **não usar este gerador para contornar o bloqueio**, não marcar `no_personal_data_disclosure_pending=true` e não publicar. Encaminhar a exigência para aprovação expressa e adequação específica posterior.

A LGPD, art. 9º, III–IV, exige transparência sobre identificação e contato do controlador; isso não equivale, por si só, a determinar CPF integral público. O princípio da necessidade (art. 6º, III) exige limitar dados ao necessário. Essas regras precisam ser conciliadas com as obrigações específicas de informação do fornecedor.

## Confirmações necessárias

| Item | Campo / decisão | Estado nesta entrega |
|---|---|---|
| Nome que identifique adequadamente o fornecedor/controlador pessoa física | `public_identity.operator_name` | Não informado; sem nome inventado |
| Canal monitorado de atendimento | `support_email` | Não informado |
| Canal efetivo para direitos de titulares, acessível também a quem não possui empresa | `privacy_email` | Não informado; não presumido pelo formulário comercial |
| Identificação cadastral aplicável e local/forma legalmente exigidos | Avaliação privada; `identification_review_resolved` | Pendente; nenhum CPF solicitado/publicado |
| Endereço físico de contato, quando aplicável | Avaliar endereço profissional válido; `professional_address` e autorização de divulgação | Pendente; não usar residência automaticamente |
| Encarregado e eventuais condições de dispensa | Avaliar art. 41 da LGPD e regulamentação aplicável | Pendente; não presumida dispensa |
| Fornecedores, compartilhamentos, transferências, retenção e canais efetivamente utilizados | Revisar fatos descritos nos textos; `facts_confirmed` | Confirmação do proprietário pendente |
| Alcance de novo aceite nas empresas legadas | Conferir contagens do snapshot e regra de transição | Banco real não consultado |
| Texto completo e identificação suficientes | `required_information_complete` e referência privada da revisão | Falso por padrão |
| Aprovação do proprietário sobre os textos exatos | `owner_approved` + SHA-256 da revisão | Falso por padrão |

As confirmações são declarações do responsável, não um parecer automático do software. Só marcar verdadeiro depois de resolver de fato as pendências. A referência da avaliação deve ser um identificador sem dados pessoais; o conteúdo do parecer fica privado.

## Fontes oficiais consultadas em 13/10/2026

- Decreto 7.962/2013, arts. 1º e 2º: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm
- LGPD, arts. 6º, 9º e 41: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm

A entrega prepara código e procedimentos. Não representa certificação jurídica, autorização de lançamento ou publicação de documentos incompletos.
