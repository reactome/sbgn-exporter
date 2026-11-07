// Every fixture's output against Java's answer (spec 001 T015): fixtures/layouts/{name}.json
// converted by this exporter, and fixtures/java/{name}.sbgn, diagram-exporter 2.0.12's
// answer from the reference harness (T013).
//
// 1. The comparison (ci/compare.ts), with the layout: no difference may be undeclared.
// 2. Every byte outside the declared kinds is Java's: Java's answer is rewritten by the
//    declared differences the comparison found, and nothing else (its glyphs and arcs put
//    in our order, D1; `stoichiometry` written `cardinality`, D3; an arc's points
//    replaced by ours where they are a declared difference, D2, D5, D6), and must then be
//    our text exactly: declaration, indentation, attribute order, escapes and numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { compareDocuments, type Difference } from '../ci/compare.ts';
import { toSbgn } from '../src/index.ts';
import { readLayout, type DiagramLayout } from '../src/layout.ts';

const names = readdirSync(new URL('../fixtures/layouts/', import.meta.url))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

function text(path: string): string {
  return readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');
}

function layout(name: string): DiagramLayout {
  return readLayout(JSON.parse(text(`layouts/${name}.json`)));
}

/** A document cut into its head, its top-level glyph and arc blocks by id, and its tail. */
interface Blocks {
  readonly head: string;
  readonly blocks: readonly { readonly id: string; readonly text: string }[];
  readonly tail: string;
}

function blocks(doc: string): Blocks {
  const lines = doc.split('\n');
  const open = /^ {8}<(glyph|arc) [^>]*\bid="([^"]*)"/;
  const first = lines.findIndex((line) => open.test(line));
  const end = lines.lastIndexOf('    </map>');
  assert.ok(first > 0 && end > first);
  const found: { id: string; text: string }[] = [];
  let i = first;
  while (i < end) {
    const match = open.exec(lines[i] ?? '');
    assert.ok(match, `line ${String(i + 1)}: ${lines[i] ?? ''}`);
    const [, name = '', id = ''] = match;
    const close = lines.indexOf(`        </${name}>`, i);
    assert.ok(close > i);
    found.push({ id, text: lines.slice(i, close + 1).join('\n') });
    i = close + 1;
  }
  return {
    head: lines.slice(0, first).join('\n'),
    blocks: found,
    tail: lines.slice(end).join('\n'),
  };
}

/** An arc block's point lines: start, nexts, end. */
function pointLines(block: string): string[] {
  return block.split('\n').filter((line) => /^ {12}<(start|next|end) /.test(line));
}

/**
 * Java's answer rewritten by the declared differences found, and nothing else: our order
 * (D1), cardinality (D3), and our points where a points difference is declared (D2, D5,
 * D6). Differences of any other kind are left as Java wrote them.
 */
function rewritten(ours: string, java: string, differences: readonly Difference[]): string {
  const our = blocks(ours);
  const theirs = new Map(blocks(java).blocks.map((b) => [b.id, b.text]));
  const declaredPoints = new Set(
    differences
      .filter((d) => d.field === 'points' && ['D2', 'D5', 'D6'].includes(d.kind))
      .map((d) => d.id)
  );
  const d3 = differences.some((d) => d.kind === 'D3');
  const ordered = our.blocks.map(({ id, text: ourBlock }) => {
    let block = theirs.get(id) ?? '';
    if (d3 && id.startsWith('arc_')) {
      block = block.replaceAll('<glyph class="stoichiometry"', '<glyph class="cardinality"');
    }
    if (declaredPoints.has(id)) {
      const lines = block.split('\n').filter((line) => !/^ {12}<(start|next|end) /.test(line));
      lines.splice(lines.length - 1, 0, ...pointLines(ourBlock));
      block = lines.join('\n');
    }
    return block;
  });
  const javaParts = blocks(java);
  return [javaParts.head, ...ordered, javaParts.tail].join('\n');
}

for (const name of names) {
  test(`${name}: only declared differences from Java's answer, and Java's bytes otherwise`, () => {
    const ours = toSbgn(layout(name));
    const java = text(`java/${name}.sbgn`);
    const differences = compareDocuments(ours, java, { layout: layout(name) });
    assert.deepEqual(
      differences.filter((d) => d.kind === 'undeclared'),
      []
    );
    assert.equal(rewritten(ours, java, differences), ours);
  });
}

test("a changed label in Java's answer is undeclared, and its bytes are not ours", () => {
  const name = 'escapes-non-ascii';
  const ours = toSbgn(layout(name));
  const planted = text(`java/${name}.sbgn`).replace('&quot;quoted&quot;', '&quot;quote&quot;');
  assert.notEqual(planted, text(`java/${name}.sbgn`));
  const differences = compareDocuments(ours, planted, { layout: layout(name) });
  const undeclared = differences.filter((d) => d.kind === 'undeclared');
  assert.equal(undeclared.length, 1);
  assert.equal(undeclared[0]?.field, 'label text');
  assert.notEqual(rewritten(ours, planted, differences), ours);
});

test('a byte the comparison does not see, an escape written otherwise, is caught by the text', () => {
  // `&#34;` and `&quot;` read the same, so the comparison, which reads values, sees no
  // difference; the text does
  const name = 'escapes-non-ascii';
  const ours = toSbgn(layout(name));
  const java = text(`java/${name}.sbgn`).replace('&quot;quoted&quot;', '&#34;quoted&#34;');
  assert.notEqual(java, text(`java/${name}.sbgn`));
  const differences = compareDocuments(ours, java, { layout: layout(name) });
  assert.deepEqual(
    differences.filter((d) => d.kind === 'undeclared'),
    []
  );
  assert.notEqual(rewritten(ours, java, differences), ours);
});
