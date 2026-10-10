import{consumerDB}from'../tests/support/consumer-db.mjs';import{writeFile}from'node:fs/promises';
const{db}=await consumerDB({through:'202609200029_authorized_support.sql'});
const functions=(await db.query(`select p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_function_result(p.oid) result,pg_get_functiondef(p.oid) definition,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p where pronamespace='public'::regnamespace order by proname`)).rows;
const policies=(await db.query(`select tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname`)).rows;
const columns=(await db.query(`select table_schema,table_name,column_name,data_type from information_schema.columns where table_schema in('public','private') order by table_schema,table_name,ordinal_position`)).rows;
await writeFile('reports/implementation-030/base-map.json',JSON.stringify({functions,policies,columns},null,2));console.log(functions.filter(f=>f.authenticated).map(f=>f.proname+'('+f.args+') -> '+f.result).join('\n'));await db.close();
