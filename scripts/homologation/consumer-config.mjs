export function validateConsumerConfig(c){
 if(c?.testOnlyAcknowledged!==true||c?.realCustomerData!==false)throw Error('dedicated_test_project_required');
 if(!/^[a-z0-9]{10,40}$/.test(c.projectRef)||c.url!==`https://${c.projectRef}.supabase.co`)throw Error('project_ref_mismatch');
 if(typeof c.publishableKey!=='string'||c.publishableKey.includes('REPLACE')||c.publishableKey.startsWith('sb_secret_'))throw Error('public_key_required');
 if(!c.publishableKey.startsWith('sb_publishable_')){let role;try{role=JSON.parse(Buffer.from(c.publishableKey.split('.')[1],'base64url')).role}catch{}if(role!=='anon')throw Error('public_key_required')}
 for(const who of ['alice','bob','adminA']){let claims;try{claims=JSON.parse(Buffer.from(c.tokens[who].split('.')[1],'base64url'))}catch{}if(claims?.role!=='authenticated'||!claims?.sub||claims.exp*1000<Date.now())throw Error('valid_user_token_required')}
 if(new Set(['alice','bob','adminA'].map(k=>c.tokens[k])).size!==3)throw Error('distinct_accounts_required');
 for(const k of ['a','b'])if(!/^[a-z0-9-]+(?:fictici[ao]|homologacao)$/.test(c.slugs?.[k]||''))throw Error('fictitious_slug_required');
 if(c.slugs.a===c.slugs.b)throw Error('distinct_companies_required');
 return c;
}
