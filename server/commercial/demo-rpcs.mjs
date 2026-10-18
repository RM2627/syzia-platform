// Explicit surface, implemented by the same migrated SQL functions as the real app.
// No billing, global administration, Auth provisioning, SQL text or arbitrary tables.
export const PANEL_RPCS = new Set(
  `permissions_context permissions_team permissions_save employee_availability_save
company_categories company_category_save company_context company_create_manual company_discard_manual company_initialize company_page_template_set company_publish_manual company_save company_service_checklist company_service_relation_save company_service_relations company_service_save_with_checklist company_set_activation
consumer_admin_context consumer_branding_save consumer_create_tracking_link consumer_customer_context_save consumer_draft_context consumer_page_draft consumer_payment_rule_save consumer_payment_rules_context consumer_portfolio_delete consumer_portfolio_save consumer_presence_context consumer_publish_draft consumer_remove_block consumer_reserve_company_media consumer_revoke_tracking consumer_schedule_block consumer_schedule_config consumer_set_page_enabled consumer_set_source consumer_work_context
central_act central_attachment_ticket central_book_execution central_booking central_context central_execution_options central_mark_read central_open_request central_presence central_queue central_review_quote central_settings_save central_unread
commercial_config commercial_config_save commercial_context commercial_list commercial_op_act commercial_refresh commercial_rule_save commercial_task_act
analytics_central analytics_company onboarding_act onboarding_context
operations_agenda operations_appointment_act operations_assign_responsible operations_attachment_ticket operations_book_execution operations_checklist operations_checklist_save operations_customer operations_detail operations_directory operations_execution_options operations_home_section operations_quote_calculate operations_quote_catalog operations_quote_context operations_read_notification operations_request operations_request_contact operations_request_photos operations_requests operations_schedule operations_send_calculated_quote operations_support_mode operations_tracking_link`.split(
    /\s+/,
  ),
);
export const CONSUMER_RPCS = new Set(
  `consumer_public_page company_public_faq consumer_approve_quote consumer_book_execution consumer_cancel_booking consumer_complete_execution consumer_confirm_attendance consumer_create_multi_request consumer_decline_quote consumer_document consumer_execution_options consumer_journey_options consumer_journey_slots consumer_mark_review consumer_my_requests consumer_prepare_help_request consumer_redeem_tracking_link consumer_request_context consumer_returning_profile consumer_set_contact consumer_start_help consumer_reserve_attachment consumer_reserve_item_attachment consumer_attachment_ticket central_consumer_send central_consumer_thread`.split(
    /\s+/,
  ),
);
export const DENIED_ACTIONS = new Set([
  "billing.manage",
  "analytics.financial",
  "finance.read",
  "finance.manage",
  "finance.export",
  "finance.calculators",
]);
export function validateDemoRPC(kind, name, args, session) {
  if (
    !(kind === "consumer" ? CONSUMER_RPCS : PANEL_RPCS).has(name) ||
    !args ||
    typeof args !== "object" ||
    Array.isArray(args)
  )
    throw Error("demo_operation_denied");
  if (Object.hasOwn(args, "p_org") && args.p_org !== session.organization_id)
    throw Error("demo_scope_denied");
  if (name === "company_set_activation" && args.p_human === true)
    throw Error("demo_external_action_denied");
  if (name === "operations_support_mode" && args.p_mode === "shared")
    throw Error("demo_external_action_denied");
  if (name === "commercial_context" && !Object.hasOwn(args, "p_code"))
    throw Error("demo_operation_denied");
  return args;
}
