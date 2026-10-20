import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixture} from '../billing-047/fixture.mjs';
test('055-U01 populated 054 upgrade is atomic, backfills published history and preserves operational data',async()=>{
 process.env.SYZIA_OPTIONAL_MANUAL_CURRENT='1';process.env.SYZIA_OPERATION_CURRENT='1';
 const c=await fixture();
 try {
  await c.db.exec(await readFile('supabase/migrations/202610180054_commercial_preparation.sql','utf8'));
  const lead=(await c.asUser('root','commercial_contact_save',{p_id:null,p_revision:0,p_key:randomUUID(),p_data:{name:'Lia Rocha',company:'Estúdio Aurora',email:'lia@example.invalid',stage:'wants_trial'}})).id;
  const d=await c.asUser('root','commercial_demo_save',{p_id:null,p_revision:0,p_key:randomUUID(),p_lead:lead,p_name:'Estúdio Aurora',p_slug:'estudio-aurora',p_plan:c.versions.profissional,p_expires:new Date(Date.now()+86400000).toISOString()});
  const cfg=(await c.rawSQL('select private.commercial_config_export($1)v',[c.orgs.A])).rows[0].v;
  await c.asUser('root','commercial_demo_publish',{p_id:d.id,p_revision:d.revision,p_config:cfg});
  const before=(await c.rawSQL('select to_jsonb(d)v from private.commercial_demos d where id=$1',[d.id])).rows[0].v;
  const orgs=(await c.rawSQL('select jsonb_agg(to_jsonb(o)order by id)v from organizations o')).rows[0].v;
  const sql=await readFile('supabase/migrations/202610200055_commercial_versions.sql','utf8');
  await assert.rejects(c.db.exec(sql.replace(/commit;\s*$/,'select 1/0;\ncommit;')),/division by zero/);
  await c.db.exec('rollback');
  assert.equal((await c.rawSQL("select to_regclass('private.commercial_versions')v")).rows[0].v,null);
  assert.deepEqual((await c.rawSQL('select to_jsonb(d)v from private.commercial_demos d where id=$1',[d.id])).rows[0].v,before);
  assert.equal((await c.rawSQL("select attnotnull v from pg_attribute where attrelid='private.commercial_demos'::regclass and attname='lead_id'")).rows[0].v,true);
  await c.db.exec(sql);
  const v=(await c.rawSQL('select v.* from private.commercial_versions v join private.commercial_demos d on d.published_version_id=v.id where d.id=$1',[d.id])).rows[0];
  assert.deepEqual(v.configuration,cfg);assert.equal(v.snapshot_hash,before.snapshot_hash);assert.equal(v.version,1);
  assert.equal((await c.rawSQL('select count(*)::int n from private.commercial_demo_contacts where demo_id=$1 and lead_id=$2',[d.id,lead])).rows[0].n,1);
  assert.deepEqual((await c.rawSQL('select jsonb_agg(to_jsonb(o)order by id)v from organizations o')).rows[0].v,orgs);
  await assert.rejects(c.rawSQL('delete from private.commercial_versions where id=$1',[v.id]),/immutable/);
 }finally{await c.db.close();}
});
