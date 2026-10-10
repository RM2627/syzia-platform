"""Summarize retained local evidence; does not run or simulate tests."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
r=root/'reports'
def read(name): return json.loads((r/name).read_text())
sql_names=['security-results','company-security-results','consumer-results','presence-payments-results','central-results','commercial-results','analytics-results','billing-results','trial-results','onboarding-local','operations-local','company-page-sql','multisegment-sql','invitations-results']
sql=[]
for n in sql_names:
 d=read(n+'.json'); cases=d if isinstance(d,list) else d.get('tests',d.get('results',[]))
 assert all(t['status']=='PASS' for t in cases),(n,cases)
 sql.append({'source':n+'.json','passed':len(cases)})
def merged(files):
 cases={}
 def collect(suite):
  for s in suite.get('specs',[]):
   key=s.get('file',suite.get('file',''))+' :: '+s['title']
   cases[key]={'title':s['title'],'file':s.get('file'), 'passed':s['ok'] and all(t['status']=='expected' for t in s['tests'])}
  for child in suite.get('suites',[]):collect(child)
 for f in files:
  for suite in read(f)['suites']:collect(suite)
 assert all(t['passed'] for t in cases.values()),[k for k,v in cases.items() if not v['passed']]
 return {'sources_in_order':files,'unique_passed':len(cases),'cases':list(cases.values())}
ui=merged(['vireloq-ui-full-results.json','vireloq-ui-correction-results.json','vireloq-final-foundation-ui-results.json'])
demo=merged(['vireloq-demo-full-results.json','vireloq-demo-correction-results.json'])
upgrades=[]
for n in ['commercial','analytics','billing','trial']:
 d=read(n+'-upgrade-results.json');cases=d.get('results',d.get('tests',[]));assert all(c['status']=='PASS' for c in cases)
 upgrades.append({'source':n+'-upgrade-results.json','passed':len(cases)})
node={'homologation-tools':10,'company-tools':5,'billing-provider':8,'billing-tools':3,'analytics-tools':2,'commercial-tools':5,'central-tools':5,'images':9,'consumer-tools':7,'invitation-delivery':6,'hosted-checkout-contract':8}
summary={'environment':'LOCAL ONLY: PGlite SQL/RLS, Auth fixtures, HTTP loopback and Chromium. No real Supabase or financial provider.', 'sql':sql,'upgrades':upgrades,'node_tests':node,'node_evidence':['vireloq-regression.log','vireloq-regression-continuation.log','vireloq-server-tests.log'],'smoke_http_and_config_passed':4,'browser_contracts':ui,'browser_demo':demo,'native_concurrency':'NOT EXECUTED: UID mapping unavailable; see vireloq-native.log','external_homologation':'PENDING','real_billing_integration':'UNIMPLEMENTED: provider selection, concrete adapter, durable store and endpoints required','video':'CANCELLED'}
summary['unique_passed_total']=sum(t['passed'] for t in sql+upgrades)+sum(node.values())+4+ui['unique_passed']+demo['unique_passed']
(r/'vireloq-validation-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sql':sum(t['passed'] for t in sql),'upgrades':sum(t['passed'] for t in upgrades),'node':sum(node.values()),'ui':ui['unique_passed'],'demo':demo['unique_passed'],'total':summary['unique_passed_total']}))
