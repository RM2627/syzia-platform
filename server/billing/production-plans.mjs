import { commercialPrices, fail } from "./mercado-pago.mjs";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validateProductionMapping(entries) {
  if (
    !Array.isArray(entries) ||
    entries.length !== 3 ||
    new Set(entries.map((e) => e.code)).size !== 3
  )
    fail("billing_plan_mapping_invalid");
  const ids = [];
  for (const e of entries) {
    if (
      !Object.hasOwn(commercialPrices, e.code) ||
      !uuid.test(e.source_version_id || "") ||
      Object.keys(e).some(
        (k) =>
          ![
            "code",
            "source_version_id",
            "trial_plan_id",
            "paid_plan_id",
          ].includes(k),
      )
    )
      fail("billing_plan_mapping_invalid");
    for (const k of ["trial_plan_id", "paid_plan_id"]) {
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(e[k] || ""))
        fail("billing_plan_mapping_invalid");
      ids.push(e[k]);
    }
  }
  if (new Set(ids).size !== 6) fail("billing_plan_mapping_invalid");
  return entries;
}
export async function inspectProductionPlans(
  entries,
  { gateway, environment, accountConfirmed = false },
) {
  validateProductionMapping(entries);
  if (!["production", "sandbox"].includes(environment) || !accountConfirmed)
    fail("billing_environment_confirmation_required");
  const checked = [];
  for (const e of entries) {
    for (const trial of [true, false]) {
      const id = trial ? e.trial_plan_id : e.paid_plan_id;
      const p = await gateway.plan(
        id,
        {
          code: e.code,
          amount_cents: commercialPrices[e.code],
          currency: "BRL",
          interval_months: 1,
        },
        trial,
      );
      const reference = `SYZIA-${e.code.toUpperCase()}-${trial ? "TRIAL" : "PAGO"}`;
      if (p.external_reference !== reference)
        fail("billing_plan_reference_mismatch");
      // The plan contract does not guarantee live_mode. Absence is never proof of environment.
      if (
        typeof p.live_mode === "boolean" &&
        p.live_mode !== (environment === "production")
      )
        fail("billing_environment_mismatch");
      checked.push({
        code: e.code,
        variant: trial ? "trial" : "paid",
        reference,
        status: "validated",
        environmentEvidence:
          "owner_attestation_and_merchant_application_binding",
      });
    }
  }
  return {
    checked,
    entries: entries.map((e) => ({
      ...e,
      collector_id: String(gateway.collectorId),
      application_id: String(gateway.applicationId),
    })),
  };
}
