// Sharp security hotfix over 049. All images, identities and services are synthetic.
// No external API, database, credentials, brand files or production data are used.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync, crc32 } from "node:zlib";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { sanitizeImage, MAX_IMAGE_BYTES } from "../server/images.mjs";
import { createAttachmentServer } from "../server/attachments.mjs";

const runFile = promisify(execFile);
const formats = [
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
];
const hash = (data) => createHash("sha256").update(data).digest("hex");
const solid = (width = 32, height = 20) =>
  sharp({ create: { width, height, channels: 3, background: "#d12468" } });
const image = (format) =>
  solid()
    [format]()
    .withMetadata({
      exif: { IFD0: { Artist: "SYNTHETIC-PRIVATE-METADATA" } },
    })
    .withXmp(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:description="SYNTHETIC-PRIVATE-METADATA"/></rdf:RDF></x:xmpmeta>',
    )
    .toBuffer();
const safeRejection = (bytes, mime, message) =>
  assert.rejects(sanitizeImage(bytes, mime), (error) => {
    assert.equal(error.message, message);
    return true;
  });

test("SH01 resolved Sharp and native libraries satisfy the reviewed security fixes", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.dependencies.sharp, "0.35.5");
  assert.equal(lock.packages["node_modules/sharp"].version, "0.35.5");
  assert.equal(sharp.versions.sharp, "0.35.5");
  for (const [library, minimum] of Object.entries({
    vips: "8.18.7",
    heif: "1.23.5",
    rsvg: "2.63.2",
  })) {
    const actual = sharp.versions[library];
    assert.ok(actual, `${library} native version must be verifiable`);
    const a = actual.split(".").map(Number),
      b = minimum.split(".").map(Number);
    assert.ok(
      a[0] > b[0] ||
        (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))),
      `${library} ${actual} < ${minimum}`,
    );
  }
});

for (const [format, mime] of formats) {
  test(`SH02-${format} re-encodes with correct return contract, strips metadata and preserves pixels`, async () => {
    const original = await image(format);
    const sourceMetadata = await sharp(original).metadata();
    assert.ok(sourceMetadata.exif);
    assert.ok(sourceMetadata.icc);
    assert.ok(sourceMetadata.xmp);
    const output = await sanitizeImage(original, mime);
    assert.deepEqual(Object.keys(output).sort(), [
      "data",
      "height",
      "mime",
      "sha256",
      "size",
      "width",
    ]);
    assert.ok(Buffer.isBuffer(output.data));
    assert.equal(output.mime, mime);
    assert.equal(output.size, output.data.length);
    assert.equal(output.width, 32);
    assert.equal(output.height, 20);
    assert.equal(output.sha256, hash(output.data));
    assert.ok(output.size <= MAX_IMAGE_BYTES);
    assert.notDeepEqual(output.data, original);
    const metadata = await sharp(output.data).metadata();
    assert.equal(metadata.format, format);
    for (const key of ["exif", "icc", "iptc", "xmp", "orientation"])
      assert.equal(metadata[key], undefined, key);
    assert.equal(
      output.data.includes(Buffer.from("SYNTHETIC-PRIVATE-METADATA")),
      false,
    );
    const pixel = await sharp(output.data).removeAlpha().raw().toBuffer();
    for (const [i, expected] of [209, 36, 104].entries())
      assert.ok(Math.abs(pixel[i] - expected) <= 6);
    if (format === "png") {
      assert.deepEqual(
        await sharp(original).raw().toBuffer(),
        await sharp(output.data).raw().toBuffer(),
      );
    } else {
      const expected = await sharp(original, {
        limitInputPixels: 20000000,
        failOn: "warning",
        animated: true,
      })
        .rotate()
        [format]({ quality: 88 })
        .toBuffer();
      assert.deepEqual(
        output.data,
        expected,
        "existing quality 88 encoding contract",
      );
    }
  });

  test(`SH03-${format} truncation and corrupt decoder input return a safe error`, async () => {
    const original = await image(format);
    await safeRejection(
      original.subarray(0, 12),
      mime,
      "invalid_image_content",
    );
    const damaged = Buffer.concat([
      original.subarray(0, 12),
      Buffer.alloc(80, 0xa5),
    ]);
    await safeRejection(damaged, mime, "invalid_image_content");
  });

  test(`SH04-${format} refuses a mismatched declared MIME`, async () => {
    const original = await image(format);
    for (const other of formats.map((f) => f[1]).filter((m) => m !== mime))
      await safeRejection(original, other, "invalid_image_type");
    await safeRejection(
      original,
      `${mime}; charset=utf-8`,
      "invalid_image_type",
    );
  });
}

test("SH05 refuses SVG, GIF and HEIF signatures even when declared as an allowed format", async () => {
  const inputs = [
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>',
    ),
    await solid().gif().toBuffer(),
    Buffer.from([
      0,
      0,
      0,
      24,
      ...Buffer.from("ftypavif"),
      0,
      0,
      0,
      0,
      ...Buffer.from("avifmif1"),
    ]),
  ];
  for (const input of inputs)
    for (const [, mime] of formats)
      await safeRejection(input, mime, "invalid_image_type");
});

test("SH06 input type and exact 12-byte / 5-MiB boundaries remain enforced", async () => {
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
  for (const input of [
    undefined,
    "image",
    new Uint8Array(12),
    Buffer.alloc(11),
    Buffer.alloc(MAX_IMAGE_BYTES + 1),
  ])
    await safeRejection(input, "image/png", "invalid_image_size");
  const jpeg = await solid().jpeg().toBuffer();
  await safeRejection(
    jpeg.subarray(0, 12),
    "image/jpeg",
    "invalid_image_content",
  );
  const padded = Buffer.alloc(MAX_IMAGE_BYTES);
  jpeg.copy(padded);
  assert.equal((await sanitizeImage(padded, "image/jpeg")).width, 32);
});

test("SH07 rejects width or height over 8000 and accepts the dimension boundary", async () => {
  for (const [width, height] of [
    [8001, 1],
    [1, 8001],
  ])
    await safeRejection(
      await solid(width, height).png().toBuffer(),
      "image/png",
      "invalid_image_content",
    );
  for (const [width, height] of [
    [8000, 1],
    [1, 8000],
  ]) {
    const output = await sanitizeImage(
      await solid(width, height).png().toBuffer(),
      "image/png",
    );
    assert.deepEqual([output.width, output.height], [width, height]);
  }
});

test("SH08 rejects more than 20 million pixels and accepts exactly 20 million", async () => {
  await safeRejection(
    await solid(5001, 4000).png().toBuffer(),
    "image/png",
    "invalid_image_content",
  );
  const output = await sanitizeImage(
    await solid(5000, 4000).png().toBuffer(),
    "image/png",
  );
  assert.deepEqual([output.width, output.height], [5000, 4000]);
});

test("SH09 rejects animated WebP and GIF before storing any frame", async () => {
  const raw = Buffer.alloc(4 * 8 * 3);
  raw.fill(255, 0, 4 * 4 * 3);
  const options = { raw: { width: 4, height: 8, channels: 3, pageHeight: 4 } };
  const animated = await sharp(raw, options)
    .webp({ lossless: true, delay: [100, 100], loop: 0 })
    .toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  await safeRejection(animated, "image/webp", "invalid_image_content");
  const gif = await sharp(raw, options)
    .gif({ delay: [100, 100], loop: 0 })
    .toBuffer();
  assert.equal((await sharp(gif, { animated: true }).metadata()).pages, 2);
  await safeRejection(gif, "image/png", "invalid_image_type");
});

test("SH10 EXIF orientation 6 is applied to dimensions and actual pixels, then removed", async () => {
  const raw = Buffer.alloc(20 * 12 * 3);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 20; x++) {
      const i = (y * 20 + x) * 3;
      raw[i] = x < 10 ? 255 : 0;
      raw[i + 2] = x < 10 ? 0 : 255;
    }
  const original = await sharp(raw, {
    raw: { width: 20, height: 12, channels: 3 },
  })
    .png()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  assert.equal((await sharp(original).metadata()).orientation, 6);
  const output = await sanitizeImage(original, "image/png");
  assert.deepEqual([output.width, output.height], [12, 20]);
  assert.equal((await sharp(output.data).metadata()).orientation, undefined);
  const pixels = await sharp(output.data).raw().toBuffer();
  assert.deepEqual([...pixels.subarray(0, 3)], [255, 0, 0]);
  assert.deepEqual([...pixels.subarray(-3)], [0, 0, 255]);
});

// Construct a valid, synthetic indexed PNG whose decoded RGB output exceeds 5 MiB.
// This exercises the output guard independently of the input and pixel guards.
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}
function largeIndexedPng() {
  const width = 2000,
    height = 1500;
  let state = 0x4a713c95;
  function byte() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 255;
  }
  const palette = Buffer.alloc(256 * 3);
  for (let i = 0; i < palette.length; i++) palette[i] = byte();
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 1; x <= width; x++) rows[y * (width + 1) + x] = byte();
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 3;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("PLTE", palette),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
test("SH11 rejects oversized encoded output even when input and dimensions are within bounds", async () => {
  const input = largeIndexedPng();
  assert.ok(input.length < MAX_IMAGE_BYTES);
  const expanded = await sharp(input).png().toBuffer();
  assert.ok(
    expanded.length > MAX_IMAGE_BYTES,
    `synthetic output must exceed limit: ${expanded.length}`,
  );
  await safeRejection(input, "image/png", "invalid_image_content");
});

test("SH12 approved brand export script retains exact crops, copies and 32x32 favicon", async () => {
  const directory = await mkdtemp(join(tmpdir(), "syzia-sharp-brand-"));
  try {
    await mkdir(join(directory, "brand/syzia"), { recursive: true });
    const width = 1536,
      height = 1024,
      pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        pixels[i] = x % 256;
        pixels[i + 1] = y % 256;
        pixels[i + 2] = (x + y) % 256;
      }
    await writeFile(
      join(directory, "brand/syzia/approved-reference.png"),
      await sharp(pixels, { raw: { width, height, channels: 3 } })
        .png()
        .toBuffer(),
    );
    await runFile(
      process.execPath,
      [resolve("scripts/syzia-032/brand-assets.mjs")],
      { cwd: directory },
    );
    const manifest = JSON.parse(
      await readFile(
        join(directory, "brand/syzia/assets-manifest.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.assets.length, 8);
    for (const asset of manifest.assets) {
      const actual = await sharp(join(directory, asset.path))
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.deepEqual(
        [actual.info.width, actual.info.height],
        [asset.width, asset.height],
      );
      const expected = Buffer.alloc(asset.width * asset.height * 3);
      for (let y = 0; y < asset.height; y++) {
        const start =
          ((asset.sourceRect.top + y) * width + asset.sourceRect.left) * 3;
        pixels.copy(
          expected,
          y * asset.width * 3,
          start,
          start + asset.width * 3,
        );
      }
      assert.deepEqual(actual.data, expected, asset.path);
    }
    const path = (name) =>
      join(directory, `public/brand/syzia/syzia-${name}.png`);
    for (const theme of ["dark", "light"]) {
      assert.deepEqual(
        await readFile(path(`logo-${theme}`)),
        await readFile(path(`login-${theme}`)),
      );
      assert.deepEqual(
        await readFile(path(`horizontal-${theme}`)),
        await readFile(path(`header-${theme}`)),
      );
    }
    const icon = await sharp(path("favicon")).metadata();
    assert.deepEqual([icon.format, icon.width, icon.height], ["png", 32, 32]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SH13 private HTTP uploads preserve authorization, ticket forwarding, tenant isolation and safe errors", async () => {
  const records = new Map(),
    storage = new Map(),
    tickets = new Map(),
    calls = [],
    logs = [];
  const origin = "http://127.0.0.1:5173";
  const users = Object.fromEntries(
    ["A", "B"].map((id) => [
      id,
      {
        id: `synthetic-user-${id}`,
        session: `synthetic-session-${id}`,
        jwt: `synthetic.${Buffer.from(JSON.stringify({ session_id: `synthetic-session-${id}` })).toString("base64url")}.test`,
      },
    ]),
  );
  let uploads = 0,
    downloads = 0,
    finalized = 0;
  const denied = () => ({
    error: { code: "42501", message: "synthetic_private_access_denied" },
  });
  const api = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name !== "access_media") return denied();
      const user = Object.values(users).find((u) => u.id === args.p_user);
      const a = args.p_args,
        record = records.get(a.p_code);
      if (
        !user ||
        user.session !== args.p_session ||
        a.p_user !== user.id ||
        record?.owner !== user.id
      )
        return denied();
      if (args.p_operation === "consumer_gateway_download") {
        const ticket = tickets.get(a.p_ticket);
        if (
          !ticket ||
          ticket.owner !== user.id ||
          ticket.code !== a.p_code ||
          record.state !== "ready"
        )
          return denied();
        tickets.delete(a.p_ticket);
      } else if (args.p_operation === "consumer_finalize_attachment") {
        assert.equal(a.p_sha256, hash(storage.get(record.path)));
        assert.equal(a.p_size, storage.get(record.path).length);
        assert.deepEqual([a.p_width, a.p_height], [32, 20]);
        record.size = a.p_size;
        record.state = "ready";
        finalized++;
      } else assert.equal(args.p_operation, "consumer_gateway_attachment");
      return { data: record };
    },
    storage: {
      from: (bucket) => {
        assert.equal(bucket, "consumer-private");
        return {
          upload: async (path, bytes, options) => {
            assert.equal(options.upsert, false);
            uploads++;
            storage.set(path, bytes);
            return { error: null };
          },
          download: async (path) => {
            downloads++;
            return { data: new Blob([storage.get(path)]) };
          },
        };
      },
    },
  };
  const app = createAttachmentServer({
    server: api,
    origin,
    log: (row) => logs.push(row),
    verifier: {
      auth: {
        getUser: async (jwt) => {
          const user = Object.values(users).find((u) => u.jwt === jwt);
          return user
            ? { data: { user: { id: user.id } } }
            : { data: { user: null }, error: { message: "denied" } };
        },
      },
    },
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const headers = (id, mime) => ({
    Origin: origin,
    Authorization: `Bearer ${users[id].jwt}`,
    "Content-Type": mime,
  });
  const response = async (path, options) => {
    const result = await fetch(base + path, options);
    const bytes = Buffer.from(await result.arrayBuffer());
    return { status: result.status, headers: result.headers, bytes };
  };
  try {
    let n = 0;
    for (const [format, mime] of formats) {
      const bytes = await image(format),
        code = `f_${(++n).toString(16).padStart(24, "0")}`;
      const path = `/attachments/${code}`,
        body = bytes;
      records.set(code, {
        owner: users.A.id,
        path: `tenant-A/${code}`,
        mime,
        size: bytes.length,
        state: "pending",
      });
      assert.equal(
        (
          await response(path, {
            method: "POST",
            headers: { Origin: origin },
            body,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await response(path, {
            method: "POST",
            headers: { ...headers("A", mime), Authorization: "Bearer invalid" },
            body,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await response(path, {
            method: "POST",
            headers: headers("B", mime),
            body,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await response(path, {
            method: "POST",
            headers: {
              ...headers("A", mime),
              Origin: "http://untrusted.invalid",
            },
            body,
          })
        ).status,
        403,
      );
      assert.equal(uploads, n - 1, "rejected uploads never reach Storage");
      const sent = await response(path, {
        method: "POST",
        headers: headers("A", mime),
        body,
      });
      assert.equal(sent.status, 200);
      assert.equal(JSON.parse(sent.bytes).code, code);
      assert.equal("url" in JSON.parse(sent.bytes), false);
      const stored = storage.get(`tenant-A/${code}`);
      assert.equal((await sharp(stored).metadata()).exif, undefined);
      assert.equal(
        (
          await response(path, {
            method: "POST",
            headers: headers("A", mime),
            body,
          })
        ).status,
        200,
      );
      assert.equal(uploads, n, "already ready upload is idempotent");
      assert.equal(
        (await response(path, { headers: headers("A", mime) })).status,
        403,
      );
      const ticket = `synthetic-ticket-${format}`;
      tickets.set(ticket, { owner: users.A.id, code });
      assert.equal(
        (
          await response(path, {
            headers: { ...headers("B", mime), "X-Download-Ticket": ticket },
          })
        ).status,
        403,
      );
      assert.equal(downloads, n - 1, "rejected reads never reach Storage");
      const downloaded = await response(path, {
        headers: { ...headers("A", mime), "X-Download-Ticket": ticket },
      });
      assert.equal(downloaded.status, 200);
      assert.deepEqual(downloaded.bytes, stored);
      assert.equal(downloaded.headers.get("content-type"), mime);
      assert.equal(downloaded.headers.get("cache-control"), "no-store");
      assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
      assert.equal(
        downloaded.headers.get("content-security-policy"),
        "default-src 'none'",
      );
      assert.equal(
        (
          await response(path, {
            headers: { ...headers("A", mime), "X-Download-Ticket": ticket },
          })
        ).status,
        403,
      );
      assert.equal(
        (await response(`/media/${code}`, { headers: { Origin: origin } }))
          .status,
        404,
      );
    }
    const invalidCode = `f_${"e".repeat(24)}`,
      invalid = Buffer.from([255, 216, 255, ...Array(50).fill(0)]);
    records.set(invalidCode, {
      owner: users.B.id,
      path: `tenant-B/${invalidCode}`,
      mime: "image/jpeg",
      size: invalid.length,
      state: "pending",
    });
    const rejected = await response(`/attachments/${invalidCode}`, {
      method: "POST",
      headers: headers("B", "image/jpeg"),
      body: invalid,
    });
    assert.equal(rejected.status, 400);
    assert.equal(JSON.parse(rejected.bytes).error, "invalid_image_content");
    assert.equal(uploads, 3);
    assert.equal(finalized, 3);
    assert.equal(downloads, 3);
    assert.ok(calls.every((call) => call.name === "access_media"));
    for (const secret of [
      ...Object.values(users).map((u) => u.jwt),
      "synthetic-ticket-",
      "SYNTHETIC-PRIVATE-METADATA",
    ])
      assert.equal(
        JSON.stringify(logs).includes(secret),
        false,
        "no sensitive data in logs",
      );
  } finally {
    app.closeAllConnections();
    await new Promise((r) => app.close(r));
  }
});
