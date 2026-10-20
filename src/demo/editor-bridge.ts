// The administrative JWT stays in the authenticated parent document.
const parameters = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.hash.slice(1));
const channel = parameters.get('bridge');
const parentOrigin = import.meta.env.VITE_COMMERCIAL_APP_ORIGIN || '';
export const embeddedEditor = !!channel && window.parent !== window;
export function editorRequest<T=any>(path: string, body: unknown = {}): Promise<T> {
  if(!embeddedEditor || !parentOrigin || !/^[a-f0-9-]{36}$/.test(channel!))return Promise.reject(Error('demo_origin_not_configured'));
  return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID();
    const done=()=>{clearTimeout(timeout);window.removeEventListener('message',receive);};
    const receive=(event:MessageEvent)=>{
      if(event.origin!==parentOrigin || event.source!==window.parent || event.data?.type!=='syzia-editor-result' || event.data.channel!==channel || event.data.id!==id)return;
      done();event.data.error?reject(Error(event.data.error)):resolve(event.data.value);
    };
    const timeout=setTimeout(()=>{done();reject(Error('demo_session_expired'));},30000);
    window.addEventListener('message',receive);
    window.parent.postMessage({type:'syzia-editor-request',channel,id,path,body},parentOrigin);
  });
}
export async function commercialMediaFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if(!embeddedEditor)return fetch(input,init);
  const u=new URL(input);const api=import.meta.env.VITE_COMMERCIAL_API_URL;
  if(!api || u.origin!==new URL(api).origin || !/^\/demonstration-media\/(company-media|attachments)\/[mf]_[a-f0-9]{24}$/.test(u.pathname) || u.search)throw Error('demo_operation_denied');
  let body: string|undefined;
  if(init.body) {
    if(!(init.body instanceof Blob) || init.body.size>5*1024*1024)throw Error('demo_operation_denied');
    const bytes=new Uint8Array(await init.body.arrayBuffer());let text='';
    for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
    body=btoa(text);
  }
  const headers=new Headers(init.headers);
  const r=await editorRequest('media',{path:u.pathname,method:init.method||'GET',contentType:headers.get('Content-Type'),ticket:headers.get('X-Download-Ticket'),body});
  const bytes=Uint8Array.from(atob(r.body),x=>x.charCodeAt(0));
  return new Response(bytes,{status:r.status,headers:{'Content-Type':r.contentType}});
}
