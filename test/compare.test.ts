// The comparison (spec 001 T014, contracts/comparison.md): one difference of each declared
// kind planted in our own document for a fixture of fixtures/layouts/, and seen reported
// as its kind, with the exit status following; and the negative cases, each reported as
// undeclared. Where a planted value is Java's, it is taken from Java's own answer for the
// fixture in fixtures/java/ (the reference harness, T013), as each case says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareDocuments, main, type Difference, type Kind } from '../ci/compare.ts';
import { toSbgn } from '../src/index.ts';
import { readLayout, type DiagramLayout } from '../src/layout.ts';

function text(path: string): string {
  return readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');
}

function layout(name: string): DiagramLayout {
  return readLayout(JSON.parse(text(`layouts/${name}.json`)));
}

function ours(name: string): string {
  return toSbgn(layout(name));
}

/** The arc's block, `<arc … id="…">` to `</arc>`, in a document. */
function arcBlock(doc: string, id: string): string {
  const start = doc.indexOf(`<arc class="`, doc.indexOf(`id="${id}"`) - 60);
  const end = doc.indexOf('</arc>', start) + '</arc>'.length;
  const block = doc.slice(start, end);
  assert.ok(block.includes(`id="${id}"`), id);
  return block;
}

/** The arc's points in a document, as `x,y` pairs from start to end. */
function pointsOf(doc: string, id: string): [string, string][] {
  return [...arcBlock(doc, id).matchAll(/<(?:start|next|end) x="([^"]*)" y="([^"]*)"\/>/g)].map(
    (m) => [m[1] ?? '', m[2] ?? '']
  );
}

/** The document with an arc's points replaced. */
function withPoints(doc: string, id: string, points: [string, string][]): string {
  const block = arcBlock(doc, id);
  const kept = block.split('\n').filter((line) => !/<(start|next|end) /.test(line));
  const lines = points.map(([x, y], i) => {
    const name = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'next';
    return `            <${name} x="${x}" y="${y}"/>`;
  });
  kept.splice(kept.length - 1, 0, ...lines);
  return doc.replace(block, kept.join('\n'));
}

function only(differences: Difference[], kind: Kind, field?: string): void {
  assert.equal(differences.length, 1, JSON.stringify(differences));
  const [difference] = differences;
  assert.equal(difference?.kind, kind, JSON.stringify(differences));
  if (field !== undefined) assert.equal(difference.field, field);
}

/** main() on two documents written to files: its exit status and output. */
function run(
  oursText: string,
  javaText: string,
  args: string[] = []
): { status: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sbgn-compare-'));
  try {
    writeFileSync(join(dir, 'ours.sbgn'), oursText);
    writeFileSync(join(dir, 'java.sbgn'), javaText);
    let out = '';
    const status = main(
      [join(dir, 'ours.sbgn'), join(dir, 'java.sbgn'), ...args],
      (t) => (out += t),
      (t) => (out += t)
    );
    return { status, out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const layoutArg = (name: string): string[] => [
  '--layout',
  new URL(`../fixtures/layouts/${name}.json`, import.meta.url).pathname,
];

test('the same document has no difference, and exits 0', () => {
  const doc = ours('connector-types');
  assert.deepEqual(compareDocuments(doc, doc), []);
  assert.equal(run(doc, doc).status, 0);
});

test('D1: another order of glyphs is reported as D1, and exits 0', () => {
  const doc = ours('compartments');
  // Java's glyphs in another order: the first two swapped
  const [first = '', second = ''] = doc.match(/ {8}<glyph[\s\S]*?\n {8}<\/glyph>/g) ?? [];
  assert.ok(first && second);
  const java = doc.replace(`${first}\n${second}`, `${second}\n${first}`);
  assert.notEqual(java, doc);
  only(compareDocuments(doc, java), 'D1', 'order');
  assert.equal(run(doc, java).status, 0);
});

test("D2: Java's points from the reversed backbone are D2, with the layout", () => {
  const doc = ours('d2-two-outputs');
  // Java's own points for this INPUT, in fixtures/java/d2-two-outputs.sbgn, read after an
  // OUTPUT reversed the backbone: start (380, 300), next and end (420, 340)
  const java = withPoints(
    doc,
    'arc_11_input_1',
    pointsOf(text('java/d2-two-outputs.sbgn'), 'arc_11_input_1')
  );
  assert.deepEqual(pointsOf(java, 'arc_11_input_1'), [
    ['380.0', '300.0'],
    ['420.0', '340.0'],
    ['420.0', '340.0'],
  ]);
  only(compareDocuments(doc, java, { layout: layout('d2-two-outputs') }), 'D2', 'points');
  assert.equal(run(doc, java, layoutArg('d2-two-outputs')).status, 0);
  // and for an OUTPUT: Java's own, the backbone reversed when it started and reversed back
  // on the way, so its start and end are read from different segments: start (306, 300),
  // next (160, 350), end (294, 300)
  const output = withPoints(
    doc,
    'arc_12_output_1',
    pointsOf(text('java/d2-two-outputs.sbgn'), 'arc_12_output_1')
  );
  assert.deepEqual(pointsOf(output, 'arc_12_output_1'), [
    ['306.0', '300.0'],
    ['160.0', '350.0'],
    ['294.0', '300.0'],
  ]);
  only(compareDocuments(doc, output, { layout: layout('d2-two-outputs') }), 'D2', 'points');
});

test('D3: cardinality for stoichiometry is D3', () => {
  const doc = ours('stoichiometry');
  const java = doc.replaceAll('class="cardinality"', 'class="stoichiometry"');
  const differences = compareDocuments(doc, java);
  assert.equal(differences.length, 2);
  assert.ok(differences.every((d) => d.kind === 'D3' && d.field === 'class'));
  assert.equal(run(doc, java).status, 0);
});

test('D4: a measured width is D4 only with --bulk', () => {
  const doc = ours('compartments');
  // the bulk file's widths, wider: "cytosol" 56 against Arial's 48 (research R3.3)
  const java = doc.replace('<bbox w="48.0" h="24.0"', '<bbox w="56.0" h="24.0"');
  assert.notEqual(java, doc);
  only(compareDocuments(doc, java, { bulk: true }), 'D4', 'label bbox w');
  assert.equal(run(doc, java, ['--bulk']).status, 0);
  // and a unit of information's
  const units = ours('attachments');
  const wider = units.replace(
    /(<glyph class="unit of information"[^\n]*\n[^\n]*\n\s*<bbox w=")([^"]*)"/,
    '$1999.0"'
  );
  assert.notEqual(wider, units);
  only(compareDocuments(units, wider, { bulk: true }), 'D4', 'bbox w');
});

test('D5: an OUTPUT with its own segments, start and end swapped, is D5', () => {
  const doc = ours('d5-output-segments');
  // Java's own points for it (fixtures/java/d5-output-segments.sbgn): from the product
  const java = withPoints(
    doc,
    'arc_12_output_1',
    pointsOf(text('java/d5-output-segments.sbgn'), 'arc_12_output_1')
  );
  only(compareDocuments(doc, java, { layout: layout('d5-output-segments') }), 'D5', 'points');
  assert.equal(run(doc, java, layoutArg('d5-output-segments')).status, 0);
});

test('D6: an OUTPUT without its own segments, run to the product, is D6', () => {
  for (const name of ['d6-two-segments', 'd6-four-segments']) {
    const doc = ours(name);
    // Java's own points (fixtures/java/{name}.sbgn): a single point on two segments
    const java = withPoints(
      doc,
      'arc_12_output_1',
      pointsOf(text(`java/${name}.sbgn`), 'arc_12_output_1')
    );
    only(compareDocuments(doc, java, { layout: layout(name) }), 'D6', 'points');
    assert.equal(run(doc, java, layoutArg(name)).status, 0);
  }
});

test('points no reading explains are undeclared, with the layout', () => {
  const doc = ours('d2-two-outputs');
  const points = pointsOf(doc, 'arc_11_input_1');
  const moved = points.map(([x, y], i): [string, string] =>
    i === points.length - 1 ? [x, '301.0'] : [x, y]
  );
  const java = withPoints(doc, 'arc_11_input_1', moved);
  only(compareDocuments(doc, java, { layout: layout('d2-two-outputs') }), 'undeclared', 'points');
  assert.equal(run(doc, java, layoutArg('d2-two-outputs')).status, 1);
  // and ours changed, Java's its own reading
  const theirs = text('java/d2-two-outputs.sbgn');
  const ourMoved = withPoints(
    doc,
    'arc_11_input_1',
    pointsOf(theirs, 'arc_11_input_1').map(([x]) => [x, '0.0'])
  );
  const differences = compareDocuments(
    ourMoved,
    withPoints(doc, 'arc_11_input_1', pointsOf(theirs, 'arc_11_input_1')),
    {
      layout: layout('d2-two-outputs'),
    }
  );
  only(differences, 'undeclared', 'points');
});

test('an OUTPUT ending on the second segment, as D6 was first written, is undeclared', () => {
  // d6-four-segments (TT--): the old rule ran the arc along s1 and ended at s1.to
  // (600, 298), short of the product; Java's own points are its reading
  const name = 'd6-four-segments';
  const java = text(`java/${name}.sbgn`);
  const javaPoints = pointsOf(java, 'arc_12_output_1');
  const oldRule: [string, string][] = [
    ['300.0', '302.0'],
    ...javaPoints.slice(1, -1),
    ['600.0', '298.0'],
  ];
  const doc = withPoints(ours(name), 'arc_12_output_1', oldRule);
  const differences = compareDocuments(doc, withPoints(doc, 'arc_12_output_1', javaPoints), {
    layout: layout(name),
  });
  only(differences, 'undeclared', 'points');
});

test('a points difference without the layout is undeclared', () => {
  const doc = ours('d2-two-outputs');
  const java = withPoints(
    doc,
    'arc_11_input_1',
    pointsOf(text('java/d2-two-outputs.sbgn'), 'arc_11_input_1')
  );
  only(compareDocuments(doc, java), 'undeclared', 'points');
  assert.equal(run(doc, java).status, 1);
});

test('a width difference without --bulk is undeclared', () => {
  const doc = ours('compartments');
  const java = doc.replace('<bbox w="48.0" h="24.0"', '<bbox w="56.0" h="24.0"');
  only(compareDocuments(doc, java), 'undeclared', 'label bbox w');
  assert.equal(run(doc, java).status, 1);
});

test('48 against 48.0 is undeclared: values are compared as written', () => {
  const doc = ours('compartments');
  const java = doc.replace('<bbox w="48.0" h="24.0"', '<bbox w="48" h="24.0"');
  only(compareDocuments(doc, java, { bulk: true }), 'D4', 'label bbox w');
  only(compareDocuments(doc, java), 'undeclared', 'label bbox w');
  const box = doc.replace('h="24.0"', 'h="24"');
  only(compareDocuments(doc, box, { bulk: true }), 'undeclared', 'label bbox h');
});

test('missing and extra ids, another class or label, are undeclared, and a label is never shown whole', () => {
  const doc = ours('escapes-non-ascii');
  const java = doc
    .replace('class="macromolecule"', 'class="complex"')
    .replace('text="it\'s &gt; 1', 'text="it was &gt; 1');
  const differences = compareDocuments(doc, java);
  assert.ok(differences.length >= 2);
  assert.ok(differences.every((d) => d.kind === 'undeclared'));
  const label = differences.find((d) => d.field === 'label text');
  assert.ok(label?.ours?.endsWith('characters)') && !label.ours.includes('< 2'));
  const missing = doc.replace(/\n {8}<arc [^\n]*\n(?: {12}[^\n]*\n)* {8}<\/arc>/, '');
  assert.ok(compareDocuments(doc, missing).some((d) => d.field === 'arcs: only ours'));
});

test('unreadable input exits 2', () => {
  const doc = ours('compartments');
  assert.equal(run(doc, '<sbgn><map').status, 2);
  assert.equal(
    main(
      ['/no/such/file.sbgn', '/no/such/other.sbgn'],
      () => undefined,
      () => undefined
    ),
    2
  );
  assert.equal(run(doc, doc, ['--layout']).status, 2);
});

test('--json writes the counts and the undeclared differences', () => {
  const doc = ours('compartments');
  const java = doc.replace('<bbox w="48.0" h="24.0"', '<bbox w="56.0" h="24.0"');
  const { status, out } = run(doc, java, ['--json']);
  assert.equal(status, 1);
  const parsed = JSON.parse(out) as { counts: Record<string, number>; undeclared: Difference[] };
  assert.equal(parsed.counts['undeclared'], 1);
  assert.equal(parsed.undeclared[0]?.field, 'label bbox w');
});
