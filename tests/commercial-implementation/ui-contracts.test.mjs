import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  canSeeCommercial,
  manualStages,
} from "../../src/platform-commercial/policy.ts";
const access = (roles = [], kind = "person", permissions = []) => ({
  roles,
  identity: { kind, permissions },
  profile: { id: "fictitious", display_name: "Marina", status: "active" },
  organizations: [],
  memberships: [],
});
test("UI01 visibility uses platform identity and explicit grant, never a tenant role alone", () => {
  assert.equal(canSeeCommercial(null), false);
  assert.equal(canSeeCommercial(access(["super_admin"])), true);
  assert.equal(
    canSeeCommercial(access([], "syzia_staff", ["commercial.read"])),
    true,
  );
  assert.equal(
    canSeeCommercial(access(["admin_empresa"], "person", ["commercial.read"])),
    false,
  );
  assert.equal(canSeeCommercial(access([], "syzia_staff", [])), false);
});
test("UI02 derived states have no manual selector", () => {
  for (const state of [
    "trialing",
    "paying",
    "activation_sent",
    "demo_sent",
    "demo_accessed",
    "registration_started",
  ])
    assert.equal(manualStages.includes(state), false);
});
for (const [name, width, height] of [
  ["horizontal-dark", 360, 163],
  ["horizontal-light", 371, 166],
  ["logo-dark", 325, 337],
  ["logo-light", 310, 336],
  ["symbol-dark", 207, 208],
  ["symbol-light", 208, 210],
])
  test(
    "UI03 real transparent alpha and unchanged dimensions: " + name,
    async () => {
      const { data, info } = await sharp(
        await readFile("public/brand/syzia/syzia-" + name + ".png"),
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(info.width, width);
      assert.equal(info.height, height);
      let transparent = 0,
        partial = 0,
        opaque = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] === 0) transparent++;
        else if (data[i] === 255) opaque++;
        else partial++;
      }
      assert.ok(transparent > (width * height) / 2);
      assert.ok(partial > 0);
      assert.ok(opaque > 0);
    },
  );
test("UI04 templates reuse PublicCompany; no duplicated request/checkout implementation", async () => {
  const picker = await readFile("src/consumer/TemplatePicker.tsx", "utf8");
  assert.doesNotMatch(picker, /fetch\(|supabase|card_token|consumer_create/);
  const source = await readFile("src/consumer/Consumer.tsx", "utf8");
  assert.match(source, /template=\{company\?\.template\}/);
  assert.match(source, /consumer_create_multi_request/);
  assert.match(source, /consumer_complete_execution/);
});
