# SYZIA Insights — guia do editor

Após aplicação e homologação pelo proprietário, habilitar `INSIGHTS_ENABLED` no servidor e `VITE_INSIGHTS_ENABLED` no build. Acesse `/admin/insights` com a conta administrativa existente. O Super Admin pode editar; outros editores precisam de concessão explícita pela RPC `insights_editor('grant', {user_id, enabled})`, executada na sessão do Super Admin. Não conceder papel global nem expor service_role. Assinantes comuns não têm acesso. A interface de gestão de concessões continua nas ferramentas administrativas existentes; não há cadastro público de editor.

1. Em **Artigos**, crie um rascunho. Escolha categoria, autor e tags cadastrados. Título, resumo e pelo menos um bloco são obrigatórios. O endereço aceita letras minúsculas, números e hífens.
2. Adicione parágrafos, títulos H2/H3, listas, links, imagens, citações, tabelas, informações e CTA. Tabelas usam uma linha por registro e `|` entre colunas. Negrito/itálico se aplicam ao bloco. Não cole HTML executável.
3. O rascunho salva automaticamente após uma pausa e permite salvar explicitamente. Aguarde **Salvo** antes de sair. Se outra pessoa salvar primeiro, a versão antiga será recusada e o texto continuará na tela; copie suas alterações e reabra a versão atual para conciliá-las.
4. **Prévia privada** mostra o conteúdo sem publicar. Não existe URL pública de rascunho. A publicação anterior continua independente enquanto se edita.
5. Em **Biblioteca de mídia**, consulte as imagens; nos campos de capa e imagem do editor, selecione uma delas pela descrição. Uploads são feitos no editor com alt text. Imagens em uso em rascunhos, publicações ou revisões não podem ser excluídas. Isso preserva restauração histórica.
6. Revise título/descrição SEO, imagens, links e textos. **Publicar versão revisada** publica o snapshot atual. Alterações posteriores não vão automaticamente ao ar. Alterar slug publicado gera redirecionamento 301, sujeito à exclusividade do endereço.
7. **Agendar** usa o fuso indicado pelo navegador e envia instante UTC. O servidor publica mesmo sem a página aberta, desde que a instância esteja ativa. Erros ficam visíveis e são reprocessados; corrija o conteúdo/conflito e reagende para reiniciar o ciclo.
8. **Retirar do ar** preserva rascunho e versões. **Arquivar** tira do catálogo e guarda histórico. **Restaurar** cria uma nova revisão; não apaga versões anteriores.

Os cinco artigos estão em `content/insights/drafts-061.json`, completos, originais e não publicados. O importador lista conteúdo offline por padrão. Somente após autorização, configure o JWT de um editor no ambiente privado e execute `npm run insights:import-drafts -- --import-drafts-confirmed`. Consulte os nomes das variáveis no próprio script antes de executar. Não coloque tokens em argumentos, logs ou Git. O importador não publica e ignora slugs já existentes.

Os artigos precisam de revisão editorial e escolha de capas reais autorizadas antes de publicação. A logomarca usada é o asset oficial existente, sem redesenho.

Indicadores permitem período e categoria. Curtidas atuais são estoque, visualizações são eventos deduplicados, visitantes são estimativas e compartilhamentos são intenções. A conversão observada mostra numerador e denominador de navegadores medidos; não equivale a taxa de contratação. Não há dados do Google Search Console antes de sua configuração externa.
