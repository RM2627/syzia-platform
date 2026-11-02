import { readFile, readdir } from 'node:fs/promises';
import { fixture as current } from '../syzia-061/fixture.mjs';
import { StripeGateway } from '../../server/billing/stripe/gateway.mjs';
import { stripeController } from '../../server/billing/stripe/controller.mjs';
import { API_VERSION, OFFERS, addMonths } from '../../server/billing/stripe/policy.mjs';
export async function fixture({existingMP=false}={}){
 const c=await current();
 let priorMP=null;
 if(existingMP){await c.command();priorMP=(await c.rawSQL('select to_jsonb(c) value from private.billing047_contracts c where organization_id=$1',[c.orgs.A])).rows[0].value;}
 for(const name of (await readdir('supabase/migrations')).filter(x=>/00(64|65|66|67|68|69)_/.test(x)).sort()){
  try{await c.db.exec(await readFile('supabase/migrations/'+name,'utf8'));}catch(e){await c.db.close();throw new Error(name+': '+e.message+' at '+e.position);}
 }
 const cfg={transport:'online',environment:'test',livemode:false,apiVersion:API_VERSION,account:'acct_fixture',product:'prod_fixture',prices:{monthly:'price_monthly',semiannual:'price_semiannual',annual:'price_annual'},key:'sk_test_'+'x'.repeat(24),webhookSecret:'whsec_'+'x'.repeat(24),operationsEnabled:true,origin:'https://app.example.invalid'};
 const calls=[],objects=new Map(),idem=new Map();let serial=0,failNext=null;
 const price=code=>({id:cfg.prices[code],object:'price',livemode:false,active:true,product:cfg.product,currency:'brl',unit_amount:OFFERS[code].amount,type:'recurring',recurring:{interval:'month',interval_count:OFFERS[code].months,usage_type:'licensed'},billing_scheme:'per_unit'});
 const fetchImpl=async(url,init)=>{
  const path=new URL(url).pathname.replace('/v1',''),params=new URLSearchParams(init.body),key=init.headers['Idempotency-Key'];
  calls.push({path,method:init.method,key,body:Object.fromEntries(params)});
  const failure=failNext&&(!failNext.path||failNext.path===path)?failNext:null;
  if(failure)failNext=null;
  if(failure&&!failure.after){if(failure==='network')throw new Error('SECRET_PROVIDER_DETAIL');return new Response('{}',{status:failure});}
  if(init.method==='POST'&&idem.has(key))return Response.json(idem.get(key));
  let value;
  const meta=()=>Object.fromEntries([...params].filter(([k])=>/^metadata\[/.test(k)).map(([k,v])=>[k.slice(9,-1),v]));
  if(path==='/account')value={id:cfg.account};
  else if(path==='/products/'+cfg.product)value={id:cfg.product,active:true,livemode:false};
  else if(path.startsWith('/prices/'))value=price(Object.keys(OFFERS).find(k=>cfg.prices[k]===path.split('/').at(-1)));
  else if(path==='/customers'&&init.method==='POST')value={id:'cus_'+(++serial),livemode:false,metadata:meta()};
  else if(path==='/checkout/sessions'&&init.method==='POST')value={id:'cs_test_'+(++serial),livemode:false,metadata:meta(),mode:params.get('mode'),customer:params.get('customer'),client_reference_id:params.get('client_reference_id'),payment_method_collection:params.get('payment_method_collection'),payment_method_types:['card'],status:'open',url:'https://checkout.stripe.com/c/pay/fixture',expires_at:Number(params.get('expires_at')),subscription:null};
  else if(path==='/invoices')value={data:[...objects.values()].filter(x=>x.object==='invoice'&&x.parent.subscription_details.subscription===new URL(url).searchParams.get('subscription')),has_more:false};
  else {value=objects.get(path.split('/').at(-1));if(init.method==='POST'&&path.startsWith('/subscriptions/')){value={...value,cancel_at_period_end:params.get('cancel_at_period_end')==='true'};}}
  if(!value)return new Response('{}',{status:404});
  if(value.id)objects.set(value.id,value);if(init.method==='POST')idem.set(key,value);
  if(failure?.after)throw new Error('SIMULATED_RESPONSE_LOST');
  return Response.json(value,{headers:{'stripe-version':API_VERSION}});
 };
 const gateway=new StripeGateway(cfg,fetchImpl);
 const engine=stripeController({gateway,service:c.service,asUser:c.asUser,auth:async k=>c.users[k]?{id:c.users[k]}:null,mode:'stripe'});
 const entries=Object.keys(OFFERS).map(code=>({code,account_id:cfg.account,product_id:cfg.product,price_id:cfg.prices[code]}));
 const configure=(mode='stripe',enabled=true,orgs=Object.values(c.orgs))=>c.service('billing069_configure',{p_mode:mode,p_environment:'test',p_confirmation:enabled,p_test_orgs:orgs,p_entries:entries});
 const sql=(action,id=null,data={})=>c.service('billing069_service',{p_action:action,p_id:id,p_data:{environment:cfg.environment,account_id:cfg.account,...data}});
 const view=(role='adminA')=>c.asUser(role,'billing069_context',{p_org:c.orgs[role==='adminB'?'B':'A']});
 async function complete(id,{paid=false,trial=true}={}){
  const row=await sql('get',id),now=Math.floor(Date.now()/1000),offer=OFFERS[row.offer];
  const session=objects.get(row.session_id)||[...objects.values()].find(x=>x.client_reference_id===id),sid='sub_'+(++serial),item='si_'+serial;
  const raw=JSON.parse(await readFile('tests/stripe-online/endive.json','utf8'));
  const sub={...raw.subscription,id:sid,customer:row.customer_id,metadata:session.metadata,status:paid?'active':trial?'trialing':'incomplete',trial_start:trial?(paid?now-604800:now):null,trial_end:trial?(paid?now:now+604800):null,billing_cycle_anchor:now,
   default_payment_method:{id:'pm_'+serial,type:'card',customer:row.customer_id,livemode:false},items:{has_more:false,data:[{...raw.subscription.items.data[0],id:item,price:price(row.offer),current_period_start:now,current_period_end:trial&&!paid?now+604800:addMonths(now,offer.months)}]}};
  objects.set(sid,sub);objects.set(session.id,{...session,status:'complete',subscription:sid});
  if(paid){const inv=raw.invoice;inv.id='in_'+serial;inv.customer=row.customer_id;inv.created=now;inv.total=inv.amount_paid=offer.amount;inv.parent.subscription_details.subscription=sid;
   const l=inv.lines.data[0];l.amount=offer.amount;l.period={start:now,end:addMonths(now,offer.months)};l.parent.subscription_item_details={subscription:sid,subscription_item:item,proration:false};l.pricing.price_details={price:row.price_id,product:cfg.product};objects.set(inv.id,inv);}
  return sub;
 }
 return {...c,priorMP,cfg,gateway,engine,calls,objects,configure,sql,onlineView:view,complete,fail:value=>{failNext=value;}};
}
