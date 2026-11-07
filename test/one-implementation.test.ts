// One implementation for the bulk file and the website (spec 001 T025, SC-004,
// constitution I): a pathway's entry in the archive `bulk` writes is, byte for byte, what
// the library's `toSbgn` answers for the same layout. The archive is written by the
// command line's own code path (`main`, with a stand-in for the graph's list), and each
// entry is extracted by the system's `tar`, not read back by this repository's code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.ts';
import type { GraphReader } from '../src/graph.ts';
import { toSbgn, type DiagramLayout } from '../src/index.ts';

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** Every layout fixture that converts: T013's, and the cut release and service layouts. */
const LAYOUTS = [
  ...readdirSync(join(fixtures, 'layouts'))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => `layouts/${name}`),
  'read-layout/pathway.json',
  'read-layout/disease.json',
  'read-layout/reaction.json',
  'convert/classes.json',
  'geometry/ports.json',
];

test("a pathway's bulk entry is the library's answer for its layout, byte for byte", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sbgn-one-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  // The release's diagram folder: each layout as a pathway's {stId}.json.
  const diagrams = join(dir, 'diagram');
  mkdirSync(diagrams);
  const listed = LAYOUTS.map((fixture, i) => {
    const stId = `R-HSA-${String(1000 + i)}`;
    copyFileSync(join(fixtures, fixture), join(diagrams, `${stId}.json`));
    return { fixture, stId, dbId: 1000 + i };
  });
  const graph = (): GraphReader => ({
    read: () => Promise.resolve(listed.map(({ stId, dbId }) => ({ stId, dbId }))),
    close: () => Promise.resolve(),
  });
  const archive = join(dir, 'homo_sapiens.sbgn.tar.gz');
  let stderr = '';
  const status = await main(['bulk', '--diagrams', diagrams, '--out', archive], {
    env: { NEO4J_URI: 'bolt://localhost:7687', SOURCE_DATE_EPOCH: '1792374600' },
    stdout: () => undefined,
    stderr: (text) => (stderr += text),
    graph,
  });
  assert.equal(status, 0, stderr);
  assert.equal(stderr, `${String(LAYOUTS.length)} written, 0 failed\n`);

  for (const { fixture, stId } of listed) {
    // The entry as the system's tar extracts it, to standard output.
    const entry = execFileSync('tar', [
      '--extract',
      '--to-stdout',
      '--gzip',
      '--file',
      archive,
      `${stId}.sbgn`,
    ]);
    const layout = JSON.parse(readFileSync(join(fixtures, fixture), 'utf8')) as DiagramLayout;
    const library = Buffer.from(toSbgn(layout), 'utf8');
    assert.ok(entry.length > 0, fixture);
    assert.ok(entry.equals(library), `${fixture}: the bulk entry is not the library's answer`);
  }
});
