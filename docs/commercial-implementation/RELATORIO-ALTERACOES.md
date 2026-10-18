# SYZIA — entrega comercial 054 após D01/D02/D09

## Referência e escopo

Implementação sobre o arquivo oficial extraído de `4b33f423982e6d3703935ae2f18a738c0496b72e`, SHA-256 `a12d73e79fb4d6546044518f3a3eee514c012b93b448b294fdf8e4e940c1cd42`. São 1.090 arquivos originais. Não foi presumida equivalência com alterações posteriores no ambiente publicado.

As aprovações foram incorporadas ao ambiente comercial integrado. A entrega é um incremento para homologação; não houve push, deploy, SQL no Supabase real, contratação/configuração de serviços, cobrança ou envio real de e-mail.

## Mudanças entregues

| Área | Implementação |
|---|---|
| Workspace | Grupo Gestão Comercial com Interessados, Demonstrações, Templates, Convites e Ativações. Sidebar oficial e logo R2 preservadas. |
| CRM | Responsável/empresa/segmento/Instagram/e-mail/WhatsApp opcional, primeiro contato, etapa, observações, histórico e autorização por finalidade. Carteiras isoladas; assinantes não recebem acesso. |
| Templates | Quatro layouts sobre a mesma página pública; editor, preview e publicação originais, sem duplicar motor de serviços. |
| Demonstrações | Banco exclusivo, migrations/regras reais e componentes operacionais reutilizados. Editor autorizado, snapshot versionado, endereço exclusivo por slug e links copiáveis. Sessões isoladas por visitante e geração. |
| Comunicação | Transporte SMTP existente reutilizado; links exclusivos, marca R2, prévia e confirmação, seleção de elegíveis, remoção de destinatários, limite, descadastramento, resultados individuais e recuperação conservadora. |
| D02 | Super Admin revisa o vínculo com decisão e histórico. Link, posse de e-mail e recebimento de convite não concedem propriedade. |
| D01-A | Responsável autenticado e aprovado revisa o snapshot e conclui o cadastro existente. Configuração permitida é importada para uma única organização restrita; nada é publicado ou contratado automaticamente. |
| Continuidade financeira | Checkout, identidade, trial e confirmação oficial existentes. Catálogo preparado permanece inativo até confirmação financeira apropriada. Indicadores comerciais consultam o contrato local confirmado. |
| Isolamento | Sem clientes reais na demo, sem importação de pessoas/atendimentos/reservas/histórico financeiro; sem Auth, Mercado Pago ou e-mail externo para visitantes. |

## Inventário por responsabilidade

- `server/commercial/`: controle, links, criptografia, transporte, banco demonstrativo, whitelist de RPCs/configuração, mídia e promoção dos assets aprovados.
- `src/platform-commercial/`: telas de gestão, ativação vinculada, revisão e indicador de preparação.
- `src/demo/`, `demo.html`, scripts comerciais e Vite: entrada demonstrativa separada, com os mesmos módulos da aplicação.
- `src/consumer/TemplatePicker.tsx`/CSS: layouts e integração ao rascunho/publicação.
- `src/api.ts`, `src/consumer/api.ts`, Captcha e inicializações: transporte isolado exclusivamente no realm demonstrativo. Caminho operacional preservado por padrão.
- Workspace/Foundation/PeopleAccess/SelfService: pontos de integração com identidade, grants e cadastro existentes.
- `server/access-mail.mjs`: renderer opcional; comportamento original continua padrão.
- `server/unified.mjs`: inclusão das rotas comerciais/demonstrativas no mesmo processo e encerramento do pool.
- `package.json`/lockfile: pg passa a dependência de runtime, sem mudar versão/resolução/integridade; comandos locais adicionados.
- Migration 054: tabelas comerciais privadas e RPCs com RLS/FORCE, configuração, revisão e materialização idempotente. Nenhuma migration histórica editada.
- `tests/support`/testes de integridade/gate: autorização adicional 054 com predecessores e hashes; manifests históricos intactos. O teste negativo INT-I02 passou a copiar também a nova dependência para sua sandbox, mantendo a rejeição da adulteração histórica.
- Dois testes geradores de PDFs (049, utilitários e navegador): somente o destino de saída mudou para `reports/commercial-054/regenerated-049/documents`. As asserções permanecem iguais; os dois PDFs históricos não são mais sobrescritos por resultados reproduzíveis. Isso permite repetir a conferência integral da base sem restaurar manualmente evidências.
- Seis PNGs da marca: aplicação dos assets transparentes R2 já aprovados, sem redesenho.

O inventário exato de cada arquivo, hashes antes/depois e arquivos novos está em `INVENTARIO-SHA256.json` na raiz do pacote. Nenhum arquivo de `server/billing/`, `src/billing/`, `src/permissions/` ou das migrations anteriores faz parte das transições autorizadas.

## Integridade e dados

As 49 migrations originais foram comparadas byte a byte. A 054 é somente adicional e permanece não aplicada ao banco real. Os manifests históricos permanecem intactos, inclusive as proteções LF/CRLF anteriores. A nova camada aceita equivalência de finais de linha apenas nos textos explicitamente inventariados; mudanças de conteúdo, bytes binários e predecessores incorretos são recusados.

A criação técnica usa o cadastro original; não cria um segundo checkout nem contratos artificiais. O adaptador de demo reusa o motor operacional, limitando entradas e organização em cada sessão. A demonstração não disponibiliza funções externas reais. O editor de equipe fictícia provisiona somente identidades locais, sem enviar convites de Auth.

## Validação e pendências

Veja `RELATORIO-TESTES.md`, `MATRIZ-TESTES.md` e `HOMOLOGACAO-PENDENTE.md`. Build e testes locais não certificam interface no navegador, recebimento externo, infraestrutura ou concorrência nativa. A integração e publicação continuam condicionadas à homologação do proprietário. MP-01 e pendências externas anteriores permanecem abertas.

A arquitetura está implementada, mas a habilitação operacional exige ambiente separado, revisão de retenção, canais de contato e homologação. As flags seguem desligadas por padrão. O banco demonstrativo possui limites acumulados e não faz limpeza automática de organizações; a manutenção e o dimensionamento devem ser comprovados antes de disponibilização externa.
