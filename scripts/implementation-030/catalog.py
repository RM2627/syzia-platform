from pathlib import Path
import json
R=Path(__file__).resolve().parent
rows=[]
admin=['super_admin','admin_empresa'];staff=admin+['colaborador_empresa','own_attendant'];allroles=staff+['shared_attendant'];office=admin+['colaborador_empresa']
def add(a,module,label,roles=staff,scopes=['organization'],cap='software',delegate=True):rows.append(dict(action=a,module=module,label=label,roles=roles,scopes=scopes,capability=cap,delegates_management=delegate))
for module,label,roles,cap in [('home','Home',staff,'setup'),('clients','Clientes',allroles,'software'),('central','Atendimento',allroles,'software'),('quotes','Orçamentos',allroles,'software'),('agenda','Agenda',allroles,'setup'),('pending','Pendências',allroles,'software'),('followup','Retornos',allroles,'commercial_followups'),('services','Serviços',office,'setup'),('portfolio','Portfólio',office,'setup'),('page','Página pública',office,'setup'),('settings','Configurações',office,'setup'),('people','Pessoas e acessos',admin,'setup')]:
 add(module+'.read',module,'Ver '+label,roles,cap=cap)
 if module!='home':add(module+'.manage',module,'Gerenciar '+label,roles,cap=cap)
add('central.reply','central','Responder ao cliente',allroles)
add('quotes.values','quotes','Ver valores dos orçamentos',allroles)
add('analytics.operational','analytics','Ver métricas operacionais',staff)
add('analytics.financial','analytics','Ver métricas financeiras consolidadas',staff)
add('billing.manage','billing','Administrar plano e assinatura',admin,cap='setup')
for a,label in [('accounts.read','Ver contas a receber'),('history.read','Ver histórico financeiro autorizado'),('receipts.record','Registrar recebimento')]:add('finance.'+a,'finance',label,allroles,['organization','assigned'])
for a,label in [('accounts.manage','Criar e gerenciar contas'),('expenses.read','Ver despesas'),('expenses.record','Registrar despesas'),('expenses.manage','Gerenciar despesas'),('cash.read','Ver caixa consolidado'),('receipts.summary','Ver recebimentos consolidados'),('result.read','Ver resultado do período'),('calculators','Usar calculadoras')]:add('finance.'+a,'finance',label,staff)
add('finance.receipts.reverse','finance','Estornar recebimento confirmado',admin)
def sql(v):
 if isinstance(v,bool):return str(v).lower()
 if isinstance(v,list):return 'array['+','.join(sql(x)for x in v)+']'
 return "'"+v.replace("'","''")+"'"
(R/'01a-catalog.sql').write_text('insert into private.permission_catalog(action,module,label,roles,scopes,capability,delegates_management) values\n'+',\n'.join('('+','.join(sql(r[k])for k in ['action','module','label','roles','scopes','capability','delegates_management'])+')' for r in rows)+';\n')
(R.parents[1]/'docs/implementation-030/permission-catalog.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
