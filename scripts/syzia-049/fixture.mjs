import { readFile } from "node:fs/promises";
export async function upgradeOperationFixture(db) {
  await db.exec("reset role");
  await db.exec(
    await readFile(
      "supabase/migrations/202610110049_customer_operation.sql",
      "utf8",
    ),
  );
}
const names = new Set([
  "central_mark_read",
  "central_unread",
  "consumer_confirm_attendance",
  "operations_checklist",
  "operations_checklist_save",
  "operations_attachment_ticket",
  "consumer_document",
  "operations_request_contact",
  "access_signup_authorize",
  "access_signup_release",
]);
export function attachOperationRPC(c) {
  const previous = c.rpc;
  c.rpc = async (name, args = {}) => {
    if (!names.has(name)) return previous(name, args);
    const {
      rows: [m],
    } = await c.db.query(
      "select proargnames,proargtypes::oid[]types from pg_proc where pronamespace='public'::regnamespace and proname=$1",
      [name],
    );
    if (!m) throw Error("Unknown operation RPC");
    return c.scalar(
      `select public.${name}(${m.proargnames.map((n, i) => `${n}=>$${i + 1}`).join(",")})`,
      m.proargnames.map((n, i) =>
        m.types[i] === 3802
          ? JSON.stringify(args[n] ?? null)
          : (args[n] ?? null),
      ),
    );
  };
}
