import {
  emptyItem,
  initialQuantity,
  priceBreakdown,
} from "../../src/consumer/request-items.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
test("061 quantity: database upgrade and server validation", async (t) => {
  const c = await fixture();
  try {
    const calc = {
      items: [
        {
          name: "Serviço",
          unit_cents: 12000,
          quantity: 1,
          duration_minutes: 60,
        },
        {
          name: "Adicional",
          unit_cents: 1000,
          quantity: 1,
          duration_minutes: 10,
        },
      ],
      total_cents: 13000,
      duration_minutes: 70,
      direct_booking: true,
    };
    const service = {
      quantity_enabled: true,
      quantity_min: 1,
      quantity_max: 5,
      quantity_duration: "fixed",
      duration_minutes: 60,
    };
    const run = async (s, e) =>
      (
        await c.rawSQL(
          "select private.quantity_selection($1::jsonb,$2::jsonb,$3::jsonb) r",
          [JSON.stringify(s), JSON.stringify(e), JSON.stringify(calc)],
        )
      ).rows[0].r;
    await t.test(
      "fixed duration, integer server price, add-on once",
      async () => {
        let r = await run(service, { quantity: 3 });
        assert.equal(r.total_cents, 37000);
        assert.equal(r.duration_minutes, 70);
        assert.equal(r.items[0].quantity, 3);
        assert.equal(r.items[1].quantity, 1);
      },
    );
    await t.test("proportional duration", async () =>
      assert.equal(
        (
          await run(
            { ...service, quantity_duration: "proportional" },
            { quantity: 3 },
          )
        ).duration_minutes,
        190,
      ),
    );
    await t.test("manual cannot confirm automatically", async () =>
      assert.equal(
        (
          await run(
            { ...service, quantity_duration: "manual" },
            { quantity: 3 },
          )
        ).direct_booking,
        false,
      ),
    );
    await t.test("invalid, fractional, overflow, legacy disabled", async () => {
      for (const q of [0, -1, 1.5, 6, 1000, "2", null])
        await assert.rejects(run(service, { quantity: q }), /quantity/);
      await assert.rejects(run({}, { quantity: 2 }), /disabled/);
      assert.equal((await run({}, {})).total_cents, 13000);
    });
  } finally {
    await c.db.close();
  }
});

test("061 frontend leaves disabled quantity out of legacy payload and uses official per-unit estimate", () => {
  assert.equal(
    Object.hasOwn(
      emptyItem("legacy", initialQuantity({ quantity_enabled: false })),
      "quantity",
    ),
    false,
  );
  assert.equal(
    emptyItem(
      "new",
      initialQuantity({ quantity_enabled: true, quantity_min: 2 }),
    ).quantity,
    2,
  );
  assert.equal(
    priceBreakdown([{ price_mode: "fixed", price_cents: 12000, quantity: 3 }])
      .expected,
    36000,
  );
  assert.equal(
    priceBreakdown([{ price_mode: "quote", price_cents: null, quantity: 3 }])
      .expected,
    null,
  );
});
