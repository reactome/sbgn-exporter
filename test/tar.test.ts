// The bulk archive (spec 001 T023): src/tar.ts's flat ustar archive, gzipped, listed and
// extracted by the system's GNU tar and by Python's tarfile, each reading it as its own:
// names, sizes, contents, mode 0644, owner and group 0, the time given, ustar, and the
// same bytes for the same entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { tar, tarGz, type TarEntry } from '../src/tar.ts';

/** 19 Oct 2026, 01:50 UTC */
const MTIME = 1_792_374_600;

const ENTRIES: TarEntry[] = [
  // a real file of the release's names, made by hand; an empty one; one of exactly a
  // block; one a byte over; text outside ASCII; and one of bytes
  { name: 'R-HSA-109581.sbgn', content: '<?xml version="1.0"?>\n<sbgn/>\n' },
  { name: 'R-HSA-0.sbgn', content: '' },
  { name: 'R-HSA-512.sbgn', content: 'x'.repeat(512) },
  { name: 'R-HSA-513.sbgn', content: 'y'.repeat(513) },
  { name: 'R-HSA-1059683.sbgn', content: 'β-catenin, 中文, café\n' },
  { name: 'bytes.bin', content: Uint8Array.from({ length: 1000 }, (_, i) => (i * 7) % 256) },
];

function bytes(entry: TarEntry): Buffer {
  return typeof entry.content === 'string'
    ? Buffer.from(entry.content, 'utf8')
    : Buffer.from(entry.content);
}

function withArchive<T>(entries: readonly TarEntry[], use: (dir: string, file: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'sbgn-tar-'));
  try {
    const file = join(dir, 'archive.tar.gz');
    writeFileSync(file, tarGz(entries, { mtime: MTIME }));
    return use(dir, file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('GNU tar lists the entries in order, with their sizes, mode 0644, owner 0 and the time', () => {
  withArchive(ENTRIES, (_dir, file) => {
    const run = spawnSync(
      'tar',
      ['--list', '--verbose', '--numeric-owner', '--full-time', '--gzip', '--file', file],
      { encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } }
    );
    // no warning (a bad checksum, a lone zero block, an unexpected end) and status 0
    assert.equal(run.stderr, '');
    assert.equal(run.status, 0);
    const listing = run.stdout;
    const rows = listing
      .trimEnd()
      .split('\n')
      .map((line) => line.split(/\s+/));
    assert.deepEqual(
      rows.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5]]),
      ENTRIES.map((e) => [
        '-rw-r--r--',
        '0/0',
        String(bytes(e).length),
        '2026-10-19',
        '01:50:00',
        e.name,
      ])
    );
  });
});

test('GNU tar extracts every entry, byte for byte, with nothing else', () => {
  withArchive(ENTRIES, (dir, file) => {
    const out = join(dir, 'out');
    execFileSync('mkdir', [out]);
    execFileSync('tar', ['--extract', '--gzip', '--file', file, '--directory', out]);
    for (const entry of ENTRIES)
      assert.ok(readFileSync(join(out, entry.name)).equals(bytes(entry)), entry.name);
    const names = execFileSync('ls', ['-A', out], { encoding: 'utf8' }).trimEnd().split('\n');
    assert.deepEqual(names.sort(), ENTRIES.map((e) => e.name).sort());
  });
});

const PYTHON = `
import hashlib, json, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    out = []
    for m in archive.getmembers():
        data = archive.extractfile(m).read()
        out.append([m.name, m.size, oct(m.mode), m.uid, m.gid, m.uname, m.gname, m.mtime,
                    m.type.decode(), hashlib.sha256(data).hexdigest()])
    print(json.dumps({'members': out}))
`;

test("Python's tarfile reads it the same: the same members and contents", () => {
  withArchive(ENTRIES, (_dir, file) => {
    const read = JSON.parse(
      execFileSync('python3', ['-I', '-c', PYTHON, file], { encoding: 'utf8' })
    ) as {
      members: unknown[][];
    };
    const sha256 = (b: Buffer): string =>
      execFileSync('sha256sum', [], { input: b, encoding: 'utf8' }).split(' ')[0] ?? '';
    assert.deepEqual(
      read.members,
      ENTRIES.map((e) => [
        e.name,
        bytes(e).length,
        '0o644',
        0,
        0,
        '',
        '',
        MTIME,
        '0',
        sha256(bytes(e)),
      ])
    );
  });
});

test('the archive is ustar, two zero blocks at its end, padded to whole 10240-byte records', () => {
  const archive = Buffer.from(tar(ENTRIES, { mtime: MTIME }));
  assert.equal(archive.length % 10240, 0);
  const header = archive.subarray(0, 512);
  assert.equal(header.subarray(257, 265).toString('latin1'), 'ustar\u000000');
  assert.equal(header.subarray(100, 108).toString('latin1'), '0000644\u0000');
  assert.equal(header.subarray(136, 148).toString('latin1'), `${MTIME.toString(8)}\u0000`);
  // the checksum: the header's bytes summed with its own field as spaces
  const blank = Buffer.from(header);
  blank.fill(0x20, 148, 156);
  const sum = blank.reduce((total, byte) => total + byte, 0);
  assert.equal(
    header.subarray(148, 156).toString('latin1'),
    `${sum.toString(8).padStart(6, '0')}\u0000 `
  );
  // after the last entry's content, only zero bytes
  const used = ENTRIES.reduce(
    (total, e) => total + 512 + Math.ceil(bytes(e).length / 512) * 512,
    0
  );
  assert.ok(archive.subarray(used).every((b) => b === 0));
  assert.ok(archive.length >= used + 1024);
  assert.ok(Buffer.from(gunzipSync(tarGz(ENTRIES, { mtime: MTIME }))).equals(archive));
});

test('the two zero blocks are there when the entries fill a record exactly', () => {
  // ten entries of a header and one block each: 20 blocks, one whole record
  const full = Array.from({ length: 10 }, (_, i) => ({
    name: `R-HSA-${String(i)}.sbgn`,
    content: 'z'.repeat(512),
  }));
  const archive = Buffer.from(tar(full, { mtime: MTIME }));
  assert.equal(archive.length, 20480);
  assert.ok(archive.subarray(10240).every((b) => b === 0));
});

test('the same entries and time give the same bytes, the gzip header fixed', () => {
  const a = tarGz(ENTRIES, { mtime: MTIME });
  const b = tarGz(
    ENTRIES.map((e) => ({ ...e })),
    { mtime: MTIME }
  );
  assert.ok(Buffer.from(a).equals(Buffer.from(b)));
  // no name, no time, OS 3: what the release's archive's header holds too
  assert.equal(Buffer.from(a.subarray(0, 10)).toString('hex'), '1f8b0800000000000003');
  assert.notDeepEqual(tarGz(ENTRIES.toReversed(), { mtime: MTIME }), a);
  assert.notDeepEqual(tarGz(ENTRIES, { mtime: MTIME + 1 }), a);
});

test('a name that is not flat, printable ASCII and short, or is repeated, is refused', () => {
  const one = (name: string): TarEntry[] => [{ name, content: 'x' }];
  for (const name of [
    '',
    '.',
    '..',
    'a/b.sbgn',
    '/abs.sbgn',
    'a b.sbgn',
    'é.sbgn',
    'tab\t.sbgn',
    'x'.repeat(101),
  ]) {
    assert.throws(() => tar(one(name), { mtime: 0 }), JSON.stringify(name));
  }
  assert.equal(tar(one('x'.repeat(100)), { mtime: 0 }).length, 10240);
  assert.throws(() => tar([...one('a.sbgn'), ...one('a.sbgn')], { mtime: 0 }), /repeated/);
  for (const mtime of [-1, 1.5, 8 ** 11])
    assert.throws(() => tar(one('a'), { mtime }), String(mtime));
});
