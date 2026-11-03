import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { billingApi } from './checkout-api';
import { MercadoPagoBilling } from './MercadoPago';
import './stripe-checkout.css';
type Offer={code:string;product_name?:string;modality?:string;description?:string;checkout_available?:boolean;saving_cents?:number;discount_percent?:number;price_cents:number;interval_months:number;member_limit:number;service_limit:number;request_limit:number};
type Context={checkout_mode:'internal'|'stripe'|'disabled';environment:string;provider:string|null;stripe_available:boolean;confirmation_enabled:boolean;test_allowed:boolean;eligibility:string;catalog:Offer[];subscription:null|{id:string;state:string;offer:string;environment:string;trial_end:string|null;access_until:string|null;next_charge:string|null;pending:boolean;cancel_requested:boolean;checkout_url:string|null;error_code:string|null}};
const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const date=(s:string|null)=>s?new Date(s).toLocaleDateString('pt-BR'):'A confirmar';
const names:Record<string,string>={monthly:'Mensal',semiannual:'Semestral',annual:'Anual'};
const states:Record<string,string>={trialing:'Período gratuito ativo',active:'Assinatura ativa',payment_pending:'Aguardando confirmação',reconciliation:'Confirmação em andamento',grace_period:'Pagamento pendente',cancel_scheduled:'Cancelamento programado',canceled:'Assinatura encerrada',paused:'Assinatura pausada',restricted:'Acesso restrito'};
export function SubscriptionCheckout({org}:{org:string}){
  const [data,setData]=useState<Context|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[accepted,setAccepted]=useState(false);
  const commandKey=useRef<{action:string;offer?:string;key:string}|null>(null);
  const scope=useRef<string|null>(org);scope.current=org;
  useEffect(()=>{scope.current=org;return()=>{scope.current=null;};},[org]);
  async function refresh(){
    setError('');setBusy(true);
    try{const selector=await billingApi('checkout',{organization_id:org});
      const value=selector.provider==='stripe'?{...selector,...await billingApi('stripe/status',{organization_id:org}),checkout_mode:selector.checkout_mode}:selector;
      if(scope.current===org)setData(value);
    }catch{setError('Não foi possível consultar a assinatura. Tente atualizar o status.');}finally{setBusy(false);}
  }
  useEffect(()=>{setData(null);commandKey.current=null;setAccepted(false);void refresh();},[org]);
  async function command(action:string,offer?:string){
    if(busy)return;setBusy(true);setError('');
    const prior=commandKey.current;
    if(!prior||prior.action!==action||prior.offer!==offer)commandKey.current={action,offer,key:crypto.randomUUID()};
    try{
      const value=await billingApi('stripe/command',{organization_id:org,action,request_key:commandKey.current!.key,
        ...(action==='checkout'?{offer,trial_expected:data?.eligibility==='eligible',accepted}:{})});
      if(scope.current!==org)return;
      setData(old=>({...old!,...value}));commandKey.current=null;
      if(action==='checkout'&&value.subscription?.checkout_url)redirect(value.subscription.checkout_url);
    }catch{setError('A operação não foi confirmada. Atualize o status antes de tentar novamente. Uma confirmação pendente não cria outra assinatura.');}finally{setBusy(false);}
  }
  function redirect(value:string){const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='checkout.stripe.com'&&!u.port&&!u.username&&!u.password)window.location.assign(u.href);else setError('Endereço de checkout inválido.');}
  if(data?.provider==='mercado_pago'||(!data?.provider&&data?.checkout_mode==='internal'))return <MercadoPagoBilling org={org}/>;
  const sub=data?.subscription,eligible=data?.eligibility==='eligible';
  const canStart=data?.checkout_mode==='stripe'&&data.stripe_available&&data.confirmation_enabled&&data.test_allowed&&['eligible','previous_identity','previous_grant'].includes(data.eligibility)&&!sub;
  return <section className="stripe-checkout" aria-labelledby="stripe-title" aria-busy={busy}>
    <header><div><h1 id="stripe-title">{sub?'Sua assinatura':'SYZIA Completa'}</h1><p>Todos os recursos de software. Escolha o período de contratação.</p></div><button type="button" className="btn" onClick={()=>void refresh()} disabled={busy}>Atualizar status</button></header>
    {error&&<p role="alert" className="stripe-notice">{error}</p>}
    {!data&&<p role="status">Consultando sua assinatura…</p>}
    {data?.environment==='test'&&<p className="stripe-notice">Ambiente de teste — acesso restrito às organizações autorizadas para homologação.</p>}
    {data&&!sub&&!canStart&&<p role="status" className="stripe-notice">Novas contratações estão indisponíveis no momento. Nenhuma assinatura será criada.</p>}
    {sub?<div className="card"><h2>{states[sub.state]||'Aguardando validação'}</h2><p>SYZIA Completa · {names[sub.offer]}</p>
      <dl><dt>Acesso confirmado até</dt><dd>{date(sub.access_until)}</dd><dt>Próxima cobrança</dt><dd>{sub.cancel_requested?'Cancelamento programado':date(sub.next_charge)}</dd></dl>
      {sub.pending&&<p role="status">O backend está verificando a operação com a Stripe.</p>}
      {sub.checkout_url&&<button className="btn primary" type="button" disabled={busy} onClick={()=>redirect(sub.checkout_url!)}>Continuar no checkout seguro</button>}
      {!sub.pending&&['active','trialing','cancel_scheduled','grace_period'].includes(sub.state)&&<button className="btn" type="button" disabled={busy} onClick={()=>{const action=sub.cancel_requested?'resume':'cancel';if(window.confirm(sub.cancel_requested?'Reativar a renovação desta assinatura?':'Cancelar a renovação ao final do período confirmado?'))void command(action);}}>{sub.cancel_requested?'Reativar renovação':'Cancelar renovação'}</button>}
      <p>A confirmação ocorre no servidor. O retorno do checkout, sozinho, não altera o acesso.</p>
    </div>:data&&<>
      <div className="stripe-offers">{data.catalog.map(o=><article className="card" key={o.code}><h2>{o.modality||names[o.code]}</h2><p>{o.description}</p><strong>{money(o.price_cents)}</strong><p>{o.interval_months===1?'Por mês':`Valor integral a cada ${o.interval_months} meses`}</p>
        {eligible?<p><b>7 dias grátis</b><br/>Hoje: R$ 0,00<br/>Depois: {money(o.price_cents)} por período.<br/>Primeira cobrança prevista: {new Date(Date.now()+7*86400000).toLocaleDateString('pt-BR')}.</p>:<p>Primeira cobrança de {money(o.price_cents)} na contratação, conforme elegibilidade.</p>}
        <p>{o.member_limit} membros · {o.service_limit} serviços ativos · {o.request_limit} solicitações por mês.</p>{!!o.saving_cents&&<p>Economia de {money(o.saving_cents)} ({o.discount_percent}%) em relação ao mensal no mesmo período.</p>}
        <button className="btn primary" type="button" disabled={!canStart||o.checkout_available!==true||!accepted||busy} onClick={()=>void command('checkout',o.code)}>Escolher {names[o.code].toLowerCase()}</button></article>)}</div>
      <label className="stripe-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy||!canStart}/> Li as condições: renovação automática pelo valor integral do período, cartão obrigatório e sete dias gratuitos apenas quando elegível. Posso cancelar a renovação antes da próxima cobrança.</label>
      {data.eligibility==='verification_required'&&<p>Complete os dados do responsável em <Link to={`/painel/${org}/configuracao`}>Configuração da empresa</Link> para verificar a elegibilidade.</p>}
      <p>Mesmas funcionalidades nas três modalidades. Atendimento humano compartilhado não está incluído. Cartão informado exclusivamente no checkout hospedado da Stripe.</p>
    </>}
  </section>;
}
