import { validateCentralConfig } from "./central-config.mjs";
export function validateCommercialConfig(c) {
  validateCentralConfig(c);
  for (const k of ["a", "b"])
    if (!/^o_[a-f0-9]{24}$/.test(c.opportunities?.[k] || ""))
      throw Error("commercial_fixture_required");
  if (c.opportunities.a === c.opportunities.b)
    throw Error("distinct_opportunities_required");
  return c;
}
