// Reading the diagram layout (spec 001 T007, data-model.md). The fixtures in
// fixtures/read-layout/ are real layouts, cut down and with every field they had kept,
// read or not:
// - pathway.json: six reactions of release 98's diagram file R-HSA-69620, with the nodes
//   they connect (other connectors removed), one compartment and one each of the notes,
//   links and shadows;
// - disease.json: two reactions of release 98's R-HSA-5083635 with their nodes, among
//   them a crossed-out node and a faded-out reaction, and two crossed and faded nodes;
// - reaction.json: the layout of reaction 176318 as the website's content service
//   answers it (its `diagram`, without its `graph`), whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLayout, SbgnLayoutError, type DiagramLayout } from '../src/layout.ts';

type Json = Record<string, unknown>;

function fixture(name: string): Json {
  const url = new URL(`../fixtures/read-layout/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Json;
}

function find<T extends { id: number }>(list: readonly T[], id: number): T {
  const found = list.find((item) => item.id === id);
  assert.ok(found, `id ${String(id)}`);
  return found;
}

test("a reaction's layout, as the content service answers it, is read", () => {
  const layout = readLayout(fixture('reaction'));
  assert.equal(layout.stableId, 'R-HSA-69620');
  assert.deepEqual(layout.compartments, [
    {
      id: 2,
      reactomeId: 7660,
      displayName: 'nucleoplasm',
      prop: { x: 0, y: 0, width: 640, height: 145 },
      textPosition: { x: 564, y: 112 },
    },
  ]);
  assert.deepEqual(
    layout.nodes.map((n) => [n.id, n.reactomeId, n.renderableClass]),
    [
      [3, 176282, 'Protein'],
      [4, 68564, 'Complex'],
      [5, 176229, 'Complex'],
    ]
  );
  assert.deepEqual(find(layout.nodes, 3), {
    id: 3,
    reactomeId: 176282,
    displayName: 'CLSPN',
    renderableClass: 'Protein',
    prop: { x: 43.5, y: 85, width: 67, height: 40 },
    connectors: [
      {
        edgeId: 1,
        type: 'INPUT',
        segments: [
          { from: { x: 110.5, y: 105 }, to: { x: 219, y: 105 } },
          { from: { x: 219, y: 105 }, to: { x: 294, y: 72.5 } },
        ],
        stoichiometry: { value: 1 },
      },
    ],
  });
  assert.deepEqual(layout.edges, [
    {
      id: 1,
      reactomeId: 176318,
      displayName: 'Loading of claspin onto DNA during replication origin firing',
      reactionShape: { type: 'CIRCLE', c: { x: 320, y: 72.5 }, r: 6 },
      segments: [
        { from: { x: 314, y: 72.5 }, to: { x: 294, y: 72.5 } },
        { from: { x: 326, y: 72.5 }, to: { x: 346, y: 72.5 } },
      ],
    },
  ]);
});

test("a pathway's diagram file is read: attachments, stoichiometry boxes and every reaction shape", () => {
  const layout = readLayout(fixture('pathway'));
  assert.equal(layout.stableId, 'R-HSA-69620');
  assert.equal(layout.nodes.length, 14);
  assert.deepEqual(
    layout.edges.map((e) => [e.id, e.reactionShape.type, e.reactionShape.s]),
    [
      [9999542, 'BOX', undefined],
      [9999543, 'BOX', '\\\\'],
      [9999577, 'DOUBLE_CIRCLE', undefined],
      [9999563, 'CIRCLE', undefined],
      [9999567, 'BOX', '\\\\'],
      [9999552, 'BOX', '\\\\'],
    ]
  );
  assert.deepEqual(find(layout.edges, 9999577).reactionShape, {
    type: 'DOUBLE_CIRCLE',
    c: { x: 2405, y: 462 },
    r: 5,
  });
  const box = find(layout.edges, 9999543).reactionShape;
  assert.equal(box.type, 'BOX');
  assert.deepEqual(Object.keys(box).sort(), ['a', 'b', 's', 'type']);

  const attached = find(layout.nodes, 24);
  assert.equal(attached.nodeAttachments?.length, 1);
  const [attachment] = attached.nodeAttachments ?? [];
  assert.ok(attachment);
  assert.deepEqual(Object.keys(attachment).sort(), ['label', 'reactomeId', 'shape']);
  assert.equal(attachment.label, 'P');
  assert.deepEqual(Object.keys(attachment.shape), ['a']);

  const counted = find(layout.nodes, 173).connectors.find((c) => c.edgeId === 9999563);
  assert.deepEqual(counted?.stoichiometry, {
    value: 2,
    shape: { a: { x: 2025, y: 233 }, b: { x: 2037, y: 245 } },
  });
  assert.deepEqual(
    new Set(layout.nodes.flatMap((n) => n.connectors.map((c) => c.type))),
    new Set(['INPUT', 'OUTPUT', 'INHIBITOR', 'ACTIVATOR'])
  );
});

test('faded-out and crossed-out objects are read with their flags; others have none', () => {
  const layout = readLayout(fixture('disease'));
  const flags = (n: DiagramLayout['nodes'][number]): unknown[] => [n.id, n.isFadeOut, n.isCrossed];
  assert.deepEqual(layout.nodes.map(flags), [
    [775, true, undefined],
    [1303, undefined, undefined],
    [1305, true, true],
    [2088, true, undefined],
    [3484, true, undefined],
    [10061681, undefined, undefined],
    [759, undefined, undefined],
    [762, true, true],
  ]);
  assert.ok(
    !('isFadeOut' in find(layout.nodes, 1303)),
    'an absent flag is not written as undefined'
  );
  assert.ok(!('isCrossed' in find(layout.nodes, 1303)));
  assert.equal(find(layout.edges, 3483).isFadeOut, true);
  assert.ok(!('isFadeOut' in find(layout.edges, 10061680)));
  // a faded-out node's attachments are read too: the conversion leaves them out, uncounted
  assert.deepEqual(
    find(layout.nodes, 775).nodeAttachments?.map((a) => a.label),
    ['Man', 'Man', 'Man']
  );
});

test('a present false is kept, and a null is read as absent, as Java reads both', () => {
  const layout = fixture('reaction');
  const nodes = layout['nodes'] as Json[];
  (nodes[0] as Json)['isFadeOut'] = false;
  (nodes[1] as Json)['isCrossed'] = null;
  (nodes[1] as Json)['nodeAttachments'] = null;
  const read = readLayout(layout);
  const [kept, absent] = read.nodes;
  assert.ok(kept && absent);
  assert.equal(kept.isFadeOut, false);
  assert.ok(!('isCrossed' in absent));
  assert.ok(!('nodeAttachments' in absent));
});

test("optional fields absent, as Java allows: an attachment's label, a connector's or edge's segments", () => {
  const layout = fixture('pathway');
  const node = (layout['nodes'] as Json[]).find((n) => n['id'] === 24) as Json;
  delete ((node['nodeAttachments'] as Json[])[0] as Json)['label'];
  delete ((node['connectors'] as Json[])[0] as Json)['segments'];
  delete ((layout['edges'] as Json[])[0] as Json)['segments'];
  const read = readLayout(layout);
  const attached = find(read.nodes, 24);
  assert.ok(!('label' in (attached.nodeAttachments?.[0] ?? {})));
  assert.ok(!('segments' in (attached.connectors[0] ?? {})));
  assert.ok(!('segments' in (read.edges[0] ?? {})));
});

test('reading alters nothing it was given and keeps none of its objects', () => {
  for (const name of ['pathway', 'disease', 'reaction']) {
    const layout = fixture(name);
    const before = structuredClone(layout);
    const read = readLayout(layout);
    assert.deepEqual(layout, before, name);
    assert.notEqual(read.nodes, layout['nodes']);
    assert.notEqual(read.nodes[0], (layout['nodes'] as Json[])[0]);
    assert.notEqual(read.edges[0]?.segments, ((layout['edges'] as Json[])[0] as Json)['segments']);
  }
});

/** The reaction fixture with one change made by `change`. */
function changed(change: (layout: Json, node: Json, edge: Json) => void): Json {
  const layout = fixture('reaction');
  const node = (layout['nodes'] as Json[])[0] as Json;
  const edge = (layout['edges'] as Json[])[0] as Json;
  change(layout, node, edge);
  return layout;
}

function connector(node: Json): Json {
  return (node['connectors'] as Json[])[0] as Json;
}

const NODE = 'node 3 (reactomeId 176282, nodes[0])';
const EDGE = 'edge 1 (reactomeId 176318, edges[0])';

const refusals: [string, unknown, string][] = [
  // the layout itself
  ['not an object', 'R-HSA-69620', 'the diagram is "R-HSA-69620"; expected an object'],
  ['a list for an object', [], 'the diagram is []; expected an object'],
  [
    'no stable id',
    changed((l) => delete l['stableId']),
    'the diagram: stableId is missing; expected text',
  ],
  [
    'nodes not a list',
    changed((l) => (l['nodes'] = {})),
    'the diagram: nodes is {}; expected a list',
  ],
  [
    'a node that is not an object',
    changed((l) => ((l['nodes'] as unknown[])[1] = 5)),
    'the diagram: nodes[1] is 5; expected an object',
  ],
  // a diagram object's ids, named by its place until they are read
  [
    "a node's id as text",
    changed((_, n) => (n['id'] = '3')),
    'the diagram: nodes[0].id is "3"; expected a whole number within ±2^53',
  ],
  [
    "a compartment's id a fraction",
    changed((l) => (((l['compartments'] as Json[])[0] as Json)['id'] = 2.5)),
    'the diagram: compartments[0].id is 2.5; expected a whole number within ±2^53',
  ],
  [
    "an edge's reactomeId beyond a double's whole numbers",
    changed((_, __, e) => (e['reactomeId'] = 2 ** 53)),
    'edge 1 (edges[0]): reactomeId is 9007199254740992; expected a whole number within ±2^53',
  ],
  // the rest, named by the object's ids
  [
    "a node's name a number",
    changed((_, n) => (n['displayName'] = 7)),
    `${NODE}: displayName is 7; expected text`,
  ],
  [
    "a compartment's text position missing",
    changed((l) => delete ((l['compartments'] as Json[])[0] as Json)['textPosition']),
    'compartment 2 (reactomeId 7660, compartments[0]): textPosition is missing; expected an object',
  ],
  [
    "a node's box null",
    changed((_, n) => (n['prop'] = null)),
    `${NODE}: prop is missing; expected an object`,
  ],
  [
    "a node's box with a coordinate as text",
    changed((_, n) => ((n['prop'] as Json)['x'] = '43.5')),
    `${NODE}: prop.x is "43.5"; expected a number`,
  ],
  [
    "a node's flag as text",
    changed((_, n) => (n['isFadeOut'] = 'true')),
    `${NODE}: isFadeOut is "true"; expected true or false`,
  ],
  [
    "a node's cross as a number",
    changed((_, n) => (n['isCrossed'] = 1)),
    `${NODE}: isCrossed is 1; expected true or false`,
  ],
  [
    "a node's renderable class missing",
    changed((_, n) => delete n['renderableClass']),
    `${NODE}: renderableClass is missing; expected text`,
  ],
  [
    "a node's attachments not a list",
    changed((_, n) => (n['nodeAttachments'] = { label: 'P' })),
    `${NODE}: nodeAttachments is {"label":"P"}; expected a list`,
  ],
  [
    "an attachment's label a number",
    changed(
      (_, n) => (n['nodeAttachments'] = [{ reactomeId: 1, label: 1, shape: { a: { x: 0, y: 0 } } }])
    ),
    `${NODE}: nodeAttachments[0].label is 1; expected text`,
  ],
  [
    "an attachment's corner missing",
    changed((_, n) => (n['nodeAttachments'] = [{ reactomeId: 1, shape: {} }])),
    `${NODE}: nodeAttachments[0].shape.a is missing; expected an object`,
  ],
  [
    "a node's connectors missing",
    changed((_, n) => delete n['connectors']),
    `${NODE}: connectors is missing; expected a list`,
  ],
  [
    "a connector's edge as text",
    changed((_, n) => (connector(n)['edgeId'] = '1')),
    `${NODE}: connectors[0].edgeId is "1"; expected a whole number within ±2^53`,
  ],
  [
    "a connector's type unknown",
    changed((_, n) => (connector(n)['type'] = 'input')),
    `${NODE}: connectors[0].type is "input"; expected one of INPUT, OUTPUT, CATALYST, INHIBITOR, ACTIVATOR`,
  ],
  [
    "a connector's segment's point as text",
    changed(
      (_, n) => (((connector(n)['segments'] as Json[])[1] as Json)['to'] = { x: 294, y: '72.5' })
    ),
    `${NODE}: connectors[0].segments[1].to.y is "72.5"; expected a number`,
  ],
  [
    "a connector's stoichiometry missing",
    changed((_, n) => delete connector(n)['stoichiometry']),
    `${NODE}: connectors[0].stoichiometry is missing; expected an object`,
  ],
  [
    'a stoichiometry a fraction',
    changed((_, n) => (connector(n)['stoichiometry'] = { value: 1.5 })),
    `${NODE}: connectors[0].stoichiometry.value is 1.5; expected a whole number that fits a Java int`,
  ],
  [
    "a stoichiometry beyond Java's int",
    changed((_, n) => (connector(n)['stoichiometry'] = { value: 2 ** 31 })),
    `${NODE}: connectors[0].stoichiometry.value is 2147483648; expected a whole number that fits a Java int`,
  ],
  [
    "a stoichiometry box's corner missing",
    changed((_, n) => (connector(n)['stoichiometry'] = { value: 2, shape: { a: { x: 0, y: 0 } } })),
    `${NODE}: connectors[0].stoichiometry.shape.b is missing; expected an object`,
  ],
  [
    "an edge's flag as text",
    changed((_, __, e) => (e['isFadeOut'] = 'yes')),
    `${EDGE}: isFadeOut is "yes"; expected true or false`,
  ],
  [
    "a reaction shape's type that ends connectors only",
    changed((_, __, e) => ((e['reactionShape'] as Json)['type'] = 'ARROW')),
    `${EDGE}: reactionShape.type is "ARROW"; expected one of BOX, CIRCLE, DOUBLE_CIRCLE`,
  ],
  [
    "a circle's radius missing",
    changed((_, __, e) => delete (e['reactionShape'] as Json)['r']),
    `${EDGE}: reactionShape.r is missing; expected a number`,
  ],
  [
    'a box without its corners',
    changed((_, __, e) => ((e['reactionShape'] as Json)['type'] = 'BOX')),
    `${EDGE}: reactionShape.a is missing; expected an object`,
  ],
  [
    "a shape's text a number",
    changed((_, __, e) => ((e['reactionShape'] as Json)['s'] = 0)),
    `${EDGE}: reactionShape.s is 0; expected text`,
  ],
  [
    "an edge's segments not a list",
    changed((_, __, e) => (e['segments'] = 'none')),
    `${EDGE}: segments is "none"; expected a list`,
  ],
  [
    "an edge's segment not an object",
    changed((_, __, e) => ((e['segments'] as unknown[])[0] = null)),
    `${EDGE}: segments[0] is null; expected an object`,
  ],
  [
    'a long value, shown cut short',
    changed((_, n) => (n['connectors'] = { segments: 'x'.repeat(100) })),
    `${NODE}: connectors is {"segments":"${'x'.repeat(66)}…; expected a list`,
  ],
  [
    'a value with no JSON',
    changed((_, n) => (n['displayName'] = () => 'CLSPN')),
    `${NODE}: displayName is a function; expected text`,
  ],
];

for (const [what, layout, message] of refusals) {
  test(`refused, naming the object and the field: ${what}`, () => {
    assert.throws(
      () => readLayout(layout),
      (error: unknown) => {
        assert.ok(error instanceof SbgnLayoutError, String(error));
        assert.equal(error.name, 'SbgnLayoutError');
        assert.equal(error.message, `Diagram layout, ${message}`);
        return true;
      }
    );
  });
}

test('a compartment may have no reactomeId; a node or an edge may not', () => {
  const without = (list: string): Json => {
    const layout = fixture('reaction');
    const first = (layout[list] as Json[])[0] as Json;
    delete first['reactomeId'];
    return layout;
  };
  const read = readLayout(without('compartments'));
  assert.equal(read.compartments[0]?.reactomeId, undefined);
  assert.ok(!Object.hasOwn(read.compartments[0] ?? {}, 'reactomeId'));
  assert.throws(() => readLayout(without('nodes')), SbgnLayoutError);
  assert.throws(() => readLayout(without('edges')), SbgnLayoutError);
});
