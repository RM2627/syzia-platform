// Never invoked by npm build/start or a migration. Default: offline dry-run.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { MercadoPagoSubscriptions } from "../../server/billing/mercado-pago.mjs";
import {
  validateProductionMapping,
  inspectProductionPlans,
} from "../../server/billing/production-plans.mjs";
const args = process.argv.slice(2),
  arg = (k) =>
    args.find((a) => a.startsWith("--" + k + "="))?.slice(k.length + 3);
try {
  const entries = validateProductionMapping(
    JSON.parse(await readFile(arg("file"), "utf8")),
  );
  if (
    !args.includes("--validate-read-only") &&
    !args.includes("--apply-production")
  ) {
    console.log(
      JSON.stringify(
        {
          mode: "offline-dry-run",
          externalRequests: 0,
          codes: entries.map((e) => e.code),
          next: "Use --validate-read-only only after owner authorization. No plan or subscription is created.",
        },
        null,
        2,
      ),
    );
  } else {
    if (process.env.MERCADO_PAGO_PRODUCTION_ACCOUNT_CONFIRMED !== "true")
      throw Error("billing_environment_confirmation_required");
    const gateway = new MercadoPagoSubscriptions({
      accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
      publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY,
      collectorId: process.env.MERCADO_PAGO_COLLECTOR_ID,
      applicationId: process.env.MERCADO_PAGO_APPLICATION_ID,
      appOrigin: process.env.PLATFORM_APP_ORIGIN,
      notificationUrl: process.env.MERCADO_PAGO_NOTIFICATION_URL,
      notificationAuth: "hmac",
      webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
      fetchImpl: (url, init) => {
        if (init?.method !== "GET") throw Error("billing_read_only");
        return fetch(url, init);
      },
    });
    const validation = await inspectProductionPlans(entries, {
      gateway,
      environment: "production",
      accountConfirmed: true,
    });
    if (!args.includes("--apply-production"))
      console.log(
        JSON.stringify(
          {
            mode: "read-only",
            externalRequests: 6,
            checked: validation.checked,
          },
          null,
          2,
        ),
      );
    else {
      if (
        arg("confirm") !== "CREATE_NEW_PRODUCTION_VERSIONS" ||
        !arg("expected-legacy-sha256") ||
        !arg("batch-id")
      )
        throw Error("billing_configuration_confirmation_required");
      const client = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data, error } = await client.rpc("billing061_configuration", {
        p_action: "configure",
        p_data: {
          environment: "production",
          account_confirmed: true,
          provider_validated: true,
          expected_legacy_sha256: arg("expected-legacy-sha256"),
          batch_id: arg("batch-id"),
          entries: validation.entries,
        },
      });
      if (error) throw error;
      console.log(
        JSON.stringify(
          {
            mode: "new-versions-created",
            versions: data,
            warning:
              "Runtime activation and a real subscription remain separate owner-controlled gates.",
          },
          null,
          2,
        ),
      );
    }
  }
} catch (e) {
  console.error(
    /^billing_[a-z_]+$/.test(e?.message || "")
      ? e.message
      : "billing_configuration_failed",
  );
  process.exitCode = 1;
}
