# SYZIA 050 — complemento de versionamento jurídico

Preparação local autorizada em 13/10/2026. Inclui o ajuste de privacidade do proprietário: operação inicial por pessoa física; nenhum CPF completo, endereço residencial ou dado pessoal real foi incluído. A publicação continua pendente de identificação adequada, canal efetivo, avaliação jurídica e aprovação expressa. Este pacote não publica documentos nem exige aceite de conteúdo ainda não vigente.

Base: entrega 050 já aplicada sobre 049, incluindo observação financeira e HMAC MP-01. Preservar integralmente `server/`, migrations e regras financeiras. O pacote é incremental; não é uma instalação completa. A íntegra dos textos anteriores permanece em `docs/hotfix-050/`. Eles são textos-base para revisão, não documentos finais completos para publicar sem identificação.

- Aplicação e rollback: `GUIA-APLICACAO-E-ROLLBACK.md`.
- Dados pendentes e avaliação de identificação: `DADOS-JURIDICOS-PENDENTES.md`.
- Relatório e testes: `RELATORIO.md` e `MATRIZ-TESTES.md`.
- Configuração vazia: `config.example.json` (copiar para fora do repositório).
- Inspeção somente leitura: `scripts/legal-050/01-CONSULTAR.sql`.
- Preparação offline: `npm run legal:prepare -- preview|compile ...`.

Não há nova migration: só serão inseridos novos registros e alterado o indicador `current` nas versões anteriores. Não se modifica schema, trigger de imutabilidade, RPC de aceite, RLS ou FORCE RLS. Scripts gerados não apagam nem reescrevem aceites. O grupo de aceite novo é obrigatório nesta revisão material.

## Limites do mecanismo existente

O aceite é institucional por empresa e realizado pelo administrador autorizado. Funcionários não assumem o contrato comercial. A ciência da Política não se converte em consentimento genérico LGPD. Consumidores continuam nos seus fluxos existentes; este complemento não introduz um novo aceite individual para eles.

Empresas com `private.enterprise_codes.legal_required=true` terão nova pendência depois da publicação. A exceção de transição existente para empresas legadas sem essa exigência permanece intacta. A consulta informa quantas são; o proprietário deverá avaliar esse alcance antes de publicar. Não há aceite presumido nem alteração silenciosa dessa regra. A revisão de documentos não altera capacidades, assinatura ou grants.

## Privacidade na preparação

Configuração preenchida, snapshot e saída devem ficar fora do checkout. O CLI bloqueia caminhos internos, inclusive redirecionamento por symlink, cria arquivos com permissão restrita e não sobrescreve saídas existentes. Não lê `.env`, não carrega credenciais, não possui cliente de rede/banco e não envia dados. O JSON versionado contém apenas campos vazios e aprovações falsas. O nome e canais que o proprietário aprovar serão públicos se posteriormente executar o SQL; não colocar dados privados nesses campos.

Não há campo de CPF. Campos desconhecidos são recusados. A identificação numérica pessoal completa, indicação de endereço residencial e marcadores reconhecíveis são recusados. Essa validação auxilia a prevenção de acidentes, mas não certifica a veracidade dos dados nem substitui revisão humana. O endereço profissional é opcional na preparação e exige autorização específica para inclusão; sua suficiência jurídica depende da avaliação indicada no guia.
