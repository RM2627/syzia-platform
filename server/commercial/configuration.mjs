// Explicit configuration boundary shared by export, validation and activation.
// No appointments, customers, staff, grants, contracts, payments or metrics.
export const CONFIG_FIELDS = Object.freeze({
  service_checklist_models: "service_id revision",
  service_checklist_items: "id service_id title position removed",
  company_settings:
    "legal_name description public_phone public_email public_address service_regions payment_methods business_hours human_hours exception_contact_name exception_contact",
  business_rules:
    "pricing_policy payment_policy cancellation_policy rescheduling_policy service_policy deadlines_policy exception_policy",
  service_categories: "id name position active",
  company_media:
    "id public_code object_path mime size_bytes state sha256 width height",
  services:
    "id name category description image_url price_mode price_cents duration_minutes availability notes active quotes_allowed direct_booking category_id image_media_id contract_mode photo_policy photo_instructions execution_mode execution_max_periods price_max_cents",
  service_addons:
    "id service_id name price_mode price_cents duration_minutes active",
  service_intake_fields:
    "id service_id label kind required options position active instruction multiline condition_field condition_value",
  service_relations: "id source_id target_id kind",
  faqs: "id question answer active position",
  quick_replies: "id title body active",
  company_branding:
    "primary_color logo_id cover_id category_order service_order theme",
  portfolio_items:
    "id title description service_id position active format media_ids",
  schedule_resources:
    "active lead_minutes horizon_days step_minutes buffer_minutes cancel_minutes",
});
export function validateConfiguration(value) {
  if (
    !value ||
    value.format !== "syzia-config-054" ||
    !["current", "modern", "minimal", "catalog"].includes(value.template) ||
    Object.keys(value).some(
      (k) => !["format", "tables", "template"].includes(k),
    ) ||
    !value.tables ||
    Array.isArray(value.tables)
  )
    throw Error("commercial_configuration_invalid");
  for (const [table, rows] of Object.entries(value.tables)) {
    if (
      !Object.hasOwn(CONFIG_FIELDS, table) ||
      !Array.isArray(rows) ||
      rows.length > 200
    )
      throw Error("commercial_configuration_invalid");
    const fields = CONFIG_FIELDS[table].split(" ");
    for (const row of rows)
      if (
        !row ||
        Array.isArray(row) ||
        Object.keys(row).some((k) => !fields.includes(k))
      )
        throw Error("commercial_configuration_invalid");
  }
  return value;
}
