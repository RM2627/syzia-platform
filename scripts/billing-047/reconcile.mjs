import { billingRuntime } from "../../server/billing/runtime.mjs";
const result = await billingRuntime().billing.reconcile();
console.log(JSON.stringify(result));
if (result.pending) process.exitCode = 1;
