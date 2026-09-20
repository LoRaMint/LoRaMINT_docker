// Lays out the ESP32 guide's files ready to be uploaded, from their sources in
// packages/esp32.
//
// **What changed, and why this script still exists.** The images, the example
// programs and the library ZIP used to be committed copies under
// public/guides/esp32 and were served from there. They are content now like
// every other file: they live in the upload volume, they are linked from the
// guide as /downloads/esp32/…, and no copy of them belongs in the repository.
//
// What does not change is the reason this was ever a script. `loramint.zip` is
// built from packages/esp32/loramint, and it was assembling it by hand that
// once shipped a library version which could not transmit. The archive is still
// written here with fixed timestamps and stored (uncompressed) entries rather
// than by shelling out to `zip`, so the same sources always produce the same
// bytes and "did anything actually change?" is a question with an answer.
//
//     bun run sync-guide-assets
//
// It writes into temp/upload/, which is ignored by git, and prints the folder
// each file belongs in. Uploading is a deliberate step under
// /management/dateien - see packages/api/docs/anleitungen.md.
//
// **The guarantee that got weaker, said plainly.** CI used to run this and fail
// when the result differed from what was committed, so a stale copy could not
// reach a release. There is nothing committed to compare against any more, and
// the copies that matter now sit in a volume on a server that CI cannot see.
// What CI still catches is a source that moved or was renamed - the script
// refuses to run - and that is worth keeping. What nobody but a person can
// catch is an upload that was never repeated after the library changed.

import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

// Resolved, so the listing at the end reads as a path and not as a trail of
// `..` segments through the package it was started from.
const root = resolve(import.meta.dir, "../../..");
const esp32 = `${root}/packages/esp32`;

/**
 * Where the files are laid out, mirroring the addresses they will have.
 *
 * `temp/upload/esp32/parts.jpg` becomes `/downloads/esp32/parts.jpg`. One shape
 * for both, so what has to be uploaded where can be read off the folder instead
 * of worked out from a list in a document.
 */
const guide = `${root}/temp/upload/esp32`;

const IMAGES = [
  "parts.jpg",
  "esp32_wiring.png",
  "thonny_interpreter.png",
  "thonny_flash.png",
  "thonny_upload.png",
];

// Paths relative to packages/esp32/examples, mirrored one to one - the two
// folders hold files of the same name.
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
  await copy(`${esp32}/examples/${name}`, `${guide}/${name}`);
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
await write(`${guide}/loramint.zip`, buildZip(zipEntries));

//====================================
// WHAT TO DO WITH IT
//====================================

/*
 * The listing is the instruction. A sentence saying "upload these somewhere
 * sensible" is how the folders end up different on every deployment, and the
 * guide links absolute addresses - so the folder is not a matter of taste.
 */
const target = relative(process.cwd(), `${root}/temp/upload`) || "temp/upload";
const folders = [...new Set(EXAMPLES.map((name) => name.split("/")[0]!))].sort();

console.log(
  changed.length === 0
    ? "Guide assets unchanged - temp/upload/esp32 already holds this version."
    : `Wrote ${changed.length} file(s) into temp/upload/esp32:`,
);
for (const path of changed) console.log(`  ${path}`);

console.log(`
Ready to upload under /management/dateien, folder by folder:

  ${target}/esp32/*.{jpg,png,zip}   ->  esp32
${folders.map((folder) => `  ${target}/esp32/${folder}/*.py${" ".repeat(Math.max(1, 14 - folder.length))}->  esp32/${folder}`).join("\n")}

The guide links them as /downloads/esp32/… , so the folder names decide whether
its pictures appear. Release only what belongs on the public download page -
the pictures in the text need no release to be shown (services/uploads.ts).`);
