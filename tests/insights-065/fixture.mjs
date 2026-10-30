import {readFile} from 'node:fs/promises';
import {fixture as original} from '../syzia-061/fixture.mjs';
export const drafts=JSON.parse(await readFile(new URL('../../content/insights/drafts-061.json',import.meta.url),'utf8'));
export async function fixture(){
 const c=await original();
 try{
  for(const file of ['202610280064_publication_readiness_templates.sql','202610300065_insights_import.sql'])await c.db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  return c;
 }catch(error){await c.db.close();throw error;}
}
