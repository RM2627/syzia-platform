import { StripeGateway } from './gateway.mjs';
import { stripeEnvironment, ensure } from './policy.mjs';
import { stripeController } from './controller.mjs';
import { exactBody } from '../subscriptions.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function onlineBilling({env,mp,service,asUser,auth,fetchImpl}){
  const mode=env.BILLING_CHECKOUT_MODE||'disabled';
  ensure(['disabled','internal','stripe'].includes(mode),'checkout_configuration_invalid',503);
  ensure(!env.STRIPE_ENABLED||['true','false'].includes(env.STRIPE_ENABLED),'configuration_invalid',503);
  let stripe=null,gateway=null;
  if(env.STRIPE_ENABLED==='true'){
    const cfg=stripeEnvironment(env,env.STRIPE_ENVIRONMENT||'test');
    if(cfg.environment==='production')ensure(env.STRIPE_PRODUCTION_CONFIRMED==='true','production_not_authorized',503);
    const origin=new URL(env.PLATFORM_APP_ORIGIN);
    ensure(origin.protocol==='https:'||(['localhost','127.0.0.1'].includes(origin.hostname)&&origin.protocol==='http:'),'origin_invalid');
    Object.assign(cfg,{origin:origin.origin,transport:'online',productionAuthorized:cfg.environment==='production'&&env.STRIPE_PRODUCTION_CONFIRMED==='true',operationsEnabled:env.STRIPE_OPERATIONS_ENABLED==='true'});
    gateway=new StripeGateway(cfg,fetchImpl);stripe=stripeController({gateway,service,asUser,auth,mode});
  }
  ensure(mode!=='stripe'||stripe&&gateway.cfg.operationsEnabled,'checkout_configuration_invalid',503);
  const authorize=async token=>{const actor=await auth(token);ensure(actor?.id&&!actor.is_anonymous,'access_denied',403);await asUser(token,'access_session',{p_activity:false,p_logout:false});};
  const catalogView = rows => (Array.isArray(rows)?rows:[]).map(offer=>({...offer,checkout_available:offer.checkout_available===true&&mode==='stripe'&&!!gateway?.cfg.operationsEnabled}));
  return {
    ...mp,
    async user(path,body,token){
      if(path==='catalog'){
        exactBody(body,[]);
        return catalogView(await service('acquisition_plans',{}));
      }
      if(path==='checkout'){
        exactBody(body,['organization_id']);ensure(UUID.test(body.organization_id),'payload_invalid',400);await authorize(token);
        const result=await asUser(token,'billing069_context',{p_org:body.organization_id});
        // Existing contracts are selected by persisted provider, never by a browser flag.
        return {...result,catalog:catalogView(result.catalog),checkout_mode:result.checkout_mode===mode?mode:'disabled',stripe_available:!!stripe};
      }
      if(path==='stripe/preflight'){
        exactBody(body,[]);await authorize(token);
        const db=await asUser(token,'billing069_preflight',{});ensure(gateway,'disabled',503);
        await gateway.catalog();
        const mappingMatches=db.environment===gateway.cfg.environment&&db.mappings?.length===3&&db.mappings.every(m=>m.account_id===gateway.cfg.account&&m.product_id===gateway.cfg.product&&m.price_id===gateway.cfg.prices[m.code]);
        return {provider:'stripe',environment:gateway.cfg.environment,api_version:gateway.cfg.apiVersion,catalog_verified:true,database_mapping_verified:!!mappingMatches,financial_writes:false,checkout_mode:mode};
      }
      if(path==='stripe/status'||path==='stripe/command'){ensure(stripe,'disabled',503);return stripe.user(path.split('/')[1],body,token);}
      if(!stripe&&env.MERCADO_PAGO_ENABLED!=='true')return mp.user(path,body,token);
      if(path==='command'&&body?.action==='checkout')ensure(mode==='internal','checkout_disabled',503);
      return mp.user(path,body,token);
    },
    async stripeWebhook(raw,headers){ensure(stripe,'disabled',503);return stripe.webhook(raw,headers);},
    async reconcile(){
      if(!stripe&&env.MERCADO_PAGO_ENABLED!=='true')return mp.reconcile();
      const out={inspected:0,succeeded:0,pending:0};
      // Failure in one provider must not prevent reconciliation of the other.
      for(const run of [env.MERCADO_PAGO_ENABLED==='true'?()=>mp.reconcile():null,stripe?()=>stripe.reconcile():null].filter(Boolean)){
        try{const r=await run();for(const key of Object.keys(out))out[key]+=Number(r[key])||0;}catch{out.pending++;}
      }
      return out;
    },
  };
}
