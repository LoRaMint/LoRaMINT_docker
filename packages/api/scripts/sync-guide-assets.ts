// Regenerates the guide assets under public/guides/esp32/ from their sources in
// packages/esp32.
//
// The API image is built with packages/api as its Docker context, so it cannot
// reach packages/esp32 at build time - the images, examples and the library ZIP
// offered on /guides/esp32 have to be committed copies. Copying them by hand is
// what let the shipped loramint.zip go stale and hand out a library version that
// could not transmit. Run this script instead:
//
//     bun run sync-guide-assets
//
// CI runs it too and fails when the result differs from what is committed, so
// the copies cannot drift again. That requires byte-identical output, which is
// why the ZIP is written here with fixed timestamps and stored (uncompressed)
// entries rather than shelling out to `zip`.

import { readdir } from "node:fs/promises";

const root = `${import.meta.dir}/../../..`;
const esp32 = `${root}/packages/esp32`;
const guide = `${root}/packages/api/public/guides/esp32`;

const IMAGES = [
  "parts.jpg",
  "esp32_wiring.png",
  "thonny_interpreter.png",
  "thonny_flash.png",
  "thonny_upload.png",
];

// Paths relative to packages/esp32/examples, mirrored one to one under
// downloads/ - the two folders hold files of the same name.
const EXAMPLES = [
  "deepsleep/main.py",
  "deepsleep/send_bme280.py",
  "deepsleep/send_ds18b20.py",
  "lightsleep/main.py",
  "lightsleep/send_bme280.py",
  "lightsleep/send_ds18b20.py",
];

//====================================
// DETERMINISTIC ZIP
//====================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// Fixed DOS timestamp (2026-01-01 00:00:00) so the archive only changes when its
// contents do, never because a file was touched.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

/** Builds a ZIP archive from name -> content entries, using stored (uncompressed) records. */
const buildZip = (entries: { name: string; data: Uint8Array }[]) => {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const isDir = name.endsWith("/");

    const local = new DataView(new ArrayBuffer(30 + nameBytes.length));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 10, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, 0, true); // method: stored
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); // compressed size
    local.setUint32(22, data.length, true); // uncompressed size
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra field length
    const localBytes = new Uint8Array(local.buffer);
    localBytes.set(nameBytes, 30);

    const central = new DataView(new ArrayBuffer(46 + nameBytes.length));
    central.setUint32(0, 0x02014b50, true); // central directory signature
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 10, true); // version needed
    central.setUint16(8, 0, true); // flags
    central.setUint16(10, 0, true); // method: stored
    central.setUint16(12, DOS_TIME, true);
    central.setUint16(14, DOS_DATE, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true); // extra
    central.setUint16(32, 0, true); // comment
    central.setUint16(34, 0, true); // disk number start
    central.setUint16(36, 0, true); // internal attributes
    central.setUint32(38, isDir ? 0x41ff0010 : 0x81a40000, true); // unix mode + dir flag
    central.setUint32(42, offset, true); // local header offset
    const centralBytes = new Uint8Array(central.buffer);
    centralBytes.set(nameBytes, 46);

    locals.push(localBytes, data);
    centrals.push(centralBytes);
    offset += localBytes.length + data.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory signature
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

//====================================
// SYNC
//====================================

const changed: string[] = [];

/** Writes `data` to `path` only when it differs, and records the path as changed. */
const write = async (path: string, data: Uint8Array) => {
  const target = Bun.file(path);
  if (await target.exists()) {
    const current = new Uint8Array(await target.arrayBuffer());
    if (current.length === data.length && current.every((b, i) => b === data[i])) return;
  }
  await Bun.write(path, data);
  changed.push(path.slice(root.length + 1));
};

const copy = async (from: string, to: string) => {
  const source = Bun.file(from);
  if (!(await source.exists())) throw new Error(`missing source: ${from}`);
  await write(to, new Uint8Array(await source.arrayBuffer()));
};

for (const name of IMAGES) {
  await copy(`${esp32}/docs/${name}`, `${guide}/${name}`);
}

for (const name of EXAMPLES) {
  await copy(`${esp32}/examples/${name}`, `${guide}/downloads/${name}`);
}

// The library ZIP: every .py in packages/esp32/loramint, sorted so the archive
// order is stable regardless of how the filesystem lists them.
const libFiles = (await readdir(`${esp32}/loramint`))
  .filter((n) => n.endsWith(".py"))
  .sort();

const zipEntries = [{ name: "loramint/", data: new Uint8Array(0) }];
for (const name of libFiles) {
  const data = new Uint8Array(await Bun.file(`${esp32}/loramint/${name}`).arrayBuffer());
  zipEntries.push({ name: `loramint/${name}`, data });
}
await write(`${guide}/downloads/loramint.zip`, buildZip(zipEntries));

if (changed.length === 0) {
  console.log("Guide assets are up to date.");
} else {
  console.log(`Updated ${changed.length} guide asset(s):`);
  for (const path of changed) console.log(`  ${path}`);
}
