from pathlib import Path
import json
R=Path(__file__).resolve().parent
mapping={
'company_initialize':'settings.manage','company_save':"case p_entity when 'service'then 'services.manage'when 'addon'then 'services.manage'when 'field'then 'services.manage'else 'settings.manage'end",
'company_create_manual':'settings.manage','company_discard_manual':'settings.manage','company_publish_manual':'settings.manage','company_set_activation':'settings.manage',
'consumer_branding_save':'page.manage','consumer_portfolio_save':'portfolio.manage','consumer_presence_context':"case when private.permission_allowed(p_org,'portfolio.read')then 'portfolio.read'else 'page.read'end",'consumer_admin_context':"case when private.permission_allowed(p_org,'page.read')then 'page.read'else 'portfolio.read'end",'consumer_publish_page':'page.manage','consumer_set_page_enabled':'page.manage','consumer_reserve_company_media':"case when private.permission_allowed(p_org,'portfolio.manage')then 'portfolio.manage'else 'page.manage'end",'consumer_payment_rule_save':'settings.manage','consumer_payment_rules_context':'settings.read','consumer_schedule_config':'agenda.manage','consumer_schedule_block':'agenda.manage','consumer_remove_block':'agenda.manage',
'operations_agenda':'agenda.read','operations_detail':'agenda.read','operations_appointment_act':'agenda.manage','operations_customer':'clients.manage','operations_directory':'clients.read','operations_request':'quotes.manage','operations_requests':'quotes.read','operations_quote_context':'quotes.read','operations_send_quote':'quotes.manage','operations_schedule':'agenda.manage','operations_member':'people.manage','operations_set_attendant':'people.manage','operations_support_mode':'settings.manage','operations_read_notification':'home.read',
'access_team':'people.read','foundation_set_member':'people.manage','central_settings_save':'settings.manage','commercial_config':'followup.read','commercial_config_save':'followup.manage','commercial_rule_save':'followup.manage','analytics_central':'analytics.operational','analytics_company':'analytics.operational',
'onboarding_context':'settings.manage','onboarding_act':'settings.manage'}
code_org="(select organization_id from public.quote_requests where public_code=p_code)"
ticket_org="(select organization_id from public.tickets where public_code=p_code)"
for n,a in [('consumer_work_context','quotes.read'),('consumer_send_quote','quotes.manage'),('consumer_mark_review','quotes.manage'),('consumer_customer_context_save','clients.manage')]:mapping[n]=(code_org,a)
for n,a in [('central_context','central.read'),('central_quote','quotes.manage'),('central_booking','agenda.manage'),('central_slots','agenda.read'),('central_attachment_ticket','central.read')]:mapping[n]=(ticket_org,a)
mapping['central_act']=(ticket_org,"case when p_action='message'then 'central.reply'when p_action='decision'then 'pending.manage'else 'central.manage'end")
mapping['central_open_request']=("(select organization_id from public.quote_requests where public_code=p_request)",'central.read')
# Commercial uses the opportunity public code; authorization still checks consent, ownership, manual and autonomy.
for n,a in [('commercial_context','followup.read'),('commercial_op_act','followup.manage')]:mapping[n]=("(select organization_id from private.commercial_op where commercial_code=p_code)",a)
mapping['commercial_task_act']=("(select organization_id from public.commercial_tasks where public_code=p_code)",'followup.manage')
lines=[];inventory=[]
for name,v in mapping.items():
 org,action=v if isinstance(v,tuple)else('p_org',v)
 expr=action if action.startswith('case ')else "'"+action+"'"
 def q(s):return "'"+s.replace("'","''")+"'"
 lines.append('select private.permission_wrap('+','.join([q(name),q(org),q(expr),'true'])+');')
 inventory.append({'rpc':name,'organization':org,'action':action})
(R/'07a-wrappers.sql').write_text('\n'.join(lines)+'\n')
(R.parents[1]/'docs/implementation-030/rpc-permissions.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2))
