# VIRELOQ — Onde caminhos se conectam.

Identidade baseada em caminhos que se encontram. Sem referências astronômicas. O símbolo sugere V e conexão; o nome da organização cliente permanece protagonista da página pública.

- `VIRELOQ-Identidade-Visual.html`: apresentação autossuficiente, imagens incorporadas, sem rede.
- `VIRELOQ-Identidade-Visual.png`: brand board em composição única.
- `../public/brand/`: logos vetoriais claro/escuro, símbolo colorido/monocromático/branco, aplicativo e PNGs 16/32/180/512.
- `../src/brand/platform.ts`: fonte central da identidade institucional.
- `../src/brand/vireloq.css`: aplicação aos espaços institucionais, sem substituir identidade pública do cliente.

Paleta: azul-noturno #141B3A; roxo #5533A8; violeta #7047EB; lilás #BCA9F5; neutro #F6F5FA; branco #FFFFFF.

Logotipo com contornos vetoriais derivados de DejaVu Sans, sem dependência de fontes externas. Interface: sans-serif nativa (system-ui/Segoe UI e alternativas). Não requer download de fonte. Slogan em corpo menor. Preservar proporções, área livre de pelo menos 1/4 da altura do símbolo; usar símbolo sem nome abaixo de 110px de largura total. PNG 16/32 para favicon; 180/512 para atalho/app.

Não distorcer, adicionar efeitos tridimensionais, substituir cores por neon, usar cenários espaciais ou aplicar logo do SaaS como identidade da empresa cliente. Telas do board são capturas locais da demo, não publicação nem prova de homologação externa. A aprovação estética final pertence ao proprietário.

Reprodução: `python3 scripts/build-brand-assets.py` (fontTools + DejaVu Sans local) e `FOUNDATION_CHROMIUM_PATH=... node scripts/build-brand-board.mjs` após as capturas de interface em `reports/vireloq`. Os arquivos prontos acompanham a entrega; o build normal do produto não depende dessas ferramentas.
