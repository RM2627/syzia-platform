import {defineConfig,loadEnv} from 'vite';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'VITE_');
 if(Object.keys(env).some(k=>/SECRET|SERVICE_ROLE|DATABASE_URL/i.test(k)))throw new Error('Privileged configuration must not use the VITE_ prefix.');
 const key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(key&&key!=='sb_publishable_REPLACE_ME'){
  if(key.startsWith('sb_secret_'))throw new Error('Use only a publishable or anon key in frontend configuration.');
  if(!key.startsWith('sb_publishable_')){
   let claims:{role?:string};try{claims=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString());}catch{throw new Error('Invalid frontend key.');}
   if(claims.role!=='anon')throw new Error('A privileged key cannot be included in this build.');
  }
 }
 const demo=env.VITE_APP_REALM==='demo';
 if(demo&&(!env.VITE_COMMERCIAL_APP_ORIGIN||!env.VITE_COMMERCIAL_DEMO_ORIGIN||!env.VITE_COMMERCIAL_API_URL))throw Error('Configure the isolated demo, administrative origin and API URL before building the demo.');
 return {build:{sourcemap:false,...(demo?{outDir:'dist-demo',rollupOptions:{input:'demo.html'}}:{})},server:{host:'127.0.0.1',...(demo?{port:5174}:{})},plugins:demo?[{name:'isolated-demo-entry',configureServer(server){server.middlewares.use((req,_res,next)=>{if(req.method==='GET'&&req.headers.accept?.includes('text/html')&&!req.url?.includes('.'))req.url='/demo.html';next();});}}]:[]};
});
