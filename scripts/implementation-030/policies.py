from pathlib import Path
R=Path(__file__).resolve().parent
m={
'company_settings':'settings.read','business_rules':'settings.read','attendant_permissions':'settings.read','manual_versions':'settings.read','manual_sections':'settings.read','faqs':'settings.read','quick_replies':'settings.read',
'services':'services.read','service_addons':'services.read','service_intake_fields':'services.read','company_branding':'page.read','company_media':'portfolio.read','consumer_pages':'page.read','consumer_publications':'page.read','portfolio_items':'portfolio.read',
'schedule_resources':'agenda.read','appointment_events':'agenda.read','customer_context':'clients.read','opportunity_context':'clients.read',
'commercial_settings':'followup.read','commercial_rules':'followup.read','commercial_tasks':'followup.read','commercial_attempts':'followup.read','commercial_events':'followup.read','commercial_opportunity_state':'followup.read',
'central_quote_actions':'quotes.values','central_settings':'central.read','tickets':'central.read','ticket_notes':'central.read','ticket_messages':'central.read','ticket_events':'central.read','ticket_escalations':'pending.read','payment_rules':'settings.read','payment_plans':'settings.read',
'notifications':'settings.read','organization_user_guides':'settings.read'}
expressions={t:f"private.permission_allowed(organization_id,'{a}')"for t,a in m.items()}
expressions.update({
'manual_versions':"private.permission_allowed(organization_id,'settings.read')and(status='published'or private.permission_allowed(organization_id,'settings.manage'))",
'manual_sections':"private.permission_allowed(organization_id,'settings.read')and(private.permission_allowed(organization_id,'settings.manage')or exists(select 1 from public.manual_versions v where v.id=manual_id and v.status='published'))",

'customers':"private.permission_allowed(organization_id,'clients.read')or private.customer_owner(id)",
'customer_consents':"private.permission_allowed(organization_id,'clients.read')or private.customer_owner(customer_id)",
'opportunities':"private.permission_allowed(organization_id,'followup.read')or private.customer_owner(customer_id)",
'quote_requests':"private.permission_allowed(organization_id,'quotes.read')or private.consumer_owner(id)",
'quote_versions':"(private.permission_allowed(organization_id,'quotes.read')and private.permission_allowed(organization_id,'quotes.values'))or private.consumer_owner(request_id)",
'quote_items':"(private.permission_allowed(organization_id,'quotes.read')and private.permission_allowed(organization_id,'quotes.values'))or exists(select 1 from public.quote_versions v where v.id=version_id and private.consumer_owner(v.request_id))",
'appointments':"private.permission_allowed(organization_id,'agenda.read')or (kind='booking'and private.consumer_owner(request_id))",
'attachments':"private.permission_allowed(organization_id,'quotes.read')or private.consumer_owner(request_id)",
'request_events':"private.permission_allowed(organization_id,'quotes.read')or private.consumer_owner(request_id)",
'organization_user_guides':"user_id=auth.uid()and private.permission_allowed(organization_id,'settings.manage')",
'payments':"private.permission_manager(organization_id)or private.consumer_owner(request_id)",
})
lines=[]
for t,e in expressions.items():
 lines.append(f'drop policy {t}_read on public.{t};create policy {t}_read on public.{t} for select to authenticated using({e});')
(R/'08a-policies.sql').write_text('\n'.join(lines)+'\n')
