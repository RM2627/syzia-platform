import { readFile } from 'node:fs/promises';
export async function upgradeOptionalManualFixture(db) {
  await db.exec('reset role');
  await db.exec(await readFile('supabase/migrations/202610090048_unified_backend_optional_manual.sql','utf8'));
}
export async function seedNoManualBrowser(c) {
  if(process.env.DEMO_TEST_MODE!=='true')throw Error('local_fixture_only');
  await c.db.exec('begin;reset role');
  await c.db.query("update company_settings set published_manual_id=null,human_enabled=false,faq_public_enabled=false,support_configured=true,support_mode='own'where organization_id=$1",[c.orgs.A]);
  await c.as('adminA');
  const d=await c.rpc('consumer_page_draft',{p_org:c.orgs.A,p_show_prices:true});
  await c.rpc('consumer_publish_draft',{p_org:c.orgs.A,p_token:d.token,p_show_prices:true,p_expected_revision:d.page_revision});
  await c.db.exec('commit;reset role');
}
