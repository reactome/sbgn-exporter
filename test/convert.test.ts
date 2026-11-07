// The mapping from a diagram layout to an SBGN-ML document model (spec 001 T009, research
// R2), on the layouts of fixtures/read-layout/ (cut from release 98 and the content
// service), fixtures/geometry/ports.json, and fixtures/convert/classes.json: made by hand
// for this test, with every node class Java tells apart (and some it does not), units of
// information with and without a label on written, faded-out and crossed-out nodes, every
// reaction shape and text, every connector type, cardinalities, a faded-out reaction, and
// two compartments, one named outside ASCII.
//
// fixtures/convert/java/{name}.json is diagram-exporter 2.0.12's own answer for each
// (7 Nov 2026, OpenJDK 11.0.32 with Arial, headless, offline): a scratch program read the
// layout with diagram-reader 1.2.5's DiagramFactory, ran SbgnConverter.getSbgn(), and wrote
// its map as JSON, glyphs and arcs sorted by id (Java's order is random), floats widened to
// double. Written as Java wrote them, never edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert } from '../src/convert.ts';
import { arcPoints } from '../src/geometry.ts';
import { readLayout, SbgnLayoutError, type DiagramLayout } from '../src/layout.ts';
import type { Arc, Glyph, SbgnDocument } from '../src/model.ts';

type Json = Record<string, unknown>;

function json(path: string): Json {
  return JSON.parse(readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8')) as Json;
}

const FIXTURES = {
  pathway: 'read-layout/pathway.json',
  disease: 'read-layout/disease.json',
  reaction: 'read-layout/reaction.json',
  ports: 'geometry/ports.json',
  classes: 'convert/classes.json',
} as const;

function layoutOf(name: keyof typeof FIXTURES): DiagramLayout {
  return readLayout(json(FIXTURES[name]));
}

interface JavaGlyph {
  class: string;
  id: string;
  glyphs: JavaGlyph[];
  [key: string]: unknown;
}

interface JavaArc {
  class: string;
  id: string;
  glyphs: JavaGlyph[];
  start?: unknown;
  next?: unknown;
  end?: unknown;
  [key: string]: unknown;
}

interface JavaDocument {
  language: string;
  glyphs: JavaGlyph[];
  arcs: JavaArc[];
}

function java(name: keyof typeof FIXTURES): JavaDocument {
  return json(`convert/java/${name}.json`) as unknown as JavaDocument;
}

/** D3, applied to Java's: `stoichiometry` written `cardinality`. */
function d3(glyph: JavaGlyph): JavaGlyph {
  return {
    ...glyph,
    class: glyph.class === 'stoichiometry' ? 'cardinality' : glyph.class,
    glyphs: glyph.glyphs.map(d3),
  };
}

const byId = <T extends { id: string }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Ours, as the harness lists Java's: sorted by id, child glyphs too (D1 aside). */
function sorted(glyph: Glyph): unknown {
  return { ...glyph, glyphs: byId(glyph.glyphs).map(sorted) };
}

function oursWithoutPoints(arc: Arc): unknown {
  const { start, next, end, ...rest } = arc;
  return { ...rest, glyphs: byId(rest.glyphs).map(sorted) };
}

/** Java's arc, D3 applied to its cardinality. */
function javaWithoutPoints(arc: JavaArc): unknown {
  const { start, next, end, ...rest } = arc;
  return { ...rest, glyphs: byId(rest.glyphs).map(d3) };
}

/** The node, connector and edge an arc id `arc_{node}_{type}_{edge}` names. */
function participant(layout: DiagramLayout, id: string) {
  const [, nodeId, type, edgeId] = /^arc_(-?\d+)_([a-z]+)_(-?\d+)$/.exec(id) ?? [];
  const node = layout.nodes.find((n) => String(n.id) === nodeId);
  const edge = layout.edges.find((e) => String(e.id) === edgeId);
  const connector = node?.connectors.find(
    (c) => String(c.edgeId) === edgeId && c.type.toLowerCase() === type
  );
  assert.ok(node && edge && connector, id);
  return { node, connector, edge };
}

for (const name of Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]) {
  test(`${name}: every glyph is Java's, D3 applied`, () => {
    const ours = convert(layoutOf(name));
    const theirs = java(name);
    assert.equal(ours.language, theirs.language);
    assert.deepEqual(byId(ours.glyphs).map(sorted), byId(theirs.glyphs).map(d3));
  });

  test(`${name}: every arc is Java's, its points as T008 computes them`, () => {
    const layout = layoutOf(name);
    const ours = convert(layout);
    const theirs = java(name);
    assert.deepEqual(
      byId(ours.arcs).map(oursWithoutPoints),
      byId(theirs.arcs).map(javaWithoutPoints)
    );
    // Java's points depend on the order it wrote a reaction's OUTPUT arcs in (D2), and
    // D5 and D6 change an OUTPUT's: where a reaction has none, ours are Java's exactly;
    // every arc's are geometry.ts's for its participant.
    const producing = new Set(
      theirs.arcs.filter((a) => a.class === 'production').map((a) => a.id.split('_')[3])
    );
    const javaArcs = new Map(theirs.arcs.map((a) => [a.id, a]));
    for (const arc of ours.arcs) {
      const { node, connector, edge } = participant(layout, arc.id);
      const points = { start: arc.start, next: arc.next, end: arc.end };
      assert.deepEqual(points, arcPoints(node, connector, edge), arc.id);
      const javaArc = javaArcs.get(arc.id);
      if (!producing.has(arc.id.split('_')[3])) {
        assert.deepEqual(
          points,
          { start: javaArc?.start, next: javaArc?.next, end: javaArc?.end },
          arc.id
        );
      }
    }
  });
}

test('the order is fixed by the layout (D1)', () => {
  const ours = convert(layoutOf('classes'));
  assert.deepEqual(
    ours.glyphs.map((g) => g.id),
    [
      'compartmentVertex_7001_1',
      'compartmentVertex_7002_2',
      // nodes in layout order, left-out ones (22, 23) skipped
      ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24].map((id) => {
        const node = layoutOf('classes').nodes.find((n) => n.id === id);
        return `entityVertex_${String(node?.reactomeId)}_${String(id)}`;
      }),
      // reactions in layout order, 57 (faded out) skipped
      ...[50, 51, 52, 53, 54, 55, 56].map((id) => {
        const edge = layoutOf('classes').edges.find((e) => e.id === id);
        return `reactionVertex_${String(edge?.reactomeId)}_${String(id)}`;
      }),
    ]
  );
  // arcs by node, then connector: node 12's OUTPUT to 50 before its INPUT to 55
  assert.deepEqual(
    ours.arcs.map((a) => a.id),
    [
      'arc_10_input_50',
      'arc_11_catalyst_50',
      'arc_12_output_50',
      'arc_12_input_55',
      'arc_13_input_51',
      'arc_14_output_51',
      'arc_14_input_56',
      'arc_15_inhibitor_51',
      'arc_16_input_52',
      'arc_17_output_52',
      'arc_18_activator_52',
      'arc_19_input_53',
      'arc_20_output_53',
      'arc_21_input_54',
      'arc_24_output_54',
    ]
  );
  // and the same twice
  assert.deepEqual(convert(layoutOf('classes')), ours);
});

function glyph(doc: SbgnDocument, id: string): Glyph {
  const found = doc.glyphs.find((g) => g.id === id);
  assert.ok(found, id);
  return found;
}

test('units of information are counted across written nodes only', () => {
  const layout = layoutOf('classes');
  const doc = convert(layout);
  const units = doc.glyphs.flatMap((g) => g.glyphs).map((g) => [g.id, g.label.text]);
  const rid = (node: number, i: number): string =>
    String(layout.nodes.find((n) => n.id === node)?.nodeAttachments?.[i]?.reactomeId);
  // node 12's two, then node 24's: the faded-out 22's two and the crossed-out 23's one
  // (isCrossed false: present, so left out) take no number. Java: the same ids.
  assert.deepEqual(units, [
    [`entityVertex_${rid(12, 0)}_1_mt`, 'P'],
    [`entityVertex_${rid(12, 1)}_2_mt`, 'mt:prot'],
    [`entityVertex_${rid(24, 0)}_3_mt`, 'Ser-473'],
  ]);
});

test("a node's class follows the start of its renderableClass", () => {
  const layout = layoutOf('classes');
  const doc = convert(layout);
  const classOf = (id: number): string => {
    const node = layout.nodes.find((n) => n.id === id);
    return glyph(doc, `entityVertex_${String(node?.reactomeId)}_${String(id)}`).class;
  };
  assert.deepEqual(
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((id) => classOf(id)),
    [
      'complex', // Complex
      'complex', // ComplexDrug
      'macromolecule', // Protein
      'macromolecule', // ProteinDrug
      'simple chemical', // Chemical
      'simple chemical', // ChemicalDrug
      'submap', // ProcessNode
      'submap', // EncapsulatedNode
      'unspecified entity', // EntitySet
      'unspecified entity', // Gene
      'unspecified entity', // RNA
      'unspecified entity', // Entity
    ]
  );
});

test("a reaction's class follows its shape and text", () => {
  const layout = layoutOf('classes');
  const doc = convert(layout);
  const classOf = (id: number): string => {
    const edge = layout.edges.find((e) => e.id === id);
    return glyph(doc, `reactionVertex_${String(edge?.reactomeId)}_${String(id)}`).class;
  };
  assert.deepEqual(
    [50, 51, 52, 53, 54, 55, 56].map((id) => classOf(id)),
    [
      'process', // BOX
      'uncertain process', // BOX, '?'
      'omitted process', // BOX, other text
      'process', // BOX, '' (Java: empty is none)
      'association', // CIRCLE
      'dissociation', // DOUBLE_CIRCLE
      'uncertain process', // CIRCLE, '?': the text first
    ]
  );
});

test("a cardinality (D3) is boxed in float step by step, as Java's", () => {
  const layout = layoutOf('classes');
  const arc = convert(layout).arcs.find((a) => a.id === 'arc_10_input_50');
  const node = layout.nodes.find((n) => n.id === 10);
  const edge = layout.edges.find((e) => e.id === 50);
  // Java: class stoichiometry, the rest the same
  assert.deepEqual(arc?.glyphs, [
    {
      class: 'cardinality',
      id: `Stoichiometry_${String(node?.reactomeId)}_INPUT_${String(edge?.reactomeId)}`,
      label: { text: '2' },
      bbox: { x: 336.0299987792969, y: 50, w: 5.95001220703125, h: 10.099998474121094 },
      glyphs: [],
      ports: [],
    },
  ]);
  // b - a rounded once would be other floats
  assert.notEqual(Math.fround(341.98 - 336.03), 5.95001220703125);
  assert.notEqual(Math.fround(60.1 - 50), 10.099998474121094);
});

test('a left-out node, reaction or connector writes nothing, and is not read', () => {
  const doc = convert(layoutOf('classes'));
  const ids = [...doc.glyphs.map((g) => g.id), ...doc.arcs.map((a) => a.id)];
  // node 22 (faded out, its connector naming the missing edge 99), node 23 (crossed out),
  // reaction 57 (faded out, isFadeOut false), and node 10's INPUT to it
  for (const part of ['_22', '_23', '_57']) {
    assert.ok(!ids.some((id) => id.endsWith(part)), part);
  }
});

/** A layout file as parsed, with the fields these tests change typed. */
interface RawLayout {
  compartments: { displayName: string; reactomeId?: unknown }[];
  nodes: { id: number; connectors: { edgeId: number }[] }[];
  edges: { segments?: unknown }[];
}

function raw(path: string): RawLayout {
  return json(path) as unknown as RawLayout;
}

function at<T>(list: T[], index: number): T {
  const item = list[index];
  assert.ok(item !== undefined, String(index));
  return item;
}

function refused(layout: unknown, message: RegExp): void {
  assert.throws(
    () => convert(readLayout(layout)),
    (error: unknown) => error instanceof SbgnLayoutError && message.test(error.message)
  );
}

test("a written node's connector naming no edge is refused, as Java's NullPointerException", () => {
  const layout = raw(FIXTURES.classes);
  at(at(layout.nodes, 0).connectors, 0).edgeId = 98;
  refused(
    layout,
    /^Diagram layout, node 10 \(reactomeId \d+\): its INPUT names edge 98, which the diagram does not have$/
  );
});

test('an arc without points is refused (Java writes it without start or end)', () => {
  // ACTIVATOR 18 without segments of its own, on reaction 52 left without a backbone;
  // its INPUT and OUTPUT removed, which would be refused first
  const layout = raw(FIXTURES.classes);
  delete at(layout.edges, 2).segments;
  at(layout.nodes, 6).connectors = [];
  at(layout.nodes, 7).connectors = [];
  refused(
    layout,
    /node 18 \(reactomeId \d+\): its ACTIVATOR to edge 52 \(reactomeId \d+\) has no points/
  );
});

test('a repeated id is refused (Java writes it twice)', () => {
  const layout = raw(FIXTURES.classes);
  layout.nodes.push(structuredClone(at(layout.nodes, 1)));
  refused(layout, /^Diagram layout R-HSA-0: the id entityVertex_\d+_11 would be written twice$/);
});

test("what geometry refuses, Java's exceptions, is refused", () => {
  // order.json: a reaction none of whose segments touches its shape
  refused(json('geometry/order.json'), /edge 22 .*: no segment of its backbone touches its shape/);
  // arcs.json: an INPUT (node 123) on a reaction without a backbone, the only node kept
  const arcs = raw('geometry/arcs.json');
  arcs.nodes = arcs.nodes.filter((node) => node.id === 123);
  refused(
    arcs,
    /node 123 .*: its INPUT to edge 15 .* has no segments of its own, and the reaction's backbone/
  );
});

test('a label the width table cannot measure as Java does is refused, naming it', () => {
  const layout = raw(FIXTURES.classes);
  at(layout.compartments, 0).displayName = 'cytosol \u{1F600}';
  refused(layout, /^Diagram layout, compartment 1 \(reactomeId 7001\): Java measures/);
});

test('a compartment without a reactomeId is written with `null` in its id, as Java writes it', () => {
  // Java's own answer for reaction R-HSA-507937's layout (fixtures/java/
  // reaction-outer-compartment.sbgn, the reference harness, 7 Nov 2026), and on the
  // content service the same day: compartmentVertex_null_{id} for the nuclear envelope
  const layout = raw(FIXTURES.classes);
  delete at(layout.compartments, 0).reactomeId;
  const doc = convert(readLayout(layout));
  const [first] = doc.glyphs;
  assert.deepEqual([first?.id, first?.label.text], ['compartmentVertex_null_1', 'cytosol']);
});
