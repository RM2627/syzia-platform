// Provider reads -> existing financial ledger. No capabilities are granted here.
import { OFFERS, DAY, ensure, ref, idOK, addMonths } from './policy.mjs';
export function contract(row) {
  return { ...row, org: row.organization_id, offer: OFFERS[row.offer],
    customer: row.customer_id, session: row.session_id, subscription: row.provider_id,
    trial: row.trial_reserved, created: Math.floor(Date.parse(row.created_at)/1000),
    attemptCreated: Math.floor(Date.parse(row.attempt_at)/1000),
    binding: { apiVersion: row.api_version, environment: row.environment } };
}
export function metadata(g, obj, c) {
  ensure(obj?.livemode === g.cfg.livemode && Object.entries(g.metadata(c)).every(([k,v]) => obj.metadata?.[k] === v), 'identity_mismatch');
}
export function sessionBinding(g, session, c) {
  metadata(g,session,c);
  ensure(idOK(session.id) && (!c.session || session.id===c.session) && session.mode==='subscription' && session.client_reference_id===c.id && ref(session.customer)===c.customer && ['open','complete','expired'].includes(session.status), 'session_mismatch');
  ensure(session.payment_method_collection==='always' && session.payment_method_types?.length===1 && session.payment_method_types[0]==='card','card_collection_invalid');
}
const iso = seconds => Number.isSafeInteger(seconds) ? new Date(seconds*1000).toISOString() : null;
export async function snapshot(g, c, now=Math.floor(Date.now()/1000)) {
  ensure(c.api_version===g.cfg.apiVersion && c.environment===g.cfg.environment && c.account_id===g.cfg.account && c.product_id===g.cfg.product && c.price_id===g.cfg.prices[c.offer.code], 'contract_scope_mismatch');
  const customer=await g.getCustomer(c.customer);metadata(g,customer,c);
  ensure(customer.id===c.customer&&!customer.deleted,'customer_mismatch');
  const session=await g.session(c.session);sessionBinding(g,session,c);
  if(session.status!=='complete') {
    ensure(!c.subscription&&!session.subscription,'state_regression');
    return { session, pending: true };
  }
  const subId=ref(session.subscription);ensure(idOK(subId)&&(!c.subscription||c.subscription===subId),'subscription_mismatch');
  const sub=await g.subscription(subId);metadata(g,sub,c);
  ensure(sub.id===subId&&ref(sub.customer)===c.customer&&sub.collection_method==='charge_automatically'&&sub.currency==='brl','subscription_mismatch');
  ensure(sub.items?.data?.length===1&&!sub.items.has_more&&sub.items.data[0].quantity===1,'items_mismatch');
  const item=sub.items.data[0];g.price(item.price,c.offer);
  ensure(Number.isSafeInteger(item.current_period_start)&&Number.isSafeInteger(item.current_period_end)&&item.current_period_end>item.current_period_start,'period_invalid');
  ensure(['trialing','active','past_due','unpaid','canceled','paused','incomplete','incomplete_expired'].includes(sub.status),'status_invalid');
  const invoices=await g.invoices(sub.id),payments=[];
  if(invoices[0]){const fresh=await g.invoice(invoices[0].id);ensure(fresh.id===invoices[0].id,'invoice_mismatch');invoices[0]=fresh;}
  for(const inv of invoices){
    ensure(idOK(inv.id)&&inv.livemode===g.cfg.livemode&&ref(inv.customer)===c.customer&&inv.parent?.type==='subscription_details'&&ref(inv.parent.subscription_details?.subscription)===sub.id&&inv.currency==='brl','invoice_mismatch');
    ensure(inv.lines?.data?.length===1&&!inv.lines.has_more,'invoice_mismatch');
    const line=inv.lines.data[0], parent=line.parent?.subscription_item_details;
    ensure(line.quantity===1&&line.parent?.type==='subscription_item_details'&&parent?.proration===false&&ref(parent.subscription)===sub.id&&parent.subscription_item===item.id&&line.pricing?.type==='price_details'&&ref(line.pricing.price_details.price)===c.price_id&&ref(line.pricing.price_details.product)===c.product_id,'invoice_mismatch');
    ensure(Number.isSafeInteger(inv.created)&&inv.created<=now+300&&Number.isSafeInteger(line.period?.start)&&Number.isSafeInteger(line.period?.end)&&line.period.end>line.period.start,'invoice_mismatch');
    if(inv.total===0){ensure(c.trial&&inv.amount_paid===0,'unexpected_zero_invoice');continue;}
    ensure(inv.total===c.offer.amount&&line.amount===c.offer.amount,'invoice_amount_mismatch');
    ensure(line.period.start<=now+300&&line.period.end===addMonths(line.period.start,c.offer.months,sub.billing_cycle_anchor||line.period.start),'invoice_period_mismatch');
    const paid=inv.status==='paid'&&inv.amount_remaining===0&&inv.amount_paid===c.offer.amount;
    const failed=['open','uncollectible'].includes(inv.status)&&inv.attempt_count>0;
    if(!paid&&!failed)continue;
    // No grace for an account which has never had an officially confirmed period.
    if(failed&&!c.trial_recorded&&!c.paid_until&&!invoices.some(x=>x.status==='paid'&&x.total>0))continue;
    payments.push({id:`stripe_${c.environment}_${inv.id}`,payment_id:inv.id,status:paid?'paid':'failed',amount_cents:inv.total,
      debit_at:iso(line.period.start),modified_at:iso(now),period_end:iso(line.period.end),paid_at:paid?iso(inv.status_transitions?.paid_at||inv.created):null});
  }
  const pm=sub.default_payment_method;
  const linked=pm?.type==='card'&&ref(pm.customer)===c.customer&&pm.livemode===g.cfg.livemode;
  if(!c.trial)ensure(sub.trial_start==null&&sub.trial_end==null,'unexpected_trial');
  if(c.trial&&sub.trial_start!=null)ensure(sub.trial_end-sub.trial_start===7*DAY&&sub.trial_start<=now,'trial_invalid');
  if(sub.status==='trialing')ensure(c.trial&&sub.trial_end-sub.trial_start===7*DAY&&sub.trial_start<=now&&sub.trial_end>now&&linked,'trial_invalid');
  if(c.trial_recorded)ensure(sub.trial_start*1000===Date.parse(c.trial_start)&&sub.trial_end*1000===Date.parse(c.trial_end),'trial_restart_rejected');
  // A non-trial first payment also needs a confirmed card on the subscription.
  if(['active','trialing'].includes(sub.status))ensure(linked,'card_required');
  const state=['canceled','incomplete_expired'].includes(sub.status)?'canceled':sub.status==='paused'||sub.cancel_at_period_end?'paused':['active','trialing','past_due','unpaid'].includes(sub.status)?'authorized':'pending';
  return {session, sub, financial:{provider_id:sub.id,payer_reference:c.customer,amount_cents:c.offer.amount,state,subscription_status:sub.status,
    method_linked:!!linked,method_label:linked?'Cartão — Stripe':null,card_reference:linked?pm.id:null,
    // Never start an expired trial retrospectively. Existing grants stay immutable.
    trial_start:c.trial_recorded?c.trial_start:c.trial?iso(sub.trial_start):null,
    trial_end:c.trial_recorded?c.trial_end:c.trial?iso(sub.trial_end):null,
    cancel_requested:!!sub.cancel_at_period_end||state==='canceled',next_charge:sub.cancel_at_period_end?null:iso(item.current_period_end),payments}};
}
