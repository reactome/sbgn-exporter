// Process boxes, ports and arc points (spec 001 T008, data-model.md, research R3.2 and
// R3.5 to R3.7), on the small hand-made layouts in fixtures/geometry/:
// - ports.json: one reaction for each of the roundings and tests getEdgeGlyph makes,
//   and one with negative coordinates, with an INPUT arc;
// - arcs.json: one arc of each kind (INPUT, OUTPUT, regulators; with and without
//   segments of their own; OUTPUTs on backbones of one to four segments) and the ones
//   Java throws on;
// - order.json: one reaction's arcs, OUTPUTs among them, read one after another; and a
//   reaction none of whose segments touches its shape.
//
// Every "Java" value below is diagram-exporter 2.0.12's own answer for these files
// (7 Nov 2026, OpenJDK 11.0.32, headless, offline): a scratch program in Java's package
// read each file with diagram-reader 1.2.5's DiagramFactory, called SbgnConverter's
// getNodeGlyph and getEdgeGlyph, then getArc for each connector, and printed each float
// widened to a double (Double.toString, which reads back exactly; two that lint takes
// for a loss of precision are written as their exact decimals). "Java, fresh" reads the
// file anew for each arc, so the backbone is as given when the arc starts (D2's reading);
// "Java, in order" writes one reaction's arcs one after another from one reading, as
// getSbgn does.
// Where D5 or D6 applies, the expected value is derived from Java's in the test, by the
// rule research R3.7 states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLayout, SbgnLayoutError, type DiagramLayout } from '../src/layout.ts';
import {
  arcPoints,
  processGeometry,
  ShapeBounds,
  type ArcPoints,
  type ProcessGeometry,
} from '../src/geometry.ts';

function fixture(name: string): DiagramLayout {
  const url = new URL(`../fixtures/geometry/${name}.json`, import.meta.url);
  return readLayout(JSON.parse(readFileSync(url, 'utf8')));
}

function edgeOf(layout: DiagramLayout, id: number): DiagramLayout['edges'][number] {
  const edge = layout.edges.find((e) => e.id === id);
  assert.ok(edge, `edge ${String(id)}`);
  return edge;
}

function process(layout: DiagramLayout, id: number): ProcessGeometry {
  return processGeometry(edgeOf(layout, id));
}

/** The points of a node's only connector. */
function arc(layout: DiagramLayout, nodeId: number): ArcPoints | undefined {
  const node = layout.nodes.find((n) => n.id === nodeId);
  assert.ok(node, `node ${String(nodeId)}`);
  const connector = node.connectors[0];
  assert.ok(connector);
  return arcPoints(node, connector, edgeOf(layout, connector.edgeId));
}

type Pair = [number, number];
const pt = ([x, y]: Pair): { x: number; y: number } => ({ x, y });

function geometry(box: [number, number, number, number], ports: [Pair, Pair]): unknown {
  const [x, y, w, h] = box;
  return { box: { x, y, w, h }, ports: ports.map(pt) };
}

function points(start: Pair, next: Pair[], end: Pair): unknown {
  return { start: pt(start), next: next.map(pt), end: pt(end) };
}

const ports = fixture('ports');

test("a process glyph's box and ports are Java's, in float step by step", () => {
  // Java: [x, y, w, h] and the ports .1 and .2, as getEdgeGlyph sets them
  const java: [number, ReturnType<typeof geometry>][] = [
    [
      1,
      geometry(
        [2903.010009765625, 100, 12.530029296875, 12],
        [
          [2898.833251953125, 106],
          [2919.716796875, 106],
        ]
      ),
    ],
    [
      2,
      geometry(
        [500, 3129.050048828125, 12, 23.239990234375],
        [
          [506, 3160.03662109375],
          [506, 3121.303466796875],
        ]
      ),
    ],
    [
      3,
      geometry(
        [336.0299987792969, 50, 5.95001220703125, 10],
        [
          [339.0050048828125, 55],
          [339.0050048828125, 55],
        ]
      ),
    ],
    [
      4,
      geometry(
        [652.6199951171875, 10, 19.58001708984375, 10],
        [
          [662.40997314453125, 15],
          [662.40997314453125, 15],
        ]
      ),
    ],
    [
      5,
      geometry(
        [1423.820068359375, 294.1499938964844, 11.699999809265137, 11.699999809265137],
        [
          [1429.6700439453125, 300],
          [1429.6700439453125, 300],
        ]
      ),
    ],
  ];
  for (const [id, expected] of java)
    assert.deepEqual(process(ports, id), expected, `edge ${String(id)}`);
});

test('a single rounding at the end would give other floats than Java', () => {
  const f = Math.fround;
  // edge 1: port .2's x is x + (4 * w) / 3, each step a float
  assert.notEqual(f(2903.01 + (4 * (2915.54 - 2903.01)) / 3), 2919.716796875);
  // edge 2: port .2's y is y - h / 3
  assert.notEqual(f(3129.05 - (3152.29 - 3129.05) / 3), 3121.303466796875);
  // edge 3: the box's width is b.x - a.x, in floats
  assert.notEqual(f(341.98 - 336.03), 5.95001220703125);
  // edge 5: a circle's box's x is c.x - r, in floats
  assert.notEqual(f(1429.67 - 5.85), 1423.820068359375);
  // edge 4, the other way: a box's centre is Coordinate's arithmetic, in doubles, then
  // one rounding; float steps would give another float
  assert.notEqual(f(f(652.62) + f(f(f(672.2) - f(652.62)) / 2)), 662.40997314453125);
});

test("the ports' direction is tested in doubles, as Java compares them", () => {
  // The backbone runs 20.3 across; the float width is 20.299999237060547, less, so the
  // ports go beside the box. Compared as floats, 20.3 would not be more, and they would
  // go above and below it.
  assert.deepEqual(
    process(ports, 6),
    geometry(
      [0, 0, 20.299999237060547, 10],
      [
        [-6.766666412353516, 5],
        [27.0666656494140625, 5],
      ]
    )
  );
});

test("the shape's bounds are truncated toward zero, as intValue() does", () => {
  const edge = edgeOf(ports, 7);
  const bounds = new ShapeBounds(edge.reactionShape);
  // a: (-10.5, -4.5), b: (9.5, 5.5)
  assert.deepEqual(
    { minX: bounds.minX, maxX: bounds.maxX, minY: bounds.minY, maxY: bounds.maxY },
    { minX: -10, maxX: 9, minY: -4, maxY: 5 }
  );
  // So the first segment, ending at x -10.7, does not touch the shape (floored, -11, it
  // would): the ports follow the second and third segments, and the INPUT passes through
  // the first's end.
  assert.deepEqual(
    process(ports, 7),
    geometry(
      [-10.5, -4.5, 20, 10],
      [
        [-17.16666603088379, 2],
        [16.16666603088379, 4],
      ]
    )
  );
  assert.deepEqual(
    arc(ports, 101),
    points([-30, 1], [[-10.699999809265137, 2]], [-10.699999809265137, 2])
  );
});

test('a backbone none of whose segments touches the shape is refused, where Java throws', () => {
  // Java: getEdgeGlyph throws IndexOutOfBoundsException (portCandidates.get(0))
  const order = fixture('order');
  assert.throws(
    () => process(order, 22),
    (error: unknown) =>
      error instanceof SbgnLayoutError &&
      error.message ===
        'Diagram layout, edge 22 (reactomeId 9031): no segment of its backbone touches its shape'
  );
});

const arcs = fixture('arcs');

test("an INPUT or a regulator is Java's, from the backbone as given (D2)", () => {
  // Java, fresh. 116: INPUT without segments of its own; 117: with them, then the walk
  // over the backbone; 118: CATALYST along the whole backbone; 119: INHIBITOR with its own.
  assert.deepEqual(arc(arcs, 116), points([150, 140], [[200, 162.5]], [200, 162.5]));
  assert.deepEqual(
    arc(arcs, 117),
    points(
      [100, 120],
      [
        [140, 130],
        [150, 140],
        [200, 162.5],
      ],
      [150, 140]
    )
  );
  assert.deepEqual(arc(arcs, 118), points([150, 140], [], [360, 150]));
  assert.deepEqual(arc(arcs, 119), points([250, 100], [[280, 120]], [299, 156.5]));
  // 121: an ACTIVATOR on a reaction without a backbone; Java writes the arc without points
  assert.equal(arc(arcs, 121), undefined);
});

test('an OUTPUT without segments of its own runs along the segment Java picks (D6)', () => {
  // Java, fresh: [start, next, end]. D6: start and end are the picked segment's from and
  // to (its second segment; its only one on a one-segment backbone), next are Java's.
  const cases: [number, string, Pair[], Pair, Pair[], Pair, Pair, Pair][] = [
    // node, backbone, Java's start, next, end, and the picked segment's from and to
    [111, 'one segment', [], [100, 106], [], [150, 106], [100, 106], [150, 106]],
    [112, 'two segments', [], [106, 106], [], [106, 106], [106, 106], [150, 106]],
    [113, 'three segments', [], [112, 106], [[150, 106]], [150, 106], [112, 106], [150, 106]],
    [
      114,
      'four segments',
      [],
      [200, 162.5],
      [[340, 162.5]],
      [340, 162.5],
      [200, 162.5],
      [293, 162.5],
    ],
    // its own segments an empty list: as none
    [
      120,
      'four segments, own []',
      [],
      [200, 162.5],
      [[340, 162.5]],
      [340, 162.5],
      [200, 162.5],
      [293, 162.5],
    ],
  ];
  for (const [node, what, , javaStart, javaNext, javaEnd, from, to] of cases) {
    // Java's own start is always the picked segment's from
    assert.deepEqual(javaStart, from, what);
    const expected = points(from, javaNext, to);
    assert.deepEqual(arc(arcs, node), expected, what);
    // Java's end differs on two and four segments (s0.to, s2.to), not on one or three
    const same = what.startsWith('one') || what.startsWith('three');
    assert.equal(JSON.stringify(javaEnd) === JSON.stringify(to), same, what);
  }
});

test('an OUTPUT with segments of its own runs from the reaction: start and end swapped (D5)', () => {
  // Java, fresh. 115: start (455, 185) at the product, end (299, 162.5) at the reaction.
  const java115 = points(
    [455, 185],
    [
      [340, 162.5],
      [374, 185],
    ],
    [299, 162.5]
  );
  assert.deepEqual(
    arc(arcs, 115),
    points(
      [299, 162.5],
      [
        [340, 162.5],
        [374, 185],
      ],
      [455, 185]
    )
  );
  assert.notDeepEqual(arc(arcs, 115), java115);
  // 122, on a reaction without a backbone: Java start (400, 100), end (299, 156.5)
  assert.deepEqual(arc(arcs, 122), points([299, 156.5], [], [400, 100]));
});

test('an INPUT or OUTPUT without its own segments and without a backbone is refused, where Java throws', () => {
  const refused: [number, string][] = [
    // Java: NullPointerException (no backbone)
    [
      123,
      "its INPUT to edge 15 (reactomeId 9013) has no segments of its own, and the reaction's backbone, which it would take, has no backbone",
    ],
    // Java: IndexOutOfBoundsException (subList of an empty backbone)
    [
      124,
      "its INPUT to edge 16 (reactomeId 9014) has no segments of its own, and the reaction's backbone, which it would take, has 0 segments",
    ],
    [
      125,
      "its OUTPUT to edge 16 (reactomeId 9014) has no segments of its own, and the reaction's backbone, which it would take, has 0 segments",
    ],
  ];
  for (const [node, message] of refused) {
    assert.throws(
      () => arc(arcs, node),
      (error: unknown) => error instanceof SbgnLayoutError && error.message.endsWith(message),
      `node ${String(node)}`
    );
  }
});

test("a reaction's arcs read its backbone as given, whatever was written before (D2)", () => {
  const order = fixture('order');
  const before = structuredClone(order);
  // Java, fresh: each arc from the backbone as given; D6 for 131, D5 for 134
  const fresh = new Map<number, unknown>([
    [131, points([200, 162.5], [[340, 162.5]], [293, 162.5])],
    [
      136,
      points(
        [100, 120],
        [
          [140, 130],
          [150, 140],
          [200, 162.5],
        ],
        [150, 140]
      ),
    ],
    [132, points([150, 140], [[200, 162.5]], [200, 162.5])],
    [133, points([150, 140], [], [360, 150])],
    [
      134,
      points(
        [299, 162.5],
        [
          [340, 162.5],
          [374, 185],
        ],
        [455, 185]
      ),
    ],
    [135, points([150, 140], [[200, 162.5]], [200, 162.5])],
  ]);
  // Java, in order (D5 applied to 134): after 131 (an OUTPUT) reversed the backbone in
  // place, 136 (an INPUT with segments of its own, which still walks the backbone), 132
  // and 133 read it reversed, and 134 walks it reversed back; 135 reads it as given
  const inOrder = new Map<number, unknown>([
    [
      136,
      points(
        [100, 120],
        [
          [140, 130],
          [150, 140],
          [360, 150],
        ],
        [150, 140]
      ),
    ],
    [132, points([340, 162.5], [[360, 150]], [360, 150])],
    [133, points([340, 162.5], [], [200, 162.5])],
    [
      134,
      points(
        [299, 162.5],
        [
          [150, 140],
          [374, 185],
        ],
        [455, 185]
      ),
    ],
  ]);
  for (const node of [131, 136, 132, 133, 134, 135]) {
    const got = arc(order, node);
    assert.deepEqual(got, fresh.get(node), `node ${String(node)}`);
    if (inOrder.has(node)) assert.notDeepEqual(got, inOrder.get(node), `node ${String(node)}`);
  }
  // and the layout is as it was read
  assert.deepEqual(order, before);
});
