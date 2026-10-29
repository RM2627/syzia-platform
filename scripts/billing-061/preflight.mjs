// Owner-run read-only database preflight. No Mercado Pago calls, no writes.
import { createClient } from "@supabase/supabase-js";
if (!process.argv.includes("--read-only-confirmed")) {
  console.log(
    "No requests made. Use --read-only-confirmed only after owner authorization.",
  );
} else {
  try {
    const c = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await c.rpc("billing061_configuration", {
      p_action: "preflight",
      p_data: {},
    });
    if (error) throw error;
    console.log(JSON.stringify(data, null, 2));
  } catch {
    console.error("billing_preflight_unavailable");
    process.exitCode = 1;
  }
}
