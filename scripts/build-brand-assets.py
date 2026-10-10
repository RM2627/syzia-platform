"""Rebuild outlined wordmark from local DejaVu Sans; no network or deployment."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
root=Path(__file__).resolve().parents[1]
font=TTFont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
glyphs=font.getGlyphSet(); cmap=font.getBestCmap(); em=font['head'].unitsPerEm
paths=[];x=0
for ch in 'VIRELOQ':
 name=cmap[ord(ch)];pen=SVGPathPen(glyphs);glyphs[name].draw(pen)
 paths.append(f'<path d="{pen.getCommands()}" transform="translate({x} 0)"/>')
 x+=font['hmtx'][name][0]+105
scale=37/em;total=x*scale
symbol=(root/'public/brand/vireloq-symbol.svg').read_text().split('viewBox="0 0 64 64">')[1].rsplit('</svg>',1)[0]
for variant,color in [('light','#141B3A'),('dark','#FFFFFF')]:
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {78+total:.1f} 64" role="img" aria-label="VIRELOQ">{symbol}<g fill="{color}" transform="translate(78 45) scale({scale} {-scale})">{"".join(paths)}</g></svg>'
 (root/f'public/brand/vireloq-horizontal-{variant}.svg').write_text(svg)
for color,name in [('#141B3A','monochrome'),('#FFFFFF','white')]:
 s=(root/'public/brand/vireloq-symbol.svg').read_text().replace('stroke="url(#v)"',f'stroke="{color}"').replace('stroke="#7047EB"',f'stroke="{color}"')
 (root/f'public/brand/vireloq-symbol-{name}.svg').write_text(s)
