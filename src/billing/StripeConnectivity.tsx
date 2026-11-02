import { useState } from 'react';
import { billingApi } from './checkout-api';
export function StripeConnectivity(){
 const [busy,setBusy]=useState(false),[result,setResult]=useState('');
 return <section className="card"><h2>Conectividade Stripe</h2><p>Consulta a conta, o produto e os três preços configurados. Não cria clientes, sessões, assinaturas ou cobranças.</p>
  <button disabled={busy} type="button" onClick={async()=>{setBusy(true);setResult('');try{const r=await billingApi('stripe/preflight',{});setResult(`Catálogo verificado no ambiente ${r.environment==='test'?'de teste':'de produção'}. Mapeamento no banco: ${r.database_mapping_verified?'conferido':'pendente'}. Novas contratações: ${r.checkout_mode==='disabled'?'bloqueadas':r.checkout_mode}. Nenhuma operação financeira realizada.`);}catch{setResult('Verificação indisponível. É necessário Super Admin ativo e configuração Stripe válida no backend.');}finally{setBusy(false);}}}>{busy?'Verificando…':'Verificar conectividade (somente leitura)'}</button>
  {result&&<p role="status">{result}</p>}
 </section>;
}
