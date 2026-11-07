/**
 * A flat ustar archive, gzipped (spec 001 T023, research R10, contracts/cli.md): the
 * release's `homo_sapiens.sbgn.tar.gz`, one `{stId}.sbgn` per pathway at the top level.
 * No tar dependency: the format's subset needed is small.
 *
 * Each entry is a regular file in POSIX ustar (`ustar\0`, version `00`): mode 0644, owner
 * and group 0 with no names, the modification time given, in the order given. The archive
 * ends with two zero blocks and is padded to a whole 10240-byte record, as GNU tar and
 * Python's tarfile pad theirs. Names are flat (no `/`), printable ASCII and at most 100
 * bytes, so the ustar prefix field is never needed; a name repeated is refused.
 *
 * The gzip member is written here around zlib's deflate stream, so that its header is
 * fixed (no name, no time, OS 3 as zlib's own on Unix): the same entries and time give the
 * same bytes on every run, on every machine with the same zlib.
 */
import { crc32, deflateRawSync } from 'node:zlib';

/** One file of the archive. */
export interface TarEntry {
  /** Its name at the archive's top level, e.g. `R-HSA-109581.sbgn`. */
  readonly name: string;
  /** Its bytes; text is written as UTF-8. */
  readonly content: string | Uint8Array;
}

export interface TarOptions {
  /** Every entry's modification time, in whole seconds since 1970. */
  readonly mtime: number;
}

const BLOCK = 512;
const RECORD = 20 * BLOCK;
/** The largest number an 11-digit octal field holds. */
const OCTAL_11 = 8 ** 11 - 1;

const encoder = new TextEncoder();

function octal(header: Uint8Array, offset: number, width: number, value: number): void {
  // `width - 1` octal digits, zero-padded, then a NUL, as GNU tar and POSIX write them.
  const digits = value.toString(8).padStart(width - 1, '0');
  header.set(encoder.encode(digits), offset);
  header[offset + width - 1] = 0;
}

function checkName(name: string, seen: Set<string>): Uint8Array {
  if (name === '' || name === '.' || name === '..')
    throw new TypeError(`Not a file name: ${JSON.stringify(name)}`);
  if (!/^[\x21-\x7e]+$/.test(name) || name.includes('/')) {
    throw new TypeError(`Not a flat, printable ASCII file name: ${JSON.stringify(name)}`);
  }
  if (name.length > 100) throw new RangeError(`A name longer than 100 bytes: ${name}`);
  if (seen.has(name)) throw new TypeError(`A name repeated: ${name}`);
  seen.add(name);
  return encoder.encode(name);
}

function header(name: Uint8Array, size: number, mtime: number): Uint8Array {
  const h = new Uint8Array(BLOCK);
  h.set(name, 0);
  octal(h, 100, 8, 0o644); // mode
  octal(h, 108, 8, 0); // uid
  octal(h, 116, 8, 0); // gid
  octal(h, 124, 12, size);
  octal(h, 136, 12, mtime);
  h.fill(0x20, 148, 156); // the checksum, counted as spaces
  h[156] = 0x30; // typeflag '0': a regular file
  h.set(encoder.encode('ustar\u000000'), 257); // magic "ustar\0", version "00"
  octal(h, 329, 8, 0); // devmajor
  octal(h, 337, 8, 0); // devminor
  const sum = h.reduce((total, byte) => total + byte, 0);
  // six octal digits, a NUL and a space
  h.set(encoder.encode(sum.toString(8).padStart(6, '0')), 148);
  h[154] = 0;
  h[155] = 0x20;
  return h;
}

/** The uncompressed ustar archive of the entries, in their order. */
export function tar(entries: readonly TarEntry[], options: TarOptions): Uint8Array {
  const { mtime } = options;
  if (!Number.isInteger(mtime) || mtime < 0 || mtime > OCTAL_11) {
    throw new RangeError(`Not a modification time tar can hold: ${String(mtime)}`);
  }
  const seen = new Set<string>();
  const parts: Uint8Array[] = [];
  let length = 0;
  for (const entry of entries) {
    const name = checkName(entry.name, seen);
    const content =
      typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    if (content.length > OCTAL_11)
      throw new RangeError(`A file too large for ustar: ${entry.name}`);
    parts.push(header(name, content.length, mtime), content);
    length += BLOCK + Math.ceil(content.length / BLOCK) * BLOCK;
  }
  length += 2 * BLOCK;
  const archive = new Uint8Array(Math.ceil(length / RECORD) * RECORD);
  let offset = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const h = parts[i];
    const content = parts[i + 1];
    if (h === undefined || content === undefined) break;
    archive.set(h, offset);
    archive.set(content, offset + BLOCK);
    offset += BLOCK + Math.ceil(content.length / BLOCK) * BLOCK;
  }
  return archive;
}

/** The fixed gzip header: deflate, no flags, no time, no extra flags, OS 3 (Unix). */
const GZIP_HEADER = Uint8Array.of(0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3);

/** The archive gzipped: one gzip member, its header fixed. */
export function tarGz(entries: readonly TarEntry[], options: TarOptions): Uint8Array {
  const archive = tar(entries, options);
  const deflated = deflateRawSync(archive, { level: 6 });
  const trailer = new Uint8Array(8);
  const view = new DataView(trailer.buffer);
  view.setUint32(0, crc32(archive), true);
  view.setUint32(4, archive.length % 2 ** 32, true);
  const out = new Uint8Array(GZIP_HEADER.length + deflated.length + trailer.length);
  out.set(GZIP_HEADER, 0);
  out.set(deflated, GZIP_HEADER.length);
  out.set(trailer, GZIP_HEADER.length + deflated.length);
  return out;
}
