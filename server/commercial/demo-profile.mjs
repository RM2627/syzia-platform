// Used only in the separately guarded demonstration database; never a real offer.
export const demonstrationProfile = Object.freeze({
  id: '05500000-0000-4000-8000-000000000001',
  plan_id: '05500000-0000-4000-8000-000000000002',
  version: 1, price_cents: 0, interval_months: 1, trial_days: 0,
  human_support: false, commercial_followups: true,
  member_limit: 8, service_limit: 200,
  request_limit: 200, ticket_limit: 200, followup_limit: 200,
  capabilities: {software:true,finance:false,analytics:true,commercial_followups:true,human_support:false},
  quota_semantics: 2,
});
