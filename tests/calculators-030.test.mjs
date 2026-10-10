import{test}from'node:test';import assert from'node:assert/strict';import{simulate}from'../src/finance/calculators.ts';const base={cost:80,price:100,percent:20,goal:1000,days:20};
test('Preço usa margem sobre venda; custo 80 com margem20 sugere100',()=>assert.equal(simulate('price',base).value,100));
test('Resultado bruto e margem não se confundem com recebimento',()=>{const x=simulate('margin',base);assert.equal(x.value,20);assert.equal(x.margin,20)});
test('Desconto calcula preço e impacto na margem, incluindo prejuízo',()=>{const x=simulate('discount',{...base,percent:30});assert.equal(x.value,70);assert.equal(x.gross,-10);assert.ok(x.margin<0)});
test('Meta informa quantidade de serviços e opcionalmente por dia',()=>{const x=simulate('goal',{...base,price:170});assert.equal(x.value,6);assert.equal(x.perDay,1)});
test('Divisão por zero, percentuais inválidos e infinitos são recusados',()=>{for(const [kind,patch]of[['price',{percent:100}],['discount',{percent:101}],['margin',{price:0}],['goal',{days:0}],['price',{cost:Infinity}],['margin',{cost:-1}]])assert.throws(()=>simulate(kind,{...base,...patch}))});
