// The command line (spec 001 T024, contracts/cli.md), end to end: fixture layouts in a
// diagram folder named as a release's ({stId}.json), a stub in place of the graph (the
// rows src/graph.ts's queries would return), and what is written, said and returned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, type Context } from '../src/cli.ts';
import { BULK_QUERY, LIST_QUERY, type GraphReader } from '../src/graph.ts';
import { toSbgn } from '../src/index.ts';
import { readLayout } from '../src/layout.ts';

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));

/**
 * The diagram folder: pathways 9, 10 and 100 (so dbId order is not name order), 11 listed
 * without a file, and 12 whose layout Java throws on (no segment touches its shape).
 */
const LAYOUTS: Record<string, string> = {
  'R-HSA-9': 'layouts/d6-two-segments.json',
  'R-HSA-10': 'layouts/stoichiometry.json',
  'R-HSA-100': 'layouts/escapes-non-ascii.json',
  'R-HSA-12': 'geometry/order.json',
};
const LISTED = [9, 10, 11, 12, 100].map((dbId) => ({ stId: `R-HSA-${String(dbId)}`, dbId }));

function sbgnOf(fixture: string): string {
  return toSbgn(readLayout(JSON.parse(readFileSync(join(fixtures, fixture), 'utf8'))));
}

interface Run {
  status: number;
  stdout: string;
  stderr: string;
  calls: unknown[];
}

function stubGraph(
  calls: unknown[],
  answer: (query: string, parameters: Readonly<Record<string, unknown>>) => unknown[]
): Context['graph'] {
  return () => {
    const graph: GraphReader = {
      read: (query, parameters) => {
        calls.push([query, parameters]);
        return Promise.resolve(answer(query, parameters));
      },
      close: () => {
        calls.push('closed');
        return Promise.resolve();
      },
    };
    return graph;
  };
}

async function run(
  args: string[],
  options: { rows?: unknown[]; graph?: Context['graph']; env?: Record<string, string> } = {}
): Promise<Run> {
  const calls: unknown[] = [];
  let stdout = '';
  let stderr = '';
  const status = await main(args, {
    env: { NEO4J_URI: 'bolt://localhost:7687', SOURCE_DATE_EPOCH: '1792374600', ...options.env },
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    graph: options.graph ?? stubGraph(calls, () => options.rows ?? LISTED),
  });
  return { status, stdout, stderr, calls };
}

function workspace(t: { after: (fn: () => void) => void }): { diagrams: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sbgn-cli-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const diagrams = join(dir, 'diagram');
  mkdirSync(diagrams);
  for (const [stId, fixture] of Object.entries(LAYOUTS))
    copyFileSync(join(fixtures, fixture), join(diagrams, `${stId}.json`));
  return { diagrams, dir };
}

test('bulk: a failing pathway is named, the rest are archived in name order, exit 1', async (t) => {
  const { diagrams, dir } = workspace(t);
  const out = join(dir, 'homo_sapiens.sbgn.tar.gz');
  const result = await run(['bulk', '--diagrams', diagrams, '--out', out]);
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, [[BULK_QUERY, { speciesName: 'Homo sapiens' }], 'closed']);
  const lines = result.stderr.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0] ?? '', /^R-HSA-11: no diagram file .*R-HSA-11\.json$/);
  assert.match(
    lines[1] ?? '',
    /^R-HSA-12: Diagram layout, edge 22 .*no segment of its backbone touches its shape$/
  );
  assert.equal(lines[2], '3 written, 2 failed');
  // the archive: name order (R-HSA-10, R-HSA-100, R-HSA-9), not the list's dbId order
  const listing = execFileSync('tar', ['--list', '--gzip', '--file', out], { encoding: 'utf8' });
  assert.deepEqual(listing.trimEnd().split('\n'), [
    'R-HSA-10.sbgn',
    'R-HSA-100.sbgn',
    'R-HSA-9.sbgn',
  ]);
  const extracted = join(dir, 'x');
  mkdirSync(extracted);
  execFileSync('tar', ['--extract', '--gzip', '--file', out, '--directory', extracted]);
  for (const stId of ['R-HSA-9', 'R-HSA-10', 'R-HSA-100']) {
    assert.equal(
      readFileSync(join(extracted, `${stId}.sbgn`), 'utf8'),
      sbgnOf(LAYOUTS[stId] ?? ''),
      stId
    );
  }
  // the time from SOURCE_DATE_EPOCH, and the same bytes again
  const verbose = execFileSync(
    'tar',
    ['--list', '--verbose', '--full-time', '--gzip', '--file', out],
    {
      encoding: 'utf8',
      env: { ...process.env, TZ: 'UTC' },
    }
  );
  assert.ok(verbose.split('\n')[0]?.includes('2026-10-19 01:50:00'));
  const again = join(dir, 'again.tar.gz');
  await run(['bulk', '--diagrams', diagrams, '--out', again]);
  assert.ok(readFileSync(out).equals(readFileSync(again)));
});

test('bulk: everything written exits 0; another species is asked for', async (t) => {
  const { diagrams, dir } = workspace(t);
  const out = join(dir, 'archive.tar.gz');
  const rows = LISTED.filter((p) => ['R-HSA-9', 'R-HSA-10'].includes(p.stId));
  const result = await run(
    ['bulk', '--diagrams', diagrams, '--out', out, '--species', 'Mus musculus'],
    { rows }
  );
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '2 written, 0 failed\n');
  assert.deepEqual(result.calls[0], [BULK_QUERY, { speciesName: 'Mus musculus' }]);
});

test('bulk: an unreachable graph, or none set, exits 2 with nothing written', async (t) => {
  const { diagrams, dir } = workspace(t);
  const out = join(dir, 'archive.tar.gz');
  const unreachable: Context['graph'] = () => ({
    read: () => Promise.reject(new Error('Could not perform discovery')),
    close: () => Promise.resolve(),
  });
  const result = await run(['bulk', '--diagrams', diagrams, '--out', out], { graph: unreachable });
  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /^Cannot read the list of pathways from the graph: Could not perform discovery\n$/
  );
  assert.ok(!existsSync(out));
  // the real entry point, without NEO4J_URI
  const env = { ...process.env };
  delete env['NEO4J_URI'];
  const real = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../src/cli.ts', import.meta.url)),
      'bulk',
      '--diagrams',
      diagrams,
      '--out',
      out,
    ],
    { encoding: 'utf8', env }
  );
  assert.equal(real.status, 2);
  assert.match(real.stderr, /NEO4J_URI is not set/);
  assert.ok(!existsSync(out));
});

test('files: a species into a folder, failures named', async (t) => {
  const { diagrams, dir } = workspace(t);
  const out = join(dir, 'out');
  const result = await run([
    'files',
    '--diagrams',
    diagrams,
    '--out',
    out,
    '--species',
    'Homo sapiens',
  ]);
  assert.equal(result.status, 1);
  assert.deepEqual(readdirSync(out).sort(), ['R-HSA-10.sbgn', 'R-HSA-100.sbgn', 'R-HSA-9.sbgn']);
  assert.equal(readFileSync(join(out, 'R-HSA-9.sbgn'), 'utf8'), sbgnOf(LAYOUTS['R-HSA-9'] ?? ''));
  assert.match(result.stderr, /3 written, 2 failed\n$/);
});

test('files: pathways by stable id (its version dropped) or dbId; one without a diagram is named', async (t) => {
  const { diagrams, dir } = workspace(t);
  const out = join(dir, 'out');
  const calls: unknown[] = [];
  const graph = stubGraph(calls, () => LISTED.filter((p) => p.dbId === 9 || p.dbId === 10));
  const result = await run(
    ['files', '--diagrams', diagrams, '--out', out, '--pathways', 'R-HSA-9.3,10,R-HSA-777'],
    { graph }
  );
  assert.equal(result.status, 1);
  const [query, parameters] = calls[0] as [
    string,
    { stIds: string[]; dbIds: { toNumber(): number }[] },
  ];
  assert.equal(query, LIST_QUERY);
  assert.deepEqual(parameters.stIds, ['R-HSA-9', 'R-HSA-777']);
  assert.deepEqual(
    parameters.dbIds.map((n) => n.toNumber()),
    [10]
  );
  assert.deepEqual(readdirSync(out).sort(), ['R-HSA-10.sbgn', 'R-HSA-9.sbgn']);
  assert.equal(
    result.stderr,
    'R-HSA-777: no pathway with a diagram in the graph\n2 written, 1 failed\n'
  );
});

test('convert: one layout to standard output or a file, a refused one named', async (t) => {
  const { dir } = workspace(t);
  const layout = join(fixtures, 'layouts/connector-types.json');
  const stdout = await run(['convert', layout]);
  assert.equal(stdout.status, 0);
  assert.equal(stdout.stdout, sbgnOf('layouts/connector-types.json'));
  assert.deepEqual(stdout.calls, []);
  const file = join(dir, 'one.sbgn');
  assert.equal((await run(['convert', layout, '--out', file])).status, 0);
  assert.equal(readFileSync(file, 'utf8'), stdout.stdout);
  const refused = await run(['convert', join(fixtures, 'geometry/order.json')]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /order\.json: Diagram layout, edge 22/);
  assert.equal((await run(['convert', join(dir, 'none.json')])).status, 1);
  // and through the real entry point
  const real = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'convert', layout],
    { encoding: 'utf8' }
  );
  assert.equal(real.status, 0);
  assert.equal(real.stdout, stdout.stdout);
});

test('a usage error exits 2, says how, and writes nothing', async (t) => {
  const { diagrams, dir } = workspace(t);
  const out = join(dir, 'x.tar.gz');
  for (const args of [
    [],
    ['export'],
    ['bulk', '--diagrams', diagrams],
    ['bulk', '--diagrams', diagrams, '--out', out, '--colour', 'red'],
    ['bulk', '--diagrams', diagrams, '--out', out, '--out', out],
    ['bulk', '--diagrams', '--out', out],
    ['files', '--diagrams', diagrams, '--out', join(dir, 'f')],
    [
      'files',
      '--diagrams',
      diagrams,
      '--out',
      join(dir, 'f'),
      '--species',
      'Homo sapiens',
      '--pathways',
      'R-HSA-9',
    ],
    ['files', '--diagrams', diagrams, '--out', join(dir, 'f'), '--pathways', 'R-HSA-9,pathway'],
    ['convert'],
    ['convert', 'a.json', 'b.json'],
  ]) {
    const result = await run(args);
    assert.equal(result.status, 2, args.join(' '));
    assert.match(result.stderr, /^sbgn-exporter: .*\nUsage:/, args.join(' '));
    assert.deepEqual(result.calls, [], args.join(' '));
  }
  const badEpoch = await run(['bulk', '--diagrams', diagrams, '--out', out], {
    env: { SOURCE_DATE_EPOCH: 'yesterday' },
  });
  assert.equal(badEpoch.status, 2);
  assert.ok(!existsSync(out) && !existsSync(join(dir, 'f')));
});
