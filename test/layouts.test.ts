// The comparison's fixtures (spec 001 T013): fixtures/layouts/{name}.json, made by hand
// (but reaction-layout.json, the content service's answer for reaction 176318, as
// fixtures/read-layout/reaction.json), and fixtures/java/{name}.sbgn, diagram-exporter
// 2.0.12's answer for each from the reference harness (ci/reference/harness, mode sbgn,
// 7 Nov 2026, with Arial and no network), in Java's own random order. The comparison of
// the two is T015's; this checks that each pair is there, that the ids agree, and that
// each fixture exercises what its name says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { toSbgn } from '../src/index.ts';
import { readLayout, type DiagramLayout } from '../src/layout.ts';
import { ShapeBounds } from '../src/geometry.ts';

const dir = new URL('../fixtures/layouts/', import.meta.url);
const names = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

function text(path: string): string {
  return readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');
}

function layout(name: string): DiagramLayout {
  return readLayout(JSON.parse(text(`layouts/${name}.json`)));
}

/** The ids a document's glyphs (child glyphs and ports too) and arcs carry. */
function ids(sbgn: string): string[] {
  return [...sbgn.matchAll(/<(?:glyph|port|arc) (?:class="[^"]*" )?id="([^"]*)"/g)]
    .map((m) => m[1] ?? '')
    .sort();
}

test('every fixture has its Java answer, and nothing else is there', () => {
  assert.deepEqual(
    readdirSync(new URL('../fixtures/java/', import.meta.url)).sort(),
    names.map((n) => `${n}.sbgn`)
  );
});

for (const name of names) {
  test(`${name}: converts, and writes the ids Java writes`, () => {
    const ours = toSbgn(layout(name));
    const java = text(`java/${name}.sbgn`);
    assert.ok(ids(java).length > 0);
    // D3 renames a class, not an id; nothing else changes which ids are written
    assert.deepEqual(ids(ours), ids(java));
  });
}

/** The touch pattern of an edge's backbone: T a segment touching its shape, - one not. */
function pattern(l: DiagramLayout, edgeId: number): string {
  const edge = l.edges.find((e) => e.id === edgeId);
  assert.ok(edge);
  const bounds = new ShapeBounds(edge.reactionShape);
  return (edge.segments ?? []).map((s) => (bounds.touches(s) ? 'T' : '-')).join('');
}

/** The connectors of a type, with their edges' ids, across the layout. */
function connectors(l: DiagramLayout, type: string): { edgeId: number; own: number }[] {
  return l.nodes.flatMap((n) =>
    n.connectors
      .filter((c) => c.type === type)
      .map((c) => ({ edgeId: c.edgeId, own: c.segments?.length ?? 0 }))
  );
}

const exercises: Record<string, (l: DiagramLayout) => void> = {
  attachments: (l) => {
    const attachments = l.nodes.flatMap((n) => n.nodeAttachments ?? []);
    assert.ok(attachments.length >= 3);
    assert.ok(attachments.some((a) => a.label === undefined));
  },
  compartments: (l) => {
    assert.ok(l.compartments.length >= 2);
  },
  'connector-types': (l) => {
    for (const type of ['INPUT', 'OUTPUT', 'CATALYST', 'INHIBITOR', 'ACTIVATOR']) {
      assert.ok(connectors(l, type).length > 0, type);
    }
  },
  'd2-two-outputs': (l) => {
    const outputs = connectors(l, 'OUTPUT').filter((c) => c.own === 0 && c.edgeId === 1);
    assert.equal(outputs.length, 2);
    assert.ok(connectors(l, 'INPUT').some((c) => c.own === 0 && c.edgeId === 1));
    // a segment off the shape at each end, so Java's readings differ
    assert.equal(pattern(l, 1), '-TT-');
  },
  'd5-output-segments': (l) => {
    assert.ok(connectors(l, 'OUTPUT').some((c) => c.own > 0));
  },
  'd6-two-segments': (l) => {
    assert.ok(connectors(l, 'OUTPUT').some((c) => c.own === 0));
    assert.equal(pattern(l, 1), 'TT');
  },
  'd6-three-segments': (l) => {
    assert.ok(connectors(l, 'OUTPUT').some((c) => c.own === 0));
    assert.equal(pattern(l, 1), '-TT');
  },
  'd6-four-segments': (l) => {
    assert.ok(connectors(l, 'OUTPUT').some((c) => c.own === 0));
    assert.equal(pattern(l, 1), 'TT--');
  },
  'escapes-non-ascii': (l) => {
    const labels = [
      ...l.compartments.map((c) => c.displayName),
      ...l.nodes.map((n) => n.displayName),
      ...l.edges.map((e) => e.displayName),
      ...l.nodes.flatMap((n) => (n.nodeAttachments ?? []).map((a) => a.label ?? '')),
    ].join('');
    for (const c of ['&', '<', '>', '"', "'"]) assert.ok(labels.includes(c), c);
    // a character outside printable ASCII
    assert.ok(/[^ -~]/.test(labels));
  },
  'faded-crossed-counter': (l) => {
    const faded = l.nodes.find((n) => n.isFadeOut !== undefined);
    const crossed = l.nodes.find((n) => n.isCrossed !== undefined);
    assert.ok(faded?.nodeAttachments?.length && crossed?.nodeAttachments?.length);
    const last = l.nodes.findLastIndex((n) => (n.nodeAttachments?.length ?? 0) > 0);
    assert.ok(last > l.nodes.indexOf(faded) && last > l.nodes.indexOf(crossed));
    assert.ok(l.edges.some((e) => e.isFadeOut !== undefined));
  },
  'node-classes': (l) => {
    const classes = new Set(l.nodes.map((n) => n.renderableClass));
    for (const c of ['Complex', 'Protein', 'Chemical', 'ProcessNode', 'EncapsulatedNode']) {
      assert.ok(classes.has(c), c);
    }
    assert.ok(classes.has('ComplexDrug') && classes.has('Gene') && classes.has('EntitySet'));
  },
  'reaction-layout': (l) => {
    assert.deepEqual(l, readLayout(JSON.parse(text('read-layout/reaction.json'))));
  },
  'reaction-shapes': (l) => {
    const shapes = l.edges.map((e) => `${e.reactionShape.type}${e.reactionShape.s ?? ''}`);
    assert.deepEqual(shapes.sort(), ['BOX', 'BOX?', 'BOXomitted', 'CIRCLE', 'DOUBLE_CIRCLE']);
  },
  stoichiometry: (l) => {
    const counts = l.nodes.flatMap((n) => n.connectors.map((c) => c.stoichiometry));
    assert.ok(counts.some((s) => s.shape !== undefined && s.value > 1));
    assert.ok(counts.some((s) => s.shape === undefined));
  },
};

test('each fixture exercises what its name says', () => {
  assert.deepEqual(Object.keys(exercises).sort(), names);
  for (const name of names) exercises[name]?.(layout(name));
});
