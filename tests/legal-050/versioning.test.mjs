import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publicationSQL, rollbackSQL } from "../../scripts/legal-050/sql.mjs";
import { prepare, compile } from "../../scripts/legal-050/prepare.mjs";
import {
  snapshot,
  fixtureDocuments,
  provision,
  identity,
  accept,
} from "./fixture.mjs";
Object.assign(process.env, {
  SYZIA_TEAM_CURRENT: "1",
  SYZIA_FLEXIBLE_CURRENT: "1",
  SYZIA_BILLING_CURRENT: "1",
  SYZIA_OPTIONAL_MANUAL_CURRENT: "1",
  SYZIA_OPERATION_CURRENT: "1",
});
const { consumerDB } = await import("../support/current-fixture.mjs");
const c = await consumerDB(),
  { db } = c;
await db.exec("commit;reset role");
const baseline = await snapshot(db),
  docs = await fixtureDocuments(),
  review = "a".repeat(64);
const apply = publicationSQL(baseline, docs, review),
  undo = rollbackSQL(baseline, docs, review);
const rows = async (table) =>
  (await db.query("select * from " + table + " order by 1,2")).rows;
async function rejects(sql, pattern) {
  await assert.rejects(db.exec(sql), pattern);
  await db.exec("rollback;reset role");
}
try {
  const admin = await provision(c),
    other = await provision(c),
    employee = await provision(c, c.orgs.A, "colaborador_empresa");
  await accept(c, admin);
  await accept(c, other);
  const oldRows = await rows("public.legal_documents"),
    oldAccepts = await rows("private.legal_acceptances");
  await test("L050-01 publication is two new rows; old content and acceptances preserved", async () => {
    await db.exec(apply);
    assert.equal((await rows("public.legal_documents")).length, 4);
    const previous = (await rows("public.legal_documents"))
      .filter((x) => !x.current)
      .map((x) => ({ ...x, current: true }));
    assert.deepEqual(previous, oldRows);
    assert.deepEqual(await rows("private.legal_acceptances"), oldAccepts);
    assert.equal((await snapshot(db)).current.length, 2);
  });
  await test("L050-02 stale snapshot and repeated publication fail without new effects", async () => {
    await rejects(apply, /legal_expected_version_mismatch/);
    assert.equal((await rows("public.legal_documents")).length, 4);
  });
  await test("L050-03 rollback before acceptance preserves added immutable rows and original acceptances", async () => {
    await db.exec(undo);
    assert.deepEqual((await snapshot(db)).current, baseline.current);
    assert.deepEqual(await rows("private.legal_acceptances"), oldAccepts);
    assert.equal((await rows("public.legal_documents")).length, 4);
    await rejects(apply, /legal_version_or_acceptance_reused/);
  });
  const docs2 = await fixtureDocuments("local-050-v2", "local-050-material-v2");
  const snap2 = await snapshot(db),
    apply2 = publicationSQL(snap2, docs2, review),
    undo2 = rollbackSQL(snap2, docs2, review);
  await test("L050-04 later insertion failure rolls back both current flags and new documents", async () => {
    const broken = [docs2[0], { ...docs2[1], kind: "invalid-kind" }];
    await rejects(publicationSQL(snap2, broken, review), /check constraint/);
    assert.deepEqual((await snapshot(db)).current, snap2.current);
    assert.equal((await rows("public.legal_documents")).length, 4);
  });
  await test("L050-05 unpublished versions cannot be accepted; prior access unchanged", async () => {
    await assert.rejects(
      accept(c, admin, docs2[0].version),
      /legal_version_changed/,
    );
    await identity(db, admin);
    assert.equal((await c.rpc("access_session")).legal_required, false);
    await db.exec("commit");
  });
  await db.exec(apply2);
  await test("L050-06 material revision requires renewed company acceptance and rejects old browser version", async () => {
    await identity(db, admin);
    assert.equal((await c.rpc("access_session")).legal_required, true);
    await db.exec("commit");
    await assert.rejects(accept(c, admin), /legal_version_changed/);
    await accept(c, admin, docs2[0].version);
    await accept(c, admin, docs2[0].version);
    const current = await rows("private.legal_acceptances");
    assert.equal(current.length, oldAccepts.length + 1);
    for (const old of oldAccepts)
      assert.deepEqual(
        current.find(
          (x) =>
            x.organization_id === old.organization_id &&
            x.terms_acceptance === old.terms_acceptance,
        ),
        old,
      );
    const added = current.find((x) => x.terms_version === docs2[0].version);
    assert.equal(added.user_id, admin.user_id);
    assert.equal(added.organization_id, admin.organization_id);
    assert.ok(added.accepted_at);
    assert.equal(added.privacy_version, docs2[1].version);
  });
  await test("L050-07 employee denied; company A acceptance never clears company B", async () => {
    await assert.rejects(
      accept(c, employee, docs2[0].version),
      /access_denied/,
    );
    await identity(db, other);
    assert.equal((await c.rpc("access_session")).legal_required, true);
    await db.exec("commit");
    await identity(db, admin);
    assert.equal((await c.rpc("access_session")).legal_required, false);
    await db.exec("commit");
  });
  await test("L050-08 public current read works; direct writes/private acceptances denied to public roles", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec("begin;set local role " + role);
      if (role !== "service_role")
        assert.equal(
          (await db.query("select * from public.legal_documents where current"))
            .rows.length,
          2,
        );
      await db.exec("savepoint access_check");
      await assert.rejects(
        db.query("select * from private.legal_acceptances"),
        /permission denied/,
      );
      await db.exec("rollback to savepoint access_check");
      await assert.rejects(
        db.exec("update public.legal_documents set current=false"),
        /permission denied/,
      );
      await db.exec("rollback;reset role");
    }
  });
  await test("L050-09 immutability denies retroactive body replacement and deletion", async () => {
    await rejects(
      "begin;update public.legal_documents set body='replacement' where current;commit",
      /legal_version_immutable/,
    );
    await rejects(
      "begin;delete from public.legal_documents where not current;commit",
      /legal_history_immutable/,
    );
  });
  await test("L050-10 rollback after acceptance and rollback over newer publication both refused", async () => {
    await rejects(undo2, /legal_rollback_has_acceptances/);
    await rejects(
      undo,
      /legal_expected_version_mismatch|legal_rollback_version_mismatch/,
    );
    assert.equal((await snapshot(db)).current[0].version, docs2[0].version);
  });
  await test("L050-11 wrong body fingerprint, schema fingerprint and reused acceptance group refused", async () => {
    const now = await snapshot(db),
      next = await fixtureDocuments("local-050-v3", "local-050-material-v3");
    const bad = structuredClone(now);
    bad.current[0].row_sha256 = "0".repeat(64);
    await rejects(
      publicationSQL(bad, next, review),
      /legal_expected_version_mismatch/,
    );
    await rejects(
      publicationSQL({ ...now, contract_sha256: "0".repeat(64) }, next, review),
      /legal_contract_changed/,
    );
    await rejects(
      publicationSQL(
        now,
        next.map((d) => ({
          ...d,
          acceptance_version: docs2[0].acceptance_version,
        })),
        review,
      ),
      /legal_version_or_acceptance_reused/,
    );
  });
  await test("L050-12 SQL literals remain data even with quotes, backslashes and dollar delimiters", async () => {
    const now = await snapshot(db),
      next = await fixtureDocuments("local-050-v3", "local-050-material-v3");
    next[0].body += "\nLiteral: ' \\ $legal050$; SELECT 1; --";
    await db.exec(publicationSQL(now, next, review));
    assert.equal(
      (
        await db.query(
          "select body from public.legal_documents where current and kind='terms'",
        )
      ).rows[0].body,
      next[0].body,
    );
  });
  await test("L050-13 empty identification and unapproved personal disclosure block generation", async () => {
    const config = JSON.parse(
      await readFile("docs/legal-050/config.example.json", "utf8"),
    );
    await assert.rejects(
      prepare(config, baseline),
      /legal_config_invalid_operator_name/,
    );
    config.public_identity.operator_name = "CPF: não divulgar";
    await assert.rejects(prepare(config, baseline), /legal_config_invalid/);
    config.public_identity.cpf = "";
    await assert.rejects(
      prepare(config, baseline),
      /legal_config_fields_identity/,
    );
  });
  await test("L050-14 public copy preserved, explicit owner/legal review and exact review hash required", async () => {
    // Reserved example.org contacts only in this isolated test, never a publication artifact.
    const config = JSON.parse(
      await readFile("docs/legal-050/config.example.json", "utf8"),
    );
    Object.assign(config.public_identity, {
      operator_name: "Responsável do ensaio local",
      support_email: "suporte@syzia-ensaio.example.org",
      privacy_email: "privacidade@syzia-ensaio.example.org",
    });
    const p = await prepare(config, baseline);
    assert.match(p.documents[0].body, /três dias/);
    assert.match(p.documents[0].body, /pessoa física/);
    assert.doesNotMatch(
      p.documents.map((d) => d.body).join("\n"),
      /MP-01|webhook|Supabase|migration/i,
    );
    assert.throws(
      () => compile(config, baseline, p, p.reviewHash),
      /legal_publication_review_pending/,
    );
    for (const k of Object.keys(config.publication_review))
      config.publication_review[k] =
        k === "review_reference" ? "avaliação local isolada" : true;
    assert.throws(
      () => compile(config, baseline, p, "0".repeat(64)),
      /legal_review_hash_mismatch/,
    );
    assert.match(
      compile(config, baseline, p, p.reviewHash).apply,
      /pg_advisory_xact_lock/,
    );
  });
} finally {
  await db.close();
}
