import { pathToFileURL } from "node:url";
import { billingRuntime } from "./runtime.mjs";
import { createBillingServer } from "./http.mjs";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const { billing } = billingRuntime();
createBillingServer({ origin: new URL(process.env.PLATFORM_APP_ORIGIN).origin, billing }).listen(Number(process.env.BILLING_API_PORT || 8789), "127.0.0.1", () => console.log("Billing API ready on loopback"));

}
