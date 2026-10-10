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
 return {build:{sourcemap:false},server:{host:'127.0.0.1'}};
});
