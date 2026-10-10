import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { users } from "../support/consumer-db.mjs";
// Synthetic illustrations and generated photographic examples; never actual customer work.
export async function seedPresence(c) {
  const files = new Map(),
    codes = [];
  await c.db.exec("begin");
  try {
    for (let n = 0; n < 3; n++) {
      const colors =
        n === 0
          ? ["#e0e8d5", "#2b5343"]
          : n === 1
            ? ["#dedbd0", "#968977"]
            : ["#d4e7d7", "#527b66"];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="440"><rect width="720" height="440" fill="${colors[0]}"/><circle cx="540" cy="95" r="150" fill="#ffffff" opacity=".15"/><path d="M115 265h495l-25-87-100-55H280l-90 100h-65Z" fill="${colors[1]}"/><path d="m290 140-68 77h285l-47-77Z" fill="#c5d8d0"/><circle cx="220" cy="272" r="48" fill="#263b35"/><circle cx="515" cy="272" r="48" fill="#263b35"/><circle cx="220" cy="272" r="25" fill="#adbaad"/><circle cx="515" cy="272" r="25" fill="#adbaad"/>${n === 1 ? '<path d="m300 235 70 10m70-6 50 14m-214-49 33 4" stroke="#695d4b" stroke-width="7" opacity=".4"/>' : '<path d="m575 55 7 22 22 7-22 7-7 22-7-22-22-7 22-7Z" fill="#fcffe2"/>'}<text x="35" y="395" fill="#415548" font-family="sans-serif" font-size="15" letter-spacing="2">ILUSTRAÇÃO FICTÍCIA • ${n === 1 ? "ANTES" : n === 2 ? "DEPOIS" : "CUIDADO EM CADA DETALHE"}</text></svg>`;
      const data = await sharp(Buffer.from(svg)).png().toBuffer(),
        meta = await sharp(data).metadata();
      await c.as("adminA");
      const f = await c.rpc("consumer_reserve_company_media", {
        p_org: c.orgs.A,
        p_mime: "image/png",
        p_size: data.length,
        p_key: randomUUID(),
      });
      await c.db.exec("reset role;set local role service_role");
      await c.rpc("consumer_finalize_company_media", {
        p_code: f.code,
        p_user: users.adminA,
        p_sha256: createHash("sha256").update(data).digest("hex"),
        p_size: data.length,
        p_width: meta.width,
        p_height: meta.height,
      });
      files.set(f.code, { data, mime: "image/png" });
      codes.push(f.code);
    }
    const identity = {};
    for (const k of ["A", "B"]) {
      identity[k] = {};
      for (const kind of ["logo", "cover"]) {
        const data = await sharp(
          await readFile(
            `assets/demo/${k === "A" ? "auto" : "horizonte"}-${kind === "cover" ? "photo.png" : "logo.svg"}`,
          ),
        )
          .resize({
            width: kind === "cover" ? 1440 : 320,
            withoutEnlargement: true,
          })
          .toFormat(kind === "cover" ? "webp" : "png")
          .toBuffer();
        const mime = kind === "cover" ? "image/webp" : "image/png";
        const meta = await sharp(data).metadata();
        await c.as("admin" + k);
        const f = await c.rpc("consumer_reserve_company_media", {
          p_org: c.orgs[k],
          p_mime: mime,
          p_size: data.length,
          p_key: randomUUID(),
        });
        await c.db.exec("reset role;set local role service_role");
        await c.rpc("consumer_finalize_company_media", {
          p_code: f.code,
          p_user: users["admin" + k],
          p_sha256: createHash("sha256").update(data).digest("hex"),
          p_size: data.length,
          p_width: meta.width,
          p_height: meta.height,
        });
        files.set(f.code, { data, mime });
        identity[k][kind] = f.code;
      }
    }
    await c.as("adminB");
    await c.rpc("consumer_branding_save", {
      p_org: c.orgs.B,
      p_revision: 0,
      p_data: {
        primary_color: "#653d29",
        ...identity.B,
        category_order: [],
        service_order: [],
      },
    });
    const publicB = await c.rpc("consumer_public_page", {
      p_slug: "horizonte-ficticio",
    });
    await c.rpc("consumer_portfolio_save", {
      p_org: c.orgs.B,
      p_code: null,
      p_data: {
        title: "Um ambiente para estar bem",
        description:
          "Luz natural, materiais acolhedores e espaço para aproveitar o dia.",
        service: publicB.services.find((s) => s.price_mode === "fixed").code,
        format: "gallery",
        images: [identity.B.cover],
        position: 0,
        active: true,
      },
    });
    await c.rpc("consumer_publish_page", {
      p_org: c.orgs.B,
      p_manual: c.manuals.B,
      p_enabled: true,
      p_show_prices: true,
      p_expected_revision: 1,
    });
    await c.as("adminA");
    const publicA = await c.rpc("consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    });
    await c.rpc("consumer_branding_save", {
      p_org: c.orgs.A,
      p_revision: 0,
      p_data: {
        primary_color: "#193e35",
        ...identity.A,
        category_order: ["Essenciais", "Interior", "Proteção"],
        service_order: ["fixed", "from", "quote"].map(
          (mode) => publicA.services.find((s) => s.price_mode === mode).code,
        ),
      },
    });
    await c.rpc("consumer_portfolio_save", {
      p_org: c.orgs.A,
      p_code: null,
      p_data: {
        title: "Renovação do cuidado • exemplo fictício",
        description:
          "Um estudo visual de antes e depois. Imagens ilustrativas para demonstração do portfólio.",
        format: "before_after",
        images: [codes[1], codes[2]],
        position: 0,
        active: true,
      },
    });
    await c.rpc("consumer_portfolio_save", {
      p_org: c.orgs.A,
      p_code: null,
      p_data: {
        title: "Detalhes em destaque · demonstração",
        description:
          "Imagem fotográfica sintética. Não representa serviço realizado nem veículo de cliente real.",
        service: publicA.services.find((s) => s.price_mode === "fixed").code,
        format: "gallery",
        images: [identity.A.cover],
        position: 1,
        active: true,
      },
    });
    await c.rpc("consumer_publish_page", {
      p_org: c.orgs.A,
      p_manual: c.manuals.A,
      p_enabled: true,
      p_show_prices: true,
      p_expected_revision: 1,
    });
    await c.db.exec("commit;reset role");
    return files;
  } catch (e) {
    await c.db.exec("rollback;reset role");
    throw e;
  }
}
