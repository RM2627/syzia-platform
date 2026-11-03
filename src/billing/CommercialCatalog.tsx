import './stripe-checkout.css';
import { useEffect, useState } from 'react';
import { rpc } from '../api';

const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export function CommercialCatalog({onLoaded}:{onLoaded:(ids:string[])=>void}) {
  const [rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  async function load(){
    const data=await rpc<any[]>('commercial_catalog_admin');setRows(data);onLoaded(data.map(x=>x.id));
  }
  useEffect(()=>{void load().catch(()=>setError('Não foi possível consultar o catálogo comercial.'));},[]);
  function change(id:string,key:string,value:unknown){setRows(old=>old.map(x=>x.id===id?{...x,[key]:value}:x));setNotice('');}
  async function save(row:any){
    setBusy(true);setError('');setNotice('');
    try{
      await rpc('commercial_catalog_save',{p_id:row.id,p_revision:row.catalog_revision,p_data:{description:row.description,active:row.active,site_visible:row.site_visible,available:row.available}});
      await load();setNotice('Visibilidade atualizada. A página pública e o cadastro consultam este catálogo; habilitação financeira continua independente.');
    }catch{setError('Não foi possível salvar. Atualize o catálogo e confira sua permissão antes de tentar novamente.');}
    finally{setBusy(false);}
  }
  return <section className="commercial-catalog" aria-labelledby="commercial-catalog-title">
    <h2 id="commercial-catalog-title">Catálogo comercial · SYZIA Completa</h2>
    <p>Mesmas funcionalidades nas três modalidades. Preços, períodos, limites e vínculos financeiros são preservados. Exibir uma oferta não habilita cobranças.</p>
    <button disabled={busy} onClick={()=>void load().catch(()=>setError('Não foi possível atualizar.'))}>Atualizar catálogo</button>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="cc-grid">{rows.map(row=><form className="cc-card" key={row.id} onSubmit={e=>{e.preventDefault();void save(row);}}>
      <h3>{row.modality}</h3><p><strong>{money(row.price_cents)}</strong> integral a cada {row.interval_months} mês(es)</p>
      <label>Descrição · {row.modality}<textarea maxLength={2000} value={row.description} onChange={e=>change(row.id,'description',e.target.value)}/></label>
      <label><input type="checkbox" checked={row.active} onChange={e=>change(row.id,'active',e.target.checked)}/>Oferta ativa · {row.modality}</label>
      <label><input type="checkbox" checked={row.site_visible} onChange={e=>change(row.id,'site_visible',e.target.checked)}/>Exibir publicamente · {row.modality}</label>
      <label><input type="checkbox" checked={row.available} onChange={e=>change(row.id,'available',e.target.checked)}/>Ofertar quando o checkout estiver autorizado · {row.modality}</label>
      <p>{row.member_limit} membros · {row.service_limit} serviços ativos · {row.request_limit} solicitações/mês. Atendimento compartilhado não incluído.</p>
      <button disabled={busy}>Salvar {row.modality.toLowerCase()}</button>
    </form>)}</div>
  </section>;
}
