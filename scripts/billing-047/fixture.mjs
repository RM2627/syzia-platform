import { readFile } from "node:fs/promises";
export async function upgradeBillingFixture(db) {
  await db.exec("reset role");
  await db.exec(await readFile("supabase/migrations/202610050047_mercado_pago_subscriptions.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610130051_checkout_diagnostics.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/202610140052_integrated_subscription_safety.sql", "utf8"));
  if (process.env.SYZIA_OPTIONAL_MANUAL_CURRENT === "1") await (await import("../syzia-048/fixture.mjs")).upgradeOptionalManualFixture(db);
}
// Adapter for the historical fixture RPC name allowlist. Preserves original tests.
export function attachBillingRPC(c) {
  const previous = c.rpc;
  c.rpc = async (name, args = {}) => {
    if (!/^billing(?:047|051)_[a-z_]+$/.test(name)) return previous(name, args);
    const { rows: [m] } = await c.db.query("select proargnames,proargtypes::oid[]types from pg_proc where pronamespace='public'::regnamespace and proname=$1", [name]);
    if (!m) throw Error("Unknown billing RPC");
    return c.scalar(`select public.${name}(${m.proargnames.map((n,i)=>`${n}=>$${i+1}`).join(',')})`, m.proargnames.map((n,i)=>m.types[i]===3802?JSON.stringify(args[n]??null):args[n]??null));
  };
}
