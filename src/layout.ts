/**
 * The diagram layout the conversion reads (spec 001, data-model.md): a pathway's diagram
 * file from the release, or a reaction's layout as the website's content service answers
 * it, parsed from JSON. Both are diagram-reader's model (1.2.5, the version
 * diagram-exporter 2.0.12 reads them with).
 *
 * Only the fields the conversion reads are typed; the others (links, shadows, notes,
 * colours, positions and the rest) are ignored, as Java's reader ignores what it does not
 * know. Each field's type is diagram-reader's (a Java `Long` is a whole number, a
 * `Double` any number), and a field is optional where real files leave it out or Java
 * tests it for null; a `null` is read as an absent field, as Java's reader makes both a
 * null. Anything else that does not fit is refused with an `SbgnLayoutError` naming the
 * object and the field.
 *
 * Reading builds new objects and lists: the layout it was given is never altered, and
 * what it returns holds nothing but the fields typed here.
 */

/** A layout the conversion cannot read or convert; its message names the object. */
export class SbgnLayoutError extends Error {
  override readonly name = 'SbgnLayoutError';
}

declare const layoutIdBrand: unique symbol;

/**
 * A diagram object's `id`: its number within this layout, which a connector's `edgeId`
 * names and Java writes into glyph and arc ids. Not a database identifier.
 */
export type LayoutId = number & { readonly [layoutIdBrand]: true };

declare const reactomeIdBrand: unique symbol;

/** A diagram object's `reactomeId`: the database identifier (dbId) of what it draws. */
export type ReactomeId = number & { readonly [reactomeIdBrand]: true };

/** A point, in the layout's own units (`Coordinate`; Java `Double`s). */
export interface Coordinate {
  readonly x: number;
  readonly y: number;
}

/** A box: its top left corner and size (`NodeProperties`; Java `Double`s). */
export interface NodeProperties {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A straight piece of a line. */
export interface Segment {
  readonly from: Coordinate;
  readonly to: Coordinate;
}

/** A reaction drawn as a box: a transition, or an omitted or uncertain one with `s`. */
export interface BoxShape {
  readonly type: 'BOX';
  readonly a: Coordinate;
  readonly b: Coordinate;
  /** The text in the box: `?` for an uncertain process, other text for an omitted one. */
  readonly s?: string;
}

/** A reaction drawn as a circle (an association) or a double circle (a dissociation). */
export interface CircleShape {
  readonly type: 'CIRCLE' | 'DOUBLE_CIRCLE';
  /** The centre. */
  readonly c: Coordinate;
  /** The radius (of the outer circle, for a double one). */
  readonly r: number;
  /** Text in the shape; no real file has any, but Java reads it from any shape. */
  readonly s?: string;
}

/**
 * The shape of a reaction's node. diagram-reader also knows `ARROW` and `STOP`, which
 * only end connectors: as a reaction's shape either is refused.
 */
export type ReactionShape = BoxShape | CircleShape;

/** What compartments, nodes and edges have in common. */
export interface DiagramObject {
  readonly id: LayoutId;
  readonly reactomeId: ReactomeId;
  readonly displayName: string;
}

export interface Compartment extends Omit<DiagramObject, 'reactomeId'> {
  /**
   * Absent for a compartment a reaction's layout draws around the reaction's own (its
   * parent in GO's tree, such as the nuclear envelope around the nucleoplasm), which has
   * no database object: Java writes `null` into its glyph's id.
   */
  readonly reactomeId?: ReactomeId;
  readonly prop: NodeProperties;
  /** Where its name is drawn. */
  readonly textPosition: Coordinate;
}

/** A modification drawn on a node's edge: a unit of information in SBGN. */
export interface NodeAttachment {
  readonly reactomeId: ReactomeId;
  /** Its text; Java writes `mt:prot` for one without. */
  readonly label?: string;
  /** Its box; only the corner `a` is read. */
  readonly shape: { readonly a: Coordinate };
}

export const CONNECTOR_TYPES = ['INPUT', 'OUTPUT', 'CATALYST', 'INHIBITOR', 'ACTIVATOR'] as const;

/** How a node takes part in a reaction (diagram-reader's `ConnectorType`). */
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

/** A participant's count, and the box it is drawn in when it is drawn (not for 1). */
export interface Stoichiometry {
  /** A Java `Integer`. */
  readonly value: number;
  readonly shape?: { readonly a: Coordinate; readonly b: Coordinate };
}

/** A node's line to a reaction. */
export interface Connector {
  /** The reaction's edge, by its `id` in this layout. */
  readonly edgeId: LayoutId;
  readonly type: ConnectorType;
  /** Its own line; without one, the arc takes the reaction's (data-model.md). */
  readonly segments?: readonly Segment[];
  readonly stoichiometry: Stoichiometry;
}

export interface Node extends DiagramObject {
  /** What is drawn: `Protein`, `Complex`, `Chemical`, `ProteinDrug` and so on. */
  readonly renderableClass: string;
  readonly prop: NodeProperties;
  /** Present, whatever its value, the node is not written (Java tests for null). */
  readonly isFadeOut?: boolean;
  /** Present, whatever its value, the node is not written (Java tests for null). */
  readonly isCrossed?: boolean;
  readonly nodeAttachments?: readonly NodeAttachment[];
  readonly connectors: readonly Connector[];
}

/** A reaction. */
export interface Edge extends DiagramObject {
  /** Present, whatever its value, the reaction is not written (Java tests for null). */
  readonly isFadeOut?: boolean;
  readonly reactionShape: ReactionShape;
  /** Its backbone: the line through its shape. */
  readonly segments?: readonly Segment[];
}

/** A pathway's diagram, or a reaction's layout. */
export interface DiagramLayout {
  /** The diagram's stable id, as the layout gives it; only named in messages. */
  readonly stableId: string;
  readonly compartments: readonly Compartment[];
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}

function isLayoutId(value: number): value is LayoutId {
  return Number.isSafeInteger(value);
}

function isReactomeId(value: number): value is ReactomeId {
  return Number.isSafeInteger(value);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return values.some((v) => v === value);
}

/** A Java `Long` that a double holds exactly. */
const WHOLE = 'a whole number within ±2^53';

const JAVA_INT_MIN = -(2 ** 31);
const JAVA_INT_MAX = 2 ** 31 - 1;

/**
 * One JSON object being read: `where` names the object for a message (`node 12
 * (reactomeId 69563, nodes[3])`), and `path` the field's place within it
 * (`connectors[0].stoichiometry`).
 */
class Fields {
  private readonly value: object;
  readonly where: string;
  readonly path: string;

  constructor(value: unknown, where: string, path: string) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw refusal(where, path, value, 'an object');
    }
    this.value = value;
    this.where = where;
    this.path = path;
  }

  /** The name of a field of this object, for a message. */
  private name(key: string): string {
    return this.path === '' ? key : `${this.path}.${key}`;
  }

  /** A field's value, or undefined for one absent or null. */
  private get(key: string): unknown {
    const value: unknown = Object.hasOwn(this.value, key)
      ? Reflect.get(this.value, key)
      : undefined;
    return value ?? undefined;
  }

  private required(key: string, expected: string): unknown {
    const value = this.get(key);
    if (value === undefined) throw refusal(this.where, this.name(key), value, expected);
    return value;
  }

  private refuse(key: string, expected: string): never {
    throw refusal(this.where, this.name(key), this.get(key), expected);
  }

  object(key: string): Fields {
    return new Fields(this.required(key, 'an object'), this.where, this.name(key));
  }

  optionalObject(key: string): Fields | undefined {
    return this.get(key) === undefined ? undefined : this.object(key);
  }

  /** A list, each item read by `read` with its own place in the message. */
  list<T>(key: string, read: (item: unknown, path: string, index: number) => T): readonly T[] {
    const value = this.required(key, 'a list');
    if (!Array.isArray(value)) return this.refuse(key, 'a list');
    const items: readonly unknown[] = value;
    return items.map((item, i) => read(item, `${this.name(key)}[${String(i)}]`, i));
  }

  optionalList<T>(
    key: string,
    read: (item: unknown, path: string, index: number) => T
  ): readonly T[] | undefined {
    return this.get(key) === undefined ? undefined : this.list(key, read);
  }

  string(key: string): string {
    const value = this.required(key, 'text');
    return typeof value === 'string' ? value : this.refuse(key, 'text');
  }

  optionalString(key: string): string | undefined {
    return this.get(key) === undefined ? undefined : this.string(key);
  }

  /** A Java `Double`: any finite number. */
  number(key: string): number {
    const value = this.required(key, 'a number');
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : this.refuse(key, 'a number');
  }

  /** A Java `Integer`. */
  integer(key: string): number {
    const expected = 'a whole number that fits a Java int';
    const value = this.required(key, expected);
    return typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= JAVA_INT_MIN &&
      value <= JAVA_INT_MAX
      ? value
      : this.refuse(key, expected);
  }

  optionalBoolean(key: string): boolean | undefined {
    const value = this.get(key);
    if (value === undefined || typeof value === 'boolean') return value;
    return this.refuse(key, 'true or false');
  }

  layoutId(key: string): LayoutId {
    const value = this.required(key, WHOLE);
    return typeof value === 'number' && isLayoutId(value) ? value : this.refuse(key, WHOLE);
  }

  reactomeId(key: string): ReactomeId {
    const value = this.required(key, WHOLE);
    return typeof value === 'number' && isReactomeId(value) ? value : this.refuse(key, WHOLE);
  }

  optionalReactomeId(key: string): ReactomeId | undefined {
    return this.get(key) === undefined ? undefined : this.reactomeId(key);
  }

  oneOf<T extends string>(key: string, values: readonly T[]): T {
    const expected = `one of ${values.join(', ')}`;
    const value = this.required(key, expected);
    return isOneOf(values, value) ? value : this.refuse(key, expected);
  }
}

/** The longest a value is shown in a message. */
const SHOWN = 80;

/** A value as a message shows it: its JSON, cut short. */
function show(value: unknown): string {
  if (value === undefined) return 'missing';
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    json = undefined;
  }
  if (json === undefined) return `a ${typeof value}`;
  return json.length > SHOWN ? `${json.slice(0, SHOWN - 1)}…` : json;
}

function refusal(where: string, field: string, value: unknown, expected: string): SbgnLayoutError {
  const shown = show(value);
  const what = field === '' ? where : `${where}: ${field}`;
  return new SbgnLayoutError(`Diagram layout, ${what} is ${shown}; expected ${expected}`);
}

function coordinate(fields: Fields): Coordinate {
  return { x: fields.number('x'), y: fields.number('y') };
}

function nodeProperties(fields: Fields): NodeProperties {
  return {
    x: fields.number('x'),
    y: fields.number('y'),
    width: fields.number('width'),
    height: fields.number('height'),
  };
}

function segments(fields: Fields, key: string): readonly Segment[] | undefined {
  return fields.optionalList(key, (item, path): Segment => {
    const segment = new Fields(item, fields.where, path);
    return { from: coordinate(segment.object('from')), to: coordinate(segment.object('to')) };
  });
}

/**
 * Starts reading a diagram object: its own ids first, so that every later refusal names
 * it by them (`node 12 (reactomeId 69563, nodes[3])`), and its index in its list.
 */
function diagramObject(
  item: unknown,
  kind: string,
  path: string
): { fields: Fields; object: DiagramObject } {
  const id = new Fields(item, 'the diagram', path).layoutId('id');
  const named = new Fields(item, `${kind} ${String(id)} (${path})`, '');
  const reactomeId = named.reactomeId('reactomeId');
  const fields = new Fields(
    item,
    `${kind} ${String(id)} (reactomeId ${String(reactomeId)}, ${path})`,
    ''
  );
  return { fields, object: { id, reactomeId, displayName: fields.string('displayName') } };
}

function compartment(item: unknown, path: string): Compartment {
  const id = new Fields(item, 'the diagram', path).layoutId('id');
  const named = new Fields(item, `compartment ${String(id)} (${path})`, '');
  const reactomeId = named.optionalReactomeId('reactomeId');
  const fields =
    reactomeId === undefined
      ? named
      : new Fields(
          item,
          `compartment ${String(id)} (reactomeId ${String(reactomeId)}, ${path})`,
          ''
        );
  return {
    id,
    ...(reactomeId === undefined ? {} : { reactomeId }),
    displayName: fields.string('displayName'),
    prop: nodeProperties(fields.object('prop')),
    textPosition: coordinate(fields.object('textPosition')),
  };
}

function nodeAttachment(node: Fields, item: unknown, path: string): NodeAttachment {
  const fields = new Fields(item, node.where, path);
  const reactomeId = fields.reactomeId('reactomeId');
  const label = fields.optionalString('label');
  const shape = { a: coordinate(fields.object('shape').object('a')) };
  return label === undefined ? { reactomeId, shape } : { reactomeId, label, shape };
}

function stoichiometry(fields: Fields): Stoichiometry {
  const value = fields.integer('value');
  const box = fields.optionalObject('shape');
  if (box === undefined) return { value };
  return { value, shape: { a: coordinate(box.object('a')), b: coordinate(box.object('b')) } };
}

function connector(node: Fields, item: unknown, path: string): Connector {
  const fields = new Fields(item, node.where, path);
  const edgeId = fields.layoutId('edgeId');
  const type = fields.oneOf('type', CONNECTOR_TYPES);
  const own = segments(fields, 'segments');
  const count = stoichiometry(fields.object('stoichiometry'));
  return own === undefined
    ? { edgeId, type, stoichiometry: count }
    : { edgeId, type, segments: own, stoichiometry: count };
}

function node(item: unknown, path: string): Node {
  const { fields, object } = diagramObject(item, 'node', path);
  const renderableClass = fields.string('renderableClass');
  const prop = nodeProperties(fields.object('prop'));
  const isFadeOut = fields.optionalBoolean('isFadeOut');
  const isCrossed = fields.optionalBoolean('isCrossed');
  const nodeAttachments = fields.optionalList('nodeAttachments', (a, p) =>
    nodeAttachment(fields, a, p)
  );
  const connectors = fields.list('connectors', (c, p) => connector(fields, c, p));
  return {
    ...object,
    renderableClass,
    prop,
    ...(isFadeOut === undefined ? {} : { isFadeOut }),
    ...(isCrossed === undefined ? {} : { isCrossed }),
    ...(nodeAttachments === undefined ? {} : { nodeAttachments }),
    connectors,
  };
}

const SHAPE_TYPES = ['BOX', 'CIRCLE', 'DOUBLE_CIRCLE'] as const;

function reactionShape(fields: Fields): ReactionShape {
  const type = fields.oneOf('type', SHAPE_TYPES);
  const s = fields.optionalString('s');
  const text = s === undefined ? {} : { s };
  if (type === 'BOX') {
    return { type, a: coordinate(fields.object('a')), b: coordinate(fields.object('b')), ...text };
  }
  return { type, c: coordinate(fields.object('c')), r: fields.number('r'), ...text };
}

function edge(item: unknown, path: string): Edge {
  const { fields, object } = diagramObject(item, 'edge', path);
  const isFadeOut = fields.optionalBoolean('isFadeOut');
  const shape = reactionShape(fields.object('reactionShape'));
  const backbone = segments(fields, 'segments');
  return {
    ...object,
    ...(isFadeOut === undefined ? {} : { isFadeOut }),
    reactionShape: shape,
    ...(backbone === undefined ? {} : { segments: backbone }),
  };
}

/**
 * Reads a parsed diagram layout into its type, refusing a field of the wrong type with
 * an `SbgnLayoutError` that names the object (its kind, `id`, `reactomeId` and place in
 * its list) and the field.
 */
export function readLayout(value: unknown): DiagramLayout {
  const fields = new Fields(value, 'the diagram', '');
  return {
    stableId: fields.string('stableId'),
    compartments: fields.list('compartments', compartment),
    nodes: fields.list('nodes', node),
    edges: fields.list('edges', edge),
  };
}
