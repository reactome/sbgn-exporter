import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { allowed, declared, installed, offenders } from '../ci/licences.ts';

test('a single allowed licence passes, and the GPL family does not', () => {
  for (const ok of ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'CC0-1.0', '0BSD']) {
    assert.equal(allowed(ok), true, ok);
  }
  for (const bad of ['GPL-3.0', 'GPL-2.0+', 'LGPL-2.1', 'AGPL-3.0', 'SSPL-1.0', 'UNLICENSED']) {
    assert.equal(allowed(bad), false, bad);
  }
});

test('SPDX expressions: OR needs one, AND needs both, WITH keeps its base', () => {
  assert.equal(allowed('(MIT AND Zlib)'), true);
  assert.equal(allowed('MIT AND GPL-3.0'), false);
  assert.equal(allowed('(MIT OR GPL-3.0)'), true);
  assert.equal(allowed('GPL-3.0 OR AGPL-3.0'), false);
  assert.equal(allowed('Apache-2.0 WITH LLVM-exception'), true);
  assert.equal(allowed('(MIT OR (Apache-2.0 AND GPL-2.0))'), true);
  assert.equal(allowed('((Apache-2.0 AND GPL-2.0) OR AGPL-3.0)'), false);
});

test('an expression that cannot be read is not allowed', () => {
  for (const broken of ['(MIT', 'MIT)', 'MIT OR', 'AND MIT', '', 'MIT GPL-3.0', 'MIT WITH']) {
    assert.equal(allowed(broken), false, JSON.stringify(broken));
  }
});

test('the old licence forms are read: { type } and a list', () => {
  assert.equal(declared({ type: 'MIT' }), 'MIT');
  assert.equal(declared([{ type: 'MIT' }, { type: 'Apache-2.0' }]), 'MIT OR Apache-2.0');
  assert.equal(declared(undefined), null);
  assert.equal(declared('  '), null);
});

test('every offender is listed, not only the first, with its reason', () => {
  const found = offenders([
    { name: 'fine', version: '1.0.0', license: 'MIT' },
    { name: 'copyleft', version: '2.0.0', license: 'GPL-3.0' },
    { name: 'silent', version: '0.1.0' },
    { name: 'also-copyleft', version: '1.0.0', license: 'AGPL-3.0-only' },
  ]);
  assert.deepEqual(
    found.map((o) => `${o.name}: ${o.reason}`),
    [
      'also-copyleft: not on the allowlist',
      'copyleft: not on the allowlist',
      'silent: declares no licence',
    ]
  );
});

/** The test's folders, each removed once the file's tests are done. */
const folders: string[] = [];
after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

/** A saved `npm query` answer: the root package and the given ones. */
function savedQuery(packages: readonly object[]): string {
  const folder = mkdtempSync(join(tmpdir(), 'licences-'));
  folders.push(folder);
  const file = join(folder, 'query.json');
  const root = { name: 'sbgn-exporter', version: '0.0.0', license: 'Apache-2.0', location: '' };
  writeFileSync(file, JSON.stringify([root, ...packages]));
  return file;
}

test('the root package is left out of what is checked', () => {
  const file = savedQuery([
    { name: 'dep', version: '1.0.0', license: 'MIT', location: 'node_modules/dep' },
  ]);
  assert.deepEqual(
    installed('.', file).map((pkg) => pkg.name),
    ['dep']
  );
});

const script = fileURLToPath(new URL('../ci/licences.ts', import.meta.url));

test('the command fails on an offender, naming it, and passes without one', () => {
  const bad = spawnSync(
    process.execPath,
    [
      script,
      '--query',
      savedQuery([
        { name: 'ok', version: '1.0.0', license: 'ISC', location: 'node_modules/ok' },
        { name: 'copyleft', version: '2.0.0', license: 'GPL-3.0', location: 'node_modules/cl' },
      ]),
    ],
    { encoding: 'utf8' }
  );
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stderr, /^copyleft@2\.0\.0: GPL-3\.0: not on the allowlist$/m);
  assert.match(bad.stdout, /2 packages checked, 1 offending/);

  const good = spawnSync(
    process.execPath,
    [
      script,
      '--query',
      savedQuery([{ name: 'ok', version: '1.0.0', license: 'ISC', location: 'node_modules/ok' }]),
    ],
    { encoding: 'utf8' }
  );
  assert.equal(good.status, 0, good.stderr);

  const missing = spawnSync(process.execPath, [script, '--query'], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
});
