// ci/validate.sh (spec 001 T003): libSBGN 0.2's schema, checked by its blob hash, and
// xmllint over a folder. Needs xmllint, which CI installs; where it is missing these
// tests are skipped, except in CI, where they fail.
//
// The schema is fetched from libSBGN's repository unless SBGN_XSD names a local copy,
// which is checked by the same hash.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../ci/validate.sh', import.meta.url));

const hasXmllint = spawnSync('xmllint', ['--version']).status === 0;
const skip = !hasXmllint && process.env['CI'] === undefined ? 'xmllint is not installed' : false;

/** The test's folders, each removed once the file's tests are done. */
const folders: string[] = [];
after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sbgn-validate-'));
  folders.push(dir);
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
  }
  return dir;
}

function validate(dir: string, env: Record<string, string> = {}) {
  const run = spawnSync('bash', [script, dir], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: run.status, out: run.stdout + run.stderr };
}

/** A document with one arc, its cardinality written with the class given. */
function sbgn(cardinalityClass: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sbgn xmlns="http://sbgn.org/libsbgn/0.2">
    <map language="process description">
        <glyph class="macromolecule" id="a">
            <label text="A"/>
            <bbox w="40.0" h="20.0" x="0.0" y="0.0"/>
        </glyph>
        <glyph class="process" id="p">
            <bbox w="12.0" h="12.0" x="100.0" y="4.0"/>
        </glyph>
        <arc class="consumption" id="arc" source="a" target="p">
            <glyph class="${cardinalityClass}" id="c">
                <label text="2"/>
                <bbox w="12.0" h="12.0" x="60.0" y="4.0"/>
            </glyph>
            <start x="40.0" y="10.0"/>
            <end x="100.0" y="10.0"/>
        </arc>
    </map>
</sbgn>
`;
}

test('a valid file passes, in a subfolder too', { skip }, () => {
  const run = validate(
    folder({ 'one.sbgn': sbgn('cardinality'), 'sub/two.sbgn': sbgn('cardinality') })
  );
  assert.equal(run.status, 0, run.out);
  assert.match(run.out, /2 files, 2 valid, 0 invalid/);
});

test('a stoichiometry glyph fails, and the file is named', { skip }, () => {
  const run = validate(
    folder({ 'good.sbgn': sbgn('cardinality'), 'bad.sbgn': sbgn('stoichiometry') })
  );
  assert.equal(run.status, 1, run.out);
  assert.match(run.out, /bad\.sbgn fails to validate/);
  assert.match(run.out, /2 files, 1 valid, 1 invalid/);
});

test('a file that is not XML fails', { skip }, () => {
  const run = validate(folder({ 'broken.sbgn': '<sbgn' }));
  assert.equal(run.status, 1, run.out);
});

test(
  'a schema that is not the pinned one is refused before anything is validated',
  { skip },
  () => {
    const schema = join(
      folder({ 'SBGN.xsd': '<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"/>' }),
      'SBGN.xsd'
    );
    const run = validate(folder({ 'bad.sbgn': sbgn('stoichiometry') }), { SBGN_XSD: schema });
    assert.equal(run.status, 2, run.out);
    assert.match(run.out, /blob hash/);
    assert.doesNotMatch(run.out, / validates$| fails to validate/m);
  }
);

test('a folder with no SBGN files is refused, not passed', { skip }, () => {
  const run = validate(folder({ 'notes.txt': 'nothing here' }));
  assert.equal(run.status, 2, run.out);
  assert.match(run.out, /no \.sbgn files/);
});

test('a missing folder is refused', { skip }, () => {
  const run = validate(join(tmpdir(), 'sbgn-validate-no-such-folder'));
  assert.equal(run.status, 2, run.out);
});
