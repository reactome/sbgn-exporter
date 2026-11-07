/**
 * A diagram layout to an SBGN-ML document model (spec 001 T009, research R2): diagram-exporter
 * 2.0.12's `SbgnConverter` (`getSbgn`, `getNodeGlyph`, `getNodeAttachmentGlyph`,
 * `getNodeCompartmentGlyph`, `getEdgeGlyph`, `getArc`) and `Participant.getStoichiometry`,
 * with the declared differences D1 (a fixed order) and D3 (`cardinality`); the points and
 * ports, with D2, D5 and D6, are `geometry.ts`'s.
 *
 * **Order (D1).** Java's glyphs after the compartments come from a `HashMap` and its arcs
 * from a `HashSet`, in an order that changes from run to run. Here: compartments in layout
 * order, then entities in node order, then reactions in edge order; arcs by node and,
 * within a node, by connector.
 *
 * **Left out,** as Java leaves them out: a node with `isFadeOut` or `isCrossed` present
 * (whatever its value, as Java tests for null), with its units of information and its
 * arcs; a reaction with `isFadeOut` present, with its arcs. A left-out node's connectors
 * are not read, so one naming a missing edge is no error, as in Java.
 *
 * **Refused** with an `SbgnLayoutError` naming the object: a written node's connector
 * naming no edge (Java's `NullPointerException`); what `geometry.ts` refuses; an arc
 * without points (Java writes it with none, which the schema refuses); a repeated id (Java
 * writes it); a label the width table cannot measure as Java does.
 */
import { float32, type Float32 } from './java-float.ts';
import {
  SbgnLayoutError,
  type Compartment,
  type Connector,
  type ConnectorType,
  type Coordinate,
  type DiagramLayout,
  type Edge,
  type Node,
  type NodeAttachment,
  type ReactionShape,
} from './layout.ts';
import { arcPoints, processGeometry, type Box } from './geometry.ts';
import { textWidth } from './text-width.ts';
import { SBGN_LANGUAGE } from './sbgn.ts';
import type {
  Arc,
  ArcClass,
  EntityClass,
  Glyph,
  Label,
  ProcessClass,
  SbgnDocument,
  SbgnId,
} from './model.ts';

/** An XML name without a colon, as libSBGN's ids are (`xs:ID`), in ASCII. */
const NC_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function isSbgnId(value: string): value is SbgnId {
  return NC_NAME.test(value);
}

/** An id built from the layout's numbers and Java's prefixes. */
function sbgnId(value: string): SbgnId {
  if (!isSbgnId(value)) throw new SbgnLayoutError(`Not an SBGN-ML id: ${JSON.stringify(value)}`);
  return value;
}

function nodeName(node: Node): string {
  return `node ${String(node.id)} (reactomeId ${String(node.reactomeId)})`;
}

/** A label's width, as Java's font metrics measure it, or a refusal naming the object. */
function width(text: string, where: string): Float32 {
  try {
    return float32(textWidth(text));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new SbgnLayoutError(`Diagram layout, ${where}: ${error.message}`);
  }
}

/** A box of a corner and size, each double's `floatValue()`. */
function propBox(prop: { x: number; y: number; width: number; height: number }): Box {
  return {
    x: float32(prop.x),
    y: float32(prop.y),
    w: float32(prop.width),
    h: float32(prop.height),
  };
}

/** A box between two corners: `b - a` in floats, as Java computes it. */
function cornersBox(a: Coordinate, b: Coordinate): Box {
  const x = float32(a.x);
  const y = float32(a.y);
  return { x, y, w: float32(float32(b.x) - x), h: float32(float32(b.y) - y) };
}

const COMPARTMENT_ORDER = float32(10);
const COMPARTMENT_LABEL_HEIGHT = float32(24);
const UNIT_HEIGHT = float32(16);

function compartmentGlyph(compartment: Compartment): Glyph {
  const where = `compartment ${String(compartment.id)} (reactomeId ${String(compartment.reactomeId)})`;
  const label: Label = {
    text: compartment.displayName,
    bbox: {
      x: float32(compartment.textPosition.x),
      y: float32(compartment.textPosition.y),
      w: width(compartment.displayName, where),
      h: COMPARTMENT_LABEL_HEIGHT,
    },
  };
  return {
    class: 'compartment',
    id: sbgnId(`compartmentVertex_${String(compartment.reactomeId)}_${String(compartment.id)}`),
    compartmentOrder: COMPARTMENT_ORDER,
    label,
    bbox: propBox(compartment.prop),
    glyphs: [],
    ports: [],
  };
}

/** Java's classes by the start of `renderableClass`, so that drugs follow their kind. */
const ENTITY_CLASSES: readonly (readonly [string, EntityClass])[] = [
  ['Complex', 'complex'],
  ['Protein', 'macromolecule'],
  ['Chemical', 'simple chemical'],
  ['Process', 'submap'],
  ['EncapsulatedNode', 'submap'],
];

function entityClass(renderableClass: string): EntityClass {
  const found = ENTITY_CLASSES.find(([prefix]) => renderableClass.startsWith(prefix));
  return found === undefined ? 'unspecified entity' : found[1];
}

/** Numbers the units of information across the document, as Java's field does. */
class UnitCounter {
  private next = 1;

  take(): number {
    return this.next++;
  }
}

function unitGlyph(node: Node, attachment: NodeAttachment, counter: UnitCounter): Glyph {
  const text = attachment.label ?? 'mt:prot';
  const where = `${nodeName(node)}, its attachment (reactomeId ${String(attachment.reactomeId)})`;
  return {
    class: 'unit of information',
    id: sbgnId(`entityVertex_${String(attachment.reactomeId)}_${String(counter.take())}_mt`),
    label: { text },
    bbox: {
      x: float32(attachment.shape.a.x),
      y: float32(attachment.shape.a.y),
      w: width(text, where),
      h: UNIT_HEIGHT,
    },
    glyphs: [],
    ports: [],
  };
}

function entityGlyph(node: Node, counter: UnitCounter): Glyph {
  return {
    class: entityClass(node.renderableClass),
    id: sbgnId(`entityVertex_${String(node.reactomeId)}_${String(node.id)}`),
    label: { text: node.displayName },
    bbox: propBox(node.prop),
    glyphs: (node.nodeAttachments ?? []).map((attachment) => unitGlyph(node, attachment, counter)),
    ports: [],
  };
}

function processClass(shape: ReactionShape): ProcessClass {
  if (shape.s !== undefined && shape.s !== '') {
    return shape.s === '?' ? 'uncertain process' : 'omitted process';
  }
  if (shape.type === 'CIRCLE') return 'association';
  if (shape.type === 'DOUBLE_CIRCLE') return 'dissociation';
  return 'process';
}

/** A reaction's glyph and its ports' ids: `.1` the inputs', `.2` the outputs'. */
interface ProcessGlyph {
  readonly glyph: Glyph;
  readonly input: SbgnId;
  readonly output: SbgnId;
}

function processGlyph(edge: Edge): ProcessGlyph {
  const { box, ports } = processGeometry(edge);
  const input = sbgnId(`reactionVertex_${String(edge.reactomeId)}.1`);
  const output = sbgnId(`reactionVertex_${String(edge.reactomeId)}.2`);
  const glyph: Glyph = {
    class: processClass(edge.reactionShape),
    id: sbgnId(`reactionVertex_${String(edge.reactomeId)}_${String(edge.id)}`),
    label: { text: edge.displayName },
    bbox: box,
    glyphs: [],
    ports: [
      { id: input, ...ports[0] },
      { id: output, ...ports[1] },
    ],
  };
  return { glyph, input, output };
}

const ARC_CLASSES: Readonly<Record<ConnectorType, ArcClass>> = {
  INPUT: 'consumption',
  OUTPUT: 'production',
  CATALYST: 'catalysis',
  INHIBITOR: 'inhibition',
  ACTIVATOR: 'stimulation',
};

/** A participant's count drawn on its arc (D3: `cardinality`), if the layout draws one. */
function cardinality(node: Node, connector: Connector, edge: Edge): Glyph[] {
  const shape = connector.stoichiometry.shape;
  if (shape === undefined) return [];
  return [
    {
      class: 'cardinality',
      id: sbgnId(
        `Stoichiometry_${String(node.reactomeId)}_${connector.type}_${String(edge.reactomeId)}`
      ),
      label: { text: String(connector.stoichiometry.value) },
      bbox: cornersBox(shape.a, shape.b),
      glyphs: [],
      ports: [],
    },
  ];
}

function arc(
  node: Node,
  entity: SbgnId,
  connector: Connector,
  edge: Edge,
  reaction: ProcessGlyph
): Arc {
  const id = sbgnId(`arc_${String(node.id)}_${connector.type.toLowerCase()}_${String(edge.id)}`);
  const points = arcPoints(node, connector, edge);
  if (points === undefined) {
    throw new SbgnLayoutError(
      `Diagram layout, ${nodeName(node)}: its ${connector.type} to edge ${String(edge.id)} ` +
        `(reactomeId ${String(edge.reactomeId)}) has no points: no segments of its own, and ` +
        `the reaction's backbone is missing or empty`
    );
  }
  const ends: { source: SbgnId; target: SbgnId } =
    connector.type === 'INPUT'
      ? { source: entity, target: reaction.input }
      : connector.type === 'OUTPUT'
        ? { source: reaction.output, target: entity }
        : { source: entity, target: reaction.glyph.id };
  return {
    class: ARC_CLASSES[connector.type],
    id,
    ...ends,
    glyphs: cardinality(node, connector, edge),
    ...points,
  };
}

/** Every id in the document, its units of information and cardinalities too, once. */
function refuseRepeats(
  layout: DiagramLayout,
  glyphs: readonly Glyph[],
  arcs: readonly Arc[]
): void {
  const seen = new Set<string>();
  const add = (id: SbgnId): void => {
    if (seen.has(id)) {
      throw new SbgnLayoutError(
        `Diagram layout ${layout.stableId}: the id ${id} would be written twice`
      );
    }
    seen.add(id);
  };
  const glyph = (g: Glyph): void => {
    add(g.id);
    g.glyphs.forEach(glyph);
    g.ports.forEach((port) => {
      add(port.id);
    });
  };
  glyphs.forEach(glyph);
  for (const a of arcs) {
    add(a.id);
    a.glyphs.forEach(glyph);
  }
}

/**
 * The SBGN-ML document of a diagram layout, as Java's converter makes it but for the
 * declared differences (spec FR-003).
 *
 * @throws SbgnLayoutError for a layout Java cannot convert or would write invalid, naming
 *   the object.
 */
export function convert(layout: DiagramLayout): SbgnDocument {
  // Java's map of edges by id: the last of a repeated id is the one found.
  const edges = new Map<number, Edge>(layout.edges.map((edge) => [edge.id, edge]));
  const counter = new UnitCounter();

  const compartments = layout.compartments.map(compartmentGlyph);
  const written = layout.nodes.filter(
    (node) => node.isFadeOut === undefined && node.isCrossed === undefined
  );
  const entities = written.map((node) => ({ node, glyph: entityGlyph(node, counter) }));
  const reactions = new Map<Edge, ProcessGlyph>();
  for (const edge of layout.edges) {
    if (edge.isFadeOut === undefined) reactions.set(edge, processGlyph(edge));
  }

  const arcs: Arc[] = [];
  for (const { node, glyph } of entities) {
    for (const connector of node.connectors) {
      const edge = edges.get(connector.edgeId);
      if (edge === undefined) {
        throw new SbgnLayoutError(
          `Diagram layout, ${nodeName(node)}: its ${connector.type} names edge ` +
            `${String(connector.edgeId)}, which the diagram does not have`
        );
      }
      const reaction = reactions.get(edge);
      if (reaction !== undefined) arcs.push(arc(node, glyph.id, connector, edge, reaction));
    }
  }

  const glyphs = [
    ...compartments,
    ...entities.map(({ glyph }) => glyph),
    ...[...reactions.values()].map(({ glyph }) => glyph),
  ];
  refuseRepeats(layout, glyphs, arcs);
  return { language: SBGN_LANGUAGE, glyphs, arcs };
}
