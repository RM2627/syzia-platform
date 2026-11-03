import test from 'node:test';
import assert from 'node:assert/strict';
import {canStartCheckout, checkoutURL, confirmedDate, managementAction, money, subscriptionState} from '../../src/billing/subscription-view.ts';
const sub=extra=>({id:'local-contract',state:'active',offer:'monthly',access_until:'2030-12-09T12:00:00Z',pending:false,cancel_requested:false,...extra});
const context=extra=>({checkout_mode:'stripe',stripe_available:true,stripe_operations_available:true,confirmation_enabled:true,test_allowed:true,eligibility:'eligible',subscription:null,...extra});
test('display uses official totals; monthly equivalent never changes the billed amount',()=>{
 for(const [amount,months,total,equivalent]of[[5990,1,'59,90','59,90'],[29940,6,'299,40','49,90'],[47880,12,'478,80','39,90']]){
  assert.ok(money(amount).includes(total));assert.ok(money(amount/months).includes(equivalent));
 }
 assert.equal(confirmedDate(null),null);assert.equal(confirmedDate('unconfirmed'),null);assert.match(confirmedDate('2026-11-09T12:00:00Z'),/09.*nov.*2026/);
});
test('checkout requires every backend gate and no existing contract',()=>{
 assert.equal(canStartCheckout(context()),true);
 for(const extra of[{checkout_mode:'disabled'},{checkout_mode:'internal'},{stripe_available:false},{confirmation_enabled:false},{test_allowed:false},{eligibility:'verification_required'},{eligibility:'unknown'},{subscription:sub({})}])assert.equal(canStartCheckout(context(extra)),false);
 assert.equal(canStartCheckout(null),false);assert.equal(canStartCheckout(context({eligibility:'previous_grant'})),true);
});
test('management is conservative and never invents a change-modality command',()=>{
 assert.equal(managementAction(context({subscription:sub({})})), 'cancel');
 assert.equal(managementAction(context({subscription:sub({cancel_requested:true})}),Date.parse('2026-11-03')),'resume');
 for(const extra of[{state:'canceled'},{state:'unknown'},{pending:true},{cancel_requested:true,access_until:null},{cancel_requested:true,access_until:'2000-01-01'}])assert.equal(managementAction(context({subscription:sub(extra)})),null);
 assert.equal(managementAction(context({checkout_mode:'disabled',subscription:sub({})})),'cancel');
 assert.equal(managementAction(context({stripe_operations_available:false,subscription:sub({})})),null);
 assert.equal(managementAction(context({stripe_operations_available:undefined,subscription:sub({})})),null);
});
test('backend status determines labels; only explicit preparation/trial confirmation changes presentation',()=>{
 assert.equal(subscriptionState(null).title,'Sem assinatura');assert.equal(subscriptionState(null,true).title,'Cadastro preparado');
 assert.equal(subscriptionState(sub({state:'trialing',trial_end:'2026-11-09'})).title,'Trial confirmado');
 assert.equal(subscriptionState(sub({cancel_requested:true})).title,'Cancelamento programado');
 assert.equal(subscriptionState(sub({state:'payment_pending',checkout_url:'https://checkout.stripe.com/c/pay/test'})).title,'Checkout em andamento');
 assert.equal(subscriptionState(sub({state:'canceled'})).title,'Assinatura cancelada');assert.equal(subscriptionState(sub({state:'unknown'})).title,'Aguardando validação');
});
test('redirect is constrained to official HTTPS checkout and malformed URLs never throw',()=>{
 assert.equal(checkoutURL('https://checkout.stripe.com/c/pay/fixture'),'https://checkout.stripe.com/c/pay/fixture');
 for(const url of[null,'not-a-url','javascript:alert(1)','http://checkout.stripe.com/a','https://checkout.stripe.com.evil.invalid/a','https://user:password@checkout.stripe.com/a','https://checkout.stripe.com:8443/a'])assert.equal(checkoutURL(url),null);
});
