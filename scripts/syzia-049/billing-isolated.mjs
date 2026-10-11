// OFF by default. No .env, Supabase client or real provider transport is loaded here.
// Every fixture is an ephemeral PGlite database; all provider resources are in-memory.
if (process.argv.length !== 3 || process.argv[2] !== "--offline") {
  console.error(
    "Ensaio desativado. Use npm run homologation:billing:isolated -- --offline para dados fictícios locais.",
  );
  process.exitCode = 2;
} else {
  globalThis.fetch = async () => {
    throw Error("external_network_forbidden_in_isolated_harness");
  };
  const { fixture } = await import("../../tests/billing-047/fixture.mjs");
  const rows = [];
  for (const code of ["essencial", "profissional", "equipe"]) {
    const c = await fixture();
    try {
      const first = await c.command("checkout", code);
      const provider = [...c.fake.subscriptions.values()][0];
      c.fake.charge(provider.id);
      await c.engine.reconcile();
      const paid = await c.view();
      const cancel = await c.command("cancel");
      const resume = await c.command("resume");
      rows.push({
        plan: code,
        trial: first.subscription.state,
        paid: paid.subscription.state,
        cancel: cancel.subscription.state,
        resume: resume.subscription.state,
        transport: "fake-in-memory",
        externalCalls: 0,
      });
    } finally {
      await c.db.close();
    }
  }
  console.log(
    JSON.stringify(
      {
        environment: "ISOLATED_OFFLINE_ONLY",
        realHomologation: "PENDING_MP_01",
        plans: rows,
      },
      null,
      2,
    ),
  );
}
