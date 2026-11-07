// Every fixture's output for ci/validate.sh (spec 001 T019): ci/fixture-output.ts writes one
// file for each layout fixture the exporter converts and for the hand-made model, each the
// exporter's own output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LAYOUTS, MODELS, writeFixtureOutput } from '../ci/fixture-output.ts';
import { toSbgn } from '../src/index.ts';
import { readLayout } from '../src/layout.ts';

test("every layout fixture's output and the model's are written", (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sbgn-fixtures-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const written = writeFixtureOutput(dir);
  assert.deepEqual(readdirSync(dir).sort(), [...written].sort());
  assert.equal(written.length, LAYOUTS.length + MODELS.length);
  // T013's fixtures, all of them, and the others named
  for (const name of readdirSync(new URL('../fixtures/layouts/', import.meta.url))) {
    assert.ok(written.includes(`layouts-${name.replace(/\.json$/, '.sbgn')}`), name);
  }
  for (const name of ['convert-classes.sbgn', 'geometry-ports.sbgn', 'write-model.sbgn']) {
    assert.ok(written.includes(name), name);
  }
  const layout: unknown = JSON.parse(
    readFileSync(new URL('../fixtures/layouts/stoichiometry.json', import.meta.url), 'utf8')
  );
  assert.equal(
    readFileSync(join(dir, 'layouts-stoichiometry.sbgn'), 'utf8'),
    toSbgn(readLayout(layout))
  );
});
