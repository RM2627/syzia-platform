# SYZIA 034 — relatório técnico de entrega

**Resultado:** rodada implementada sobre a base consolidada 033, com entrega manual de credenciais, enquadramento pelo fluxo privado existente e enriquecimento da landing aprovada. **Sem migration nova, reset, deploy ou produção.**

Base verificada: 1.424 arquivos conferidos com o manifesto 033 antes da cópia de trabalho. Solicitação integral: `docs/syzia-034/request.md`. Decisões detalhadas: `diagnostico-e-decisoes.md`. Instruções para o proprietário: `guia-upgrade.md`.

## 1. Entrega manual de credenciais

Após finalizar Auth e o provisionamento, Pessoas e acessos/Nova pessoa e a criação empresarial mostram **Pessoa criada com sucesso**, nome, usuário, código temporário, validade e link de primeiro acesso. Há três ações independentes: **Copiar instruções de acesso**, **Copiar código**, **Copiar link**. O operador escolhe o canal; criação/retomada/geração de novo código não acionam SMTP.

O link abre a ativação existente com usuário e contexto preenchidos. Não contém o segredo temporário. Para a pessoa sem vínculo, a mensagem não inventa empresa ou código empresarial; utiliza o contexto pessoal SYZIA já existente. A orientação explica como definir senha pessoal.

## 2. Exposição e reemissão

O texto puro existe apenas no retorno da emissão e na memória da tela. Fechar/recarregar não permite recuperar códigos antigos. Perda/expiração usa **Gerar novo código de primeiro acesso**, com invalidação do anterior e sem duplicar identidade, Auth, vínculo, organização, trial ou papel. Para acesso já ativo, **Redefinir acesso** mantém a regra de encerramento das sessões.

A rota histórica de reenvio por e-mail é mantida para compatibilidade, protegida pelas mesmas autorizações. Não é o fluxo atual da interface nem um requisito de provisionamento.

## 3. Provisionamento incompleto

Falhas de consulta/criação do Auth ou da finalização não retornam um código utilizável. A reserva reaparece para **Retomar provisionamento**. A retomada reutiliza o ID reservado e finaliza antes de mostrar instruções. A lista é atualizada também após a falha, dispensando a recarga manual para encontrar a reserva.

Casos cobertos no banco local: pessoa sem empresa e usuário empresarial, três pontos de falha, retomada, reemissão, expiração, invalidação, ativação e ausência de duplicações. O navegador percorreu falha de Auth → reserva → retomada → cópias → reemissão → senha → ambiente.

## 4. Logo

O cabeçalho deixou de tratar a logo empresarial como avatar. A imagem usa proporção natural e `contain`, sem círculo, borda de avatar ou corte. Logos horizontais, quadradas e verticais foram verificadas com arquivos fictícios, publicação, recarga e tamanhos de tela. A marca institucional SYZIA não foi redesenhada.

## 5. Capa e enquadramento

Recomendação visível: **1600×1200, 4:3**, JPEG/PNG/WebP até 5 MB. Outras proporções são aceitas. **Ajustar enquadramento** permite arrastar, zoom, posição horizontal/vertical, centralizar, salvar e cancelar. A área corresponde à proporção pública em desktop e celular.

A nova imagem passa pelo mesmo upload privado e pela sanitização do gateway. Salvar o recorte atualiza o formulário; a publicação continua exigindo salvar rascunho, revisar e publicar. Erros/cancelamento preservam a referência anterior. A comparação automatizada entre bytes da capa na prévia e na publicação confirmou o mesmo arquivo.

Limitação explícita: o recorte salvo vira uma variante; para recuperar áreas fora dela, é preciso reenviar o original. Não se promete edição não destrutiva com recuperação ilimitada.

## 6. Imagem de serviço

Área **3:2**, recomendação **1200×800**, sem esticar; mesma geometria na edição, card e publicação. Fallback sem foto também ocupa a área do card. O enquadramento utiliza a mesma janela com proporção própria. Upload, ajuste, salvamento, recarga e publicação foram exercitados.

## 7. Portfólio

Foto única preserva a composição integral. Antes/depois usa duas áreas equivalentes e imagens inteiras, com orientação para fotos comparáveis. Galeria utiliza miniaturas consistentes e conserva a ampliação integral, navegação e retorno de foco existentes. Rascunho e página pública usam as regras correspondentes a cada formato.

Os três formatos foram criados, salvos, publicados e inspecionados em desktop/celular, incluindo ampliação e navegação da galeria. Dados e imagens de teste são fictícios; não representam resultados de clientes reais.

## 8. Readiness do gateway

Diagnóstico registrado: a URL local estava correta e o gateway não havia sido iniciado. O funcionamento voltou ao executar `npm.cmd run attachments:dev`. Não foi identificado, a partir desse episódio, defeito comprovado no Storage.

O guia mostra os três processos necessários. `npm run diagnose:034` verifica `/health` somente em loopback, sem segredos ou chamada ao Supabase. Diferencia processo pronto, gateway indisponível, origem negada e resposta inesperada. A interface informa **Gateway de mídia indisponível** e preserva a imagem anterior em falha de conexão.

## 9. Enriquecimento da landing

Preservados hero, direção escura/violeta, marca, hierarquia, navegação, cards e CTAs. Foram incluídos:

- problema cotidiano e os pilares de ferramentas conectadas, pendências e controle;
- timeline ilustrativa de um dia, sem prometer automações;
- operação individual, equipe e apoio condicionado ao plano/autorizações;
- destaque da página pública com captura da interface atual e dados fictícios;
- financeiro distinguindo previsto, recebido, despesa e aprovação;
- controle de acessos em linguagem comercial e FAQ;
- avaliação dependente das ofertas reais da consulta de planos, sem dias fixos;
- estados distintos para ausência de planos e falha na consulta.

Não foram acrescentados benefícios garantidos, alegações de homologação externa, contabilidade, receita inventada ou SLA ilimitado. Cadastro self-service, contato e planos continuam usando a infraestrutura 033.

## 10. Testes e evidências

**59 testes/cenários únicos aprovados; zero falhas finais, zero ignorados.** Sem repetição da auditoria mestre.

| Grupo | Quantidade | Evidência |
|---|---:|---|
| Banco local + fluxo de provisionamento, hashes, retomada, identidade e isolamento | 8 | `reports/syzia-034/sql.json`, `sql.log` |
| Backend de acesso/provisionamento, SMTP opcional histórico, adaptador privado de mídia e diagnóstico seguro | 38 | `reports/syzia-034/backend.log` |
| Geometria de recorte, mensagem/link pessoal e readiness | 4 | `reports/syzia-034/utils.log` |
| Jornadas reais da interface com Auth/Storage locais simulados | 9 | `reports/syzia-034/browser.json`, `browser.log` |
| Typecheck, build e inspeção do bundle por marcador exclusivo do servidor | PASS | `release-build.txt`, `release-bundle-scan.json` |

Navegador: credenciais nos dois contextos; logos, capa, serviço e portfólio; preview/publicação/recarga; indisponibilidade do gateway; landing em 1440, 820 e 390 px; FAQ, teclado e ausência de overflow; planos vazios/publicados/indisponíveis; contato; cadastro self-service até onboarding existente.

Acessibilidade básica: labels existentes, botões separados, feedback de cópia, sliders por teclado, diálogo nativo com foco/Escape, FAQ com `details/summary`, navegação e ampliação do portfólio. Não se declara auditoria completa WCAG.

Desempenho local: captura demonstrativa WebP com cerca de 64 KB, carregamento tardio e dimensões reservadas; landing sem dependência visual adicional. O chunk de `PublicSite` ficou próximo de 18,54 KB (5,82 KB gzip). Medições do navegador Vite estão em `browser-performance.json`; não equivalem a performance em produção ou métricas de rede externa.

Durante a validação foram corrigidos a atualização das reservas após falha, os tamanhos do enquadramento e a remoção dos estilos residuais de avatar. Os testes foram ajustados para respeitar a revisão obrigatória antes de publicar, usar os seletores corretos e reconhecer o código HTTP já adotado para credencial inválida. O portfólio foi comparado após reabrir a prévia, que o fluxo existente fecha ao publicar. Relatórios intermediários `browser-initial.*` e `browser-review.*` preservam as falhas de desenvolvimento, sem confundi-las com o resultado final.

O inventário final registra arquivos alterados, evidências e hashes das migrations: `reports/syzia-034/release-inventory.json`. O ZIP contém `MANIFEST.json`, com hashes de todos os arquivos empacotados.

## 11. Migrations e preservação

**Migrations 001–033 byte-identical. Nenhuma migration 034.** Enquadramento persistido pela variante já suportada no modelo de mídia. Storage SQL, regras de autorização e assets institucionais anteriores preservados. Lockfile sem novas dependências.

Usuário empresarial continua restrito às organizações autorizadas. O teste negativo recusou provisionamento/reemissão em outro tenant e criação global por administrador empresarial. Nenhum membership artificial foi usado. Onboarding, módulos, trial/billing e fluxos da 033 foram reutilizados.

## 12. Limitações e pendências externas

Validação executada **localmente**, com PGlite e Auth/Storage de teste. Permanecem pendentes: Supabase/Auth/PostgREST/Storage reais, configuração e rede/CORS do ambiente do proprietário, homologação em dispositivos físicos, concorrência externa e eventual SMTP opcional. Nenhuma cobrança, envio real, serviço pago ou integração de produção foi acionada.

A entrega inclui o projeto completo e portátil, com histórico, migrations, fontes, assets, fixtures, testes, configurações de exemplo, scripts, documentos e evidências. Dependências instaladas, executável do navegador, segredos e diretórios transitórios ficam fora do ZIP.

**Parada para homologação do proprietário. Não iniciar nova fase, deploy, reset ou produção.**
