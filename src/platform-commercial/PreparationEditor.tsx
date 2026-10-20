import {useEffect,useRef,useState} from 'react';
import {supabase} from '../api';
import {commercialApi,commercialError} from './api';
import {ConfigurationReview} from './ConfigurationReview';
import {rpc} from '../api';

export function PreparationEditor({definition,onClose}:{definition:any;onClose:()=>void}) {
  const frame=useRef<HTMLIFrameElement>(null);
  const channel=useRef(crypto.randomUUID());
  const [revision,setRevision]=useState(definition.revision),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[review,setReview]=useState<any>(null),[approved,setApproved]=useState(false);
  const url=new URL(definition.url);
  url.hash=new URLSearchParams({editor:definition.session.token,bridge:channel.current}).toString();
  const origin=url.origin;
  useEffect(()=>{
    let live=true;const pending=new Set<string>();
    const listener=async(e:MessageEvent)=>{
      const m=e.data;
      if(e.origin!==origin || e.source!==frame.current?.contentWindow || m?.type!=='syzia-editor-request' || m.channel!==channel.current || !/^[a-f0-9-]{36}$/.test(m.id) || pending.has(m.id))return;
      pending.add(m.id);
      try {
        let value;
        if(m.path==='media') {
          const b=m.body;
          if(!b || !/^\/demonstration-media\/(company-media|attachments)\/[mf]_[a-f0-9]{24}$/.test(b.path) || !['GET','POST','DELETE'].includes(b.method) || (b.body&&(!/^[A-Za-z0-9+/=]+$/.test(b.body)||b.body.length>7*1024*1024)))throw Error('demo_operation_denied');
          const token=(await supabase?.auth.getSession())?.data.session?.access_token;
          if(!token)throw Error('session_required');
          const root=import.meta.env.VITE_COMMERCIAL_API_URL||import.meta.env.VITE_PLATFORM_API_URL;
          const headers:Record<string,string>={Authorization:'Bearer '+definition.session.token+'.company','X-Commercial-Authorization':'Bearer '+token};
          if(b.contentType)headers['Content-Type']=b.contentType;
          if(b.ticket)headers['X-Download-Ticket']=b.ticket;
          const bytes=b.body?Uint8Array.from(atob(b.body),x=>x.charCodeAt(0)):undefined;
          const r=await fetch(root+b.path,{method:b.method,headers,body:bytes,credentials:'omit',referrerPolicy:'no-referrer'});
          const data=new Uint8Array(await r.arrayBuffer());if(data.length>5*1024*1024)throw Error('demo_operation_denied');
          let text='';for(let i=0;i<data.length;i+=8192)text+=String.fromCharCode(...data.subarray(i,i+8192));
          value={status:r.status,contentType:r.headers.get('Content-Type')||'application/octet-stream',body:btoa(text)};
        } else {
          if(!['restore','rpc','team','end'].includes(m.path))throw Error('demo_operation_denied');
          value=await commercialApi('editor-action',{session:definition.session.token,path:m.path,body:m.body});
          if(m.path==='rpc' && /save|set|delete|publish|remove|initialize/.test(m.body?.name||'')) {setReview(null);setApproved(false);}
        }
        if(live)frame.current?.contentWindow?.postMessage({type:'syzia-editor-result',channel:channel.current,id:m.id,value},origin);
      } catch {
        if(live)frame.current?.contentWindow?.postMessage({type:'syzia-editor-result',channel:channel.current,id:m.id,error:'demo_operation_denied'},origin);
      } finally {pending.delete(m.id);}
    };
    window.addEventListener('message',listener);return()=>{live=false;window.removeEventListener('message',listener);};
  },[origin,definition]);
  async function action(path:string) {
    setBusy(true);setError('');setNotice('');
    try {
      const r=await commercialApi(path,{id:definition.session.source_id,revision,session:definition.session.token});setRevision(r.revision);
      if(path==='review') {const d=await rpc<any>('commercial_demo_edit_context',{p_id:definition.session.source_id});setReview(d.configuration);setApproved(false);}
      else {setReview(null);setApproved(false);}
      if(path==='publish'){onClose();return;}
      setNotice(path==='publish'?'Versão publicada. A próxima alteração será um novo rascunho.':path==='review'?'Confira a configuração antes de publicar.':'Rascunho salvo. Você pode sair e continuar depois.');
    }catch(e){setError(commercialError(e));}finally{setBusy(false);}
  }
  return <section className="commercial-preparation">
    <header><p className="eyebrow">GESTÃO COMERCIAL · PREPARAÇÃO</p><h1>{definition.session.organization.name}</h1><p>Configure com os mesmos recursos da empresa real. Salvar mantém o rascunho; publicar disponibiliza uma versão revisada.</p></header>
    <div className="button-row"><button disabled={busy} onClick={()=>void action('save')}>Salvar rascunho</button><button disabled={busy} onClick={()=>void action('review')}>Revisar configuração</button><button disabled={busy} onClick={onClose}>Voltar às demonstrações</button></div>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {review&&<div className="card"><h2>Revisão da versão</h2><ConfigurationReview configuration={review}/><label><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>Revisei a configuração e autorizo disponibilizar esta versão demonstrativa.</label><button disabled={busy||!approved} onClick={()=>void action('publish')}>Publicar demonstração</button></div>}
    <iframe ref={frame} title="Configuração da empresa demonstrativa" src={url.href} sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerPolicy="no-referrer" style={{width:'100%',minHeight:850,border:0,borderRadius:16}}/>
  </section>;
}
