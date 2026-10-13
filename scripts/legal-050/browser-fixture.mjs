// Imported exclusively by the disposable loopback demo under two explicit test flags.
import { snapshot } from "../../tests/legal-050/fixture.mjs";
import { readFile } from "node:fs/promises";
import { prepare } from "./prepare.mjs";
import { publicationSQL } from "./sql.mjs";
let revision = 0;
export async function publishLocalLegal(c) {
  if (
    process.env.DEMO_TEST_MODE !== "true" ||
    process.env.DEMO_LEGAL_050 !== "true"
  )
    throw Error("local_legal_fixture_disabled");
  await c.db.exec("commit;reset role");
  const before = await snapshot(c.db),
    version = "local-browser-050-" + ++revision;
  const config = JSON.parse(
    await readFile("docs/legal-050/config.example.json", "utf8"),
  );
  config.version = version;
  config.acceptance_version = "material-" + version;
  Object.assign(config.public_identity, {
    operator_name: "Responsável do ensaio local",
    support_email: "suporte@operacao-ensaios-juridicos.example.org",
    privacy_email: "privacidade@operacao-ensaios-juridicos.example.org",
  });
  const { documents } = await prepare(config, before);
  await c.db.exec(publicationSQL(before, documents, "f".repeat(64)));
  return { version, fixture: true };
}
