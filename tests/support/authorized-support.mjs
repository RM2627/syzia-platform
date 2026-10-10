import { randomUUID } from "node:crypto";
// Explicit test precondition: exercise the real request/ADM-decision protocol.
// Never seed an approval row or grant global membership to bypass authorization.
export async function authorizeSupport({ as, scalar }, org, admin) {
  await as("root");
  if ((await scalar("select public.support_context($1)", [org])).allowed)
    return;
  const id = await scalar("select public.support_request($1,$2,1,$3,false)", [
    org,
    "Suporte autorizado para cenário de regressão local",
    randomUUID(),
  ]);
  await as(admin);
  await scalar("select public.support_decide($1,true)", [id]);
  await as("root");
}
