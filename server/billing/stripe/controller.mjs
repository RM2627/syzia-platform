import { createHash } from 'node:crypto';
import { API_VERSION, OFFERS, ensure, ref, idOK } from './policy.mjs';
import { contract, metadata, sessionBinding, snapshot } from './snapshot.mjs';
import { verifyWebhook } from './gateway.mjs';
import { exactBody } from '../subscriptions.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const EVENTS=new Set(['checkout.session.completed','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.trial_will_end','customer.subscription.paused','customer.subscription.resumed','invoice.paid','invoice.payment_succeeded','invoice.payment_failed','invoice.payment_action_required','invoice.finalization_failed']);
export function stripeController({gateway:g,service,asUser,auth,mode='disabled'}) {
  const cfg=g.cfg;
  const sql=(action,id=null,data={})=>service('billing069_service',{p_action:action,p_id:id,p_data:{...data,environment:cfg.environment,account_id:cfg.account}});
  async function authorize(token){
    const actor=await auth(token);ensure(actor?.id&&!actor.is_anonymous,'access_denied',403);
    await asUser(token,'access_session',{p_activity:false,p_logout:false});return actor;
  }
  const view=(token,org)=>asUser(token,'billing069_context',{p_org:org});
  async function process(id,{create=false,catalogVerified=false}={}){
    let row=await sql('lease',id);if(!row)return {pending:true};
    const lease=row.lease;
    try{
      let c=contract(row);
      ensure(c.account_id===cfg.account&&c.product_id===cfg.product&&c.api_version===API_VERSION&&c.price_id===cfg.prices[c.offer?.code],'contract_scope_mismatch');
      if(!catalogVerified)await g.catalog();
      if(!c.session){
        if(!create){await sql('release',id,{lease});return {pending:true};}
        ensure(mode==='stripe'&&cfg.operationsEnabled,'checkout_disabled',503);
        // Do not resend an uncertain creation. Recovery is by official resource reads.
        // The persisted idempotency key remains stable even if the process crashes.
        ensure(!c.create_started,'reconciliation_required',503);
        row=await sql('start',id,{lease});c=contract(row);
        if(!c.customer){
          const customer=await g.customer(c);metadata(g,customer,c);ensure(/^cus_[A-Za-z0-9]+$/.test(customer.id),'customer_mismatch');
          await sql('customer',id,{lease,customer_id:customer.id});c.customer=customer.id;
        }
        const session=await g.checkout(c);sessionBinding(g,session,c);
        const url=new URL(session.url);
        ensure(url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&!url.username&&!url.password&&url.port===''&&session.status==='open'&&Number.isSafeInteger(session.expires_at),'session_mismatch');
        await sql('session',id,{lease,session_id:session.id,url:session.url,expires_at:new Date(session.expires_at*1000).toISOString(),status:session.status});
        c.session=session.id;
      }
      // Read-only confirmation also runs while new sales are disabled.
      let checked=await snapshot(g,c);
      if(checked.pending){
        await sql('session',id,{lease,session_id:c.session,url:checked.session.status==='open'?checked.session.url:null,expires_at:new Date(checked.session.expires_at*1000).toISOString(),status:checked.session.status});
        await sql('release',id,{lease});return {pending:true};
      }
      if(!c.subscription){await sql('bind',id,{lease,provider_id:checked.sub.id});c.subscription=checked.sub.id;}
      if(['cancel','resume'].includes(c.operation)&&c.operation_state!=='done'){
        ensure(cfg.operationsEnabled,'operations_disabled');
        const desired=c.operation==='cancel';
        ensure(!['canceled','incomplete_expired'].includes(checked.sub.status),'transition_invalid');
        if(checked.sub.cancel_at_period_end!==desired){
          // Same immutable command key; pending commands cannot be replaced by another tab.
          ensure(Date.now()-Date.parse(c.operation_requested_at)<23*3600000,'operation_review_required');
          await g.cancellation(c.subscription,desired,`${id}:${c.operation_id}`);
          checked=await snapshot(g,c);
          ensure(checked.sub.cancel_at_period_end===desired,'operation_uncertain');
        }
      }
      return await sql('apply',id,{...checked.financial,lease,source:'stripe_official_read'});
    }catch(e){
      await sql('error',id,{lease,code:/^billing_[a-z_]{1,70}$/.test(e?.code||'')?e.code:'billing_stripe_reconciliation_required'}).catch(()=>{});
      throw e;
    }
  }
  async function user(path,body,token){
    await authorize(token);
    if(path==='status'){
      exactBody(body,['organization_id']);ensure(UUID.test(body.organization_id),'payload_invalid',400);
      let v=await view(token,body.organization_id);
      if(v.subscription?.id){await process(v.subscription.id).catch(()=>{});v=await view(token,body.organization_id);}
      return v;
    }
    exactBody(body,['organization_id','action','request_key'],['offer','trial_expected','accepted']);
    ensure(UUID.test(body.organization_id)&&UUID.test(body.request_key),'payload_invalid',400);
    let id;
    if(body.action==='checkout'){
      ensure(mode==='stripe'&&cfg.operationsEnabled,'checkout_disabled',503);
      ensure(Object.hasOwn(OFFERS,body.offer||'')&&typeof body.trial_expected==='boolean'&&body.accepted===true,'payload_invalid',400);
      // Permission check precedes provider reads; the SQL RPC freezes the selected mapping.
      const v=await view(token,body.organization_id);ensure(v.checkout_mode===mode&&v.confirmation_enabled&&v.test_allowed,'checkout_disabled',503);ensure(v.environment===cfg.environment,'configuration_mismatch');
      await g.catalog();
      id=await asUser(token,'billing069_prepare',{p_org:body.organization_id,p_offer:body.offer,p_key:body.request_key,p_trial:body.trial_expected,p_accepted:body.accepted});
    }else{
      ensure(['cancel','resume'].includes(body.action)&&!('offer'in body)&&!('trial_expected'in body)&&!('accepted'in body),'payload_invalid',400);
      id=await asUser(token,'billing069_command',{p_org:body.organization_id,p_action:body.action,p_key:body.request_key});
    }
    await process(id,{create:body.action==='checkout',catalogVerified:body.action==='checkout'});
    return view(token,body.organization_id);
  }
  async function webhook(raw,headers){
    const e=verifyWebhook(raw,headers['stripe-signature'],cfg.webhookSecret,Math.floor(Date.now()/1000),cfg.livemode);
    if(!EVENTS.has(e.type))return {accepted:true,ignored:true};
    ensure(!e.account||e.account===cfg.account,'webhook_account_mismatch',400);
    const obj=e.data.object,hint=obj.metadata?.syzia_contract,resource=ref(obj.parent?.subscription_details?.subscription)||ref(obj.subscription);
    // Persist a bounded, sanitized envelope, never the raw event/customer/body.
    await sql('receive',null,{event_id:e.id,kind:e.type,object_id:obj.id,contract_hint:UUID.test(hint||'')?hint:null,resource_hint:idOK(resource)?resource:null,digest:createHash('sha256').update(raw).digest('hex')});
    return {accepted:true,reconciliation_pending:true};
  }
  async function reconcile(){
    let succeeded=0,pending=0;const ids=await sql('list');
    for(const id of ids){try{const r=await process(id);r.pending?pending++:succeeded++;}catch{pending++;}}
    for(const e of await sql('inbox')){
      try{
        let row=await sql('lookup',null,{resource_id:e.object_id});
        if(!row&&e.contract_hint)row=await sql('lookup',null,{resource_id:e.contract_hint});
        if(!row&&e.resource_hint)row=await sql('lookup',null,{resource_id:e.resource_hint});
        if(!row){await sql('event_unbound',null,{event_id:e.event_id});continue;}
        const c=contract(row);
        const resource=e.kind.startsWith('checkout.')?await g.session(e.object_id):e.kind.startsWith('customer.subscription.')?await g.subscription(e.object_id):await g.invoice(e.object_id);
        ensure(resource.id===e.object_id&&resource.livemode===cfg.livemode&&ref(resource.customer)===c.customer,'webhook_resource_mismatch');
        if(e.kind.startsWith('checkout.')){
          sessionBinding(g,resource,c);
          // Checkout may have been created before its HTTP response was lost.
          // A signed event is only a hint; bind solely after this official GET.
          if(!c.session){
            const leased=await sql('lease',c.id);if(!leased){pending++;continue;}
            try{
              ensure(!leased.session_id&&leased.create_started&&leased.customer_id===ref(resource.customer),'session_mismatch');
              await sql('session',c.id,{lease:leased.lease,session_id:resource.id,url:null,expires_at:new Date(resource.expires_at*1000).toISOString(),status:resource.status});
              c.session=resource.id;
            }finally{await sql('release',c.id,{lease:leased.lease});}
          }
        }
        else if(e.kind.startsWith('customer.subscription.')){metadata(g,resource,c);ensure(!c.subscription||resource.id===c.subscription,'webhook_resource_mismatch');}
        const sid=e.kind.startsWith('invoice.')?ref(resource.parent?.subscription_details?.subscription):e.kind.startsWith('customer.subscription.')?resource.id:ref(resource.subscription);
        const session=await g.session(c.session);sessionBinding(g,session,c);
        ensure(!sid||ref(session.subscription)===sid,'webhook_resource_mismatch');
        const r=await process(c.id);if(!r.pending)await sql('event_done',null,{event_id:e.event_id});
      }catch{pending++;}
    }
    return {inspected:ids.length,succeeded,pending};
  }
  return {user,webhook,reconcile,process};
}
