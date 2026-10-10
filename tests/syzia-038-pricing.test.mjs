import assert from 'node:assert/strict';
import test from 'node:test';
import {priceBreakdown,relationIssue,selectedPrices,emptyItem} from '../src/consumer/request-items.ts';
import {brandStyle,contrast} from '../src/consumer/brand.ts';
test('Valores fixos, estimativas e consulta ficam separados, sem zero fabricado',()=>{
 assert.deepEqual(priceBreakdown([{price_mode:'fixed',price_cents:12000},{price_mode:'from',price_cents:23000},{price_mode:'quote',price_cents:null}]),{fixed:12000,estimate:23000,pending:1,fixedCount:1,estimateCount:1,expected:null});
 assert.equal(priceBreakdown([{price_mode:'fixed',price_cents:0}]).expected,0);
 assert.equal(priceBreakdown([{price_mode:'from',unit_cents:12000,quantity:2}]).estimate,24000);
 assert.equal(priceBreakdown([{price_mode:'fixed',unit_cents:null}]).pending,1);
});
test('A inclusão direcional/transitiva explica cobertura e não modifica a seleção',()=>{
 const company={services:[{code:'a',name:'Visita'},{code:'b',name:'Avaliação'},{code:'c',name:'Levantamento'}],relations:[{source:'a',target:'b',kind:'includes'},{source:'b',target:'c',kind:'includes'}]},selection=['a'];
 assert.match(relationIssue(company,selection,'c'),/Levantamento já está contemplado em Visita/);
 assert.match(relationIssue(company,['b'],'a'),/Remova Avaliação/);
 assert.deepEqual(selection,['a']);
 company.relations=[{source:'a',target:'b',kind:'incompatible'}];assert.match(relationIssue(company,['b'],'a'),/não pode ser combinado/);
 company.relations=[{source:'a',target:'b',kind:'review'}];assert.equal(relationIssue(company,['a'],'b'),'');
});
test('Adicionais selecionados só entram no serviço correto',()=>{
 const services=[{code:'a',price_mode:'fixed',price_cents:1000,addons:[{code:'aa',price_mode:'fixed',price_cents:200}]},{code:'b',price_mode:'quote',price_cents:null,addons:[{code:'bb',price_mode:'from',price_cents:300}]}];
 const items=[{...emptyItem('a'),addons:['aa','bb']},{...emptyItem('b'),addons:['bb']}];assert.equal(selectedPrices(services,items).length,4);assert.equal(selectedPrices(services,items).filter(x=>x.code==='bb').length,1);
});
test('Tokens de ambas as aparências preservam contraste neutro, CTA e foco em marcas extremas',()=>{
 for(const theme of ['light','dark'])for(const color of ['#FFFFFF','#0B0B14','#E10909','#6C4DFF','#F2C94C']){
  const s=brandStyle(color,theme);assert.ok(contrast(s['--c-ink'],s['--c-surface'])>=4.5);assert.ok(contrast(s['--c-muted'],s['--c-surface'])>=4.5);assert.ok(contrast(s['--brand-on'],s['--brand'])>=4.5);assert.ok(contrast(s['--brand-focus'],s['--c-surface'])>=3);assert.ok(contrast(s['--brand-link'],s['--brand-soft'])>=4.5);
 }
});
