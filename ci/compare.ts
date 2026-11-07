/**
 * The comparison of this exporter's SBGN-ML with Java's (spec 001 T014,
 * contracts/comparison.md, research R12):
 *
 *     node ci/compare.ts <ours> <java> [--layout <layout>] [--bulk] [--json]
 *
 * <ours> and <java> are two files, or two folders whose `.sbgn` files are compared by
 * name (with --layout, then, a folder holding `{name}.json` for each). Glyphs (with their
 * child glyphs and ports) and arcs are matched by id, and every attribute value is
 * compared as the string written, never as a number (FR-005: `48` is not `48.0`). Each
 * difference is given a kind, D1 to D6 (data-model.md) when a declared difference
 * explains it, `undeclared` otherwise:
 *
 * - D1: the order of the glyphs or of the arcs.
 * - D2, D5, D6: an arc's points, only with --layout, and only if Java's are exactly one
 *   of Java's possible readings recomputed from the layout (the backbone as given, or
 *   reversed, when the arc starts; an OUTPUT reverses it once more on the way, research
 *   R3.7) and ours exactly Java's reading with the backbone as given, with D6 then D5
 *   applied (R3.6, R3.5). D2 when Java's is the reversed reading, else D6 or D5.
 * - D3: `cardinality` for Java's `stoichiometry`, on an arc's child glyph.
 * - D4: a measured width (a compartment's label box, a unit of information's box), only
 *   with --bulk, which is for the published bulk file.
 *
 * Anything else, a missing or extra id or file included, is undeclared. Exit status: 0 if
 * nothing is undeclared, 1 otherwise, 2 for input that cannot be read.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SaxesParser } from 'saxes';
import { ShapeBounds } from '../src/geometry.ts';
import { float32, javaFloat } from '../src/java-float.ts';
import {
  readLayout,
  type Connector,
  type Coordinate,
  type DiagramLayout,
  type Edge,
  type Segment,
} from '../src/layout.ts';

export type Kind = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'undeclared';

export const KINDS: readonly Kind[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'undeclared'];

export interface Difference {
  readonly kind: Kind;
  /** The file, when folders are compared. */
  readonly file?: string;
  /** The glyph's, port's or arc's id, or what is compared (`glyph order`, a file name). */
  readonly id: string;
  readonly field: string;
  readonly ours?: string;
  readonly java?: string;
}

export interface Options {
  readonly layout?: DiagramLayout;
  readonly bulk?: boolean;
}

/** Input the comparison cannot read: exit status 2. */
export class UnreadableError extends Error {
  override readonly name = 'UnreadableError';
}

// -- The documents --------------------------------------------------------------------

interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlElement[];
}

function parseXml(text: string, what: string): XmlElement {
  const parser = new SaxesParser({ xmlns: false });
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  parser.on('opentag', (tag) => {
    // Without namespaces, saxes gives each attribute as its decoded string.
    const attributes: Record<string, string> = { ...tag.attributes };
    const element: XmlElement = { name: tag.name, attributes, children: [] };
    const parent = stack.at(-1);
    if (parent === undefined) root = element;
    else parent.children.push(element);
    stack.push(element);
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  try {
    parser.write(text).close();
  } catch (error) {
    throw new UnreadableError(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (root === undefined) throw new UnreadableError(`${what}: no document`);
  return root;
}

interface Box {
  readonly [field: string]: string | undefined;
}

interface SbgnGlyph {
  readonly id: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly label?: { readonly text?: string; readonly bbox?: Box };
  readonly bbox?: Box;
  readonly glyphs: readonly SbgnGlyph[];
  readonly ports: readonly { readonly id: string; readonly attributes: Box }[];
}

interface SbgnArc {
  readonly id: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly glyphs: readonly SbgnGlyph[];
  /** Each point as `x,y`, start, nexts and end in order, with its element's name. */
  readonly points: readonly string[];
}

interface SbgnFile {
  readonly language?: string;
  readonly glyphs: readonly SbgnGlyph[];
  readonly arcs: readonly SbgnArc[];
}

function children(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

function glyphOf(element: XmlElement): SbgnGlyph {
  const label = children(element, 'label')[0];
  const labelBox = label === undefined ? undefined : children(label, 'bbox')[0];
  const bbox = children(element, 'bbox')[0];
  return {
    id: element.attributes['id'] ?? '',
    attributes: element.attributes,
    ...(label === undefined
      ? {}
      : {
          label: {
            ...(label.attributes['text'] === undefined ? {} : { text: label.attributes['text'] }),
            ...(labelBox === undefined ? {} : { bbox: labelBox.attributes }),
          },
        }),
    ...(bbox === undefined ? {} : { bbox: bbox.attributes }),
    glyphs: children(element, 'glyph').map(glyphOf),
    ports: children(element, 'port').map((port) => ({
      id: port.attributes['id'] ?? '',
      attributes: port.attributes,
    })),
  };
}

function arcOf(element: XmlElement): SbgnArc {
  const points = element.children
    .filter((child) => ['start', 'next', 'end'].includes(child.name))
    .map(
      (point) => `${point.name} ${point.attributes['x'] ?? '?'},${point.attributes['y'] ?? '?'}`
    );
  return {
    id: element.attributes['id'] ?? '',
    attributes: element.attributes,
    glyphs: children(element, 'glyph').map(glyphOf),
    points,
  };
}

/** An SBGN-ML document's glyphs and arcs. */
export function readSbgn(text: string, what = 'document'): SbgnFile {
  const root = parseXml(text, what);
  const map = children(root, 'map')[0];
  if (root.name !== 'sbgn' || map === undefined) {
    throw new UnreadableError(`${what}: not an SBGN-ML document`);
  }
  return {
    ...(map.attributes['language'] === undefined ? {} : { language: map.attributes['language'] }),
    glyphs: children(map, 'glyph').map(glyphOf),
    arcs: children(map, 'arc').map(arcOf),
  };
}

// -- Java's readings of an arc's points -------------------------------------------------

/** A float of the layout as Java writes it. */
function written(value: number): string {
  return javaFloat(float32(value));
}

function pointText(name: string, c: Coordinate): string {
  return `${name} ${written(c.x)},${written(c.y)}`;
}

interface Reading {
  readonly start: Coordinate;
  readonly next: readonly Coordinate[];
  readonly end: Coordinate;
}

function pointsText(reading: Reading): string[] {
  return [
    pointText('start', reading.start),
    ...reading.next.map((c) => pointText('next', c)),
    pointText('end', reading.end),
  ];
}

/**
 * Java's points for an arc (`SbgnConverter.getArc`, `Participant.getSegments`,
 * `getArcNextList`), with the reaction's backbone as given, or reversed, when the arc
 * starts. The backbone is a list Java reverses in place for an OUTPUT, and the segments
 * an arc takes from it are a view of it, read for the start before that reversal and for
 * the end after: so here the backbone is a list too, and those segments are read from it
 * when Java reads them. Undefined where Java writes no points or throws.
 */
export function javaReading(
  connector: Connector,
  edge: Edge,
  reversed: boolean
): Reading | undefined {
  const backbone = [...(edge.segments ?? [])];
  if (reversed) backbone.reverse();
  const own = connector.segments;
  const bounds = new ShapeBounds(edge.reactionShape);
  const line = (): readonly Segment[] | undefined => {
    if (own !== undefined && own.length > 0) return own;
    if (connector.type === 'INPUT') return backbone.length < 1 ? undefined : backbone.slice(0, 1);
    if (connector.type === 'OUTPUT') {
      if (backbone.length === 1) return backbone.slice();
      return backbone.length < 2 ? undefined : backbone.slice(1, 2);
    }
    return edge.segments === undefined ? undefined : backbone.slice();
  };
  const first = line()?.[0];
  if (first === undefined) return undefined;
  const next: Coordinate[] = [];
  for (const segment of own ?? []) if (!bounds.touches(segment)) next.push(segment.to);
  if (edge.segments !== undefined) {
    if (connector.type === 'INPUT') {
      for (const segment of backbone) {
        if (bounds.touches(segment)) break;
        next.push(segment.to);
      }
    } else if (connector.type === 'OUTPUT') {
      backbone.reverse();
      for (const segment of backbone) {
        if (bounds.touches(segment)) break;
        next.push(segment.from);
      }
    }
  }
  if (connector.type === 'OUTPUT') next.reverse();
  const last = line()?.at(-1);
  if (last === undefined) return undefined;
  return { start: first.from, next, end: last.to };
}

/**
 * Ours, from Java's reading with the backbone as given: for an OUTPUT with segments of its
 * own, start and end swapped (D5); for one without, the start at the `from` of the
 * backbone's last segment touching the reaction's shape and the end at the backbone's last
 * `to` (D6); the next points Java's.
 */
export function declaredReading(
  connector: Connector,
  edge: Edge,
  java: Reading
): { reading: Reading; kind: 'D5' | 'D6' } | undefined {
  if (connector.type !== 'OUTPUT') return undefined;
  if (connector.segments !== undefined && connector.segments.length > 0) {
    return { reading: { start: java.end, next: java.next, end: java.start }, kind: 'D5' };
  }
  const backbone = edge.segments ?? [];
  const bounds = new ShapeBounds(edge.reactionShape);
  const output = backbone.findLast((segment) => bounds.touches(segment));
  const last = backbone.at(-1);
  if (output === undefined || last === undefined) return undefined;
  return { reading: { start: output.from, next: java.next, end: last.to }, kind: 'D6' };
}

/** The connector and edge an arc id `arc_{node}_{type}_{edge}` names, in the layout. */
function participant(
  layout: DiagramLayout,
  arcId: string
): { connector: Connector; edge: Edge } | undefined {
  const match = /^arc_(-?\d+)_([a-z]+)_(-?\d+)$/.exec(arcId);
  if (match === null) return undefined;
  const [, nodeId, type, edgeId] = match;
  const edges = layout.edges.filter((e) => String(e.id) === edgeId);
  const edge = edges.at(-1);
  for (const node of layout.nodes) {
    if (String(node.id) !== nodeId) continue;
    const connector = node.connectors.find(
      (c) => c.type.toLowerCase() === type && String(c.edgeId) === edgeId
    );
    if (connector !== undefined && edge !== undefined) return { connector, edge };
  }
  return undefined;
}

/** The kind of a points difference, or undeclared. */
function pointsKind(
  arcId: string,
  ours: readonly string[],
  java: readonly string[],
  layout?: DiagramLayout
): Kind {
  if (layout === undefined) return 'undeclared';
  const found = participant(layout, arcId);
  if (found === undefined) return 'undeclared';
  const { connector, edge } = found;
  const same = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  const given = javaReading(connector, edge, false);
  const reversed = javaReading(connector, edge, true);
  if (given === undefined) return 'undeclared';
  const declared = declaredReading(connector, edge, given);
  const expected = declared === undefined ? given : declared.reading;
  if (!same(ours, pointsText(expected))) return 'undeclared';
  if (same(java, pointsText(given))) return declared?.kind ?? 'undeclared';
  if (reversed !== undefined && same(java, pointsText(reversed))) return 'D2';
  return 'undeclared';
}

// -- The comparison -----------------------------------------------------------------------

/** A label's text as a message shows it: never in full. */
function shortText(text: string | undefined): string | undefined {
  if (text === undefined || text.length <= 12) return text;
  return `${text.slice(0, 10)}… (${String(text.length)} characters)`;
}

class Comparison {
  readonly differences: Difference[] = [];

  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  add(kind: Kind, id: string, field: string, ours?: string, java?: string): void {
    this.differences.push({
      kind,
      id,
      field,
      ...(ours === undefined ? {} : { ours }),
      ...(java === undefined ? {} : { java }),
    });
  }

  /** Two string maps, field by field; `kind` decides each difference's kind. */
  fields(
    id: string,
    prefix: string,
    ours: Readonly<Record<string, string | undefined>> | undefined,
    java: Readonly<Record<string, string | undefined>> | undefined,
    kind: (field: string, ours?: string, java?: string) => Kind = () => 'undeclared'
  ): void {
    const names = new Set([...Object.keys(ours ?? {}), ...Object.keys(java ?? {})]);
    for (const name of [...names].sort()) {
      const a = ours?.[name];
      const b = java?.[name];
      if (a !== b) this.add(kind(name, a, b), id, `${prefix}${name}`, a, b);
    }
  }

  /** Lists matched by id: missing and extra ids, and, for those in both, their order. */
  matched<T extends { readonly id: string }>(
    what: string,
    ours: readonly T[],
    java: readonly T[],
    orderKind: Kind,
    each: (ours: T, java: T) => void
  ): void {
    const javaById = new Map(java.map((item) => [item.id, item]));
    const oursById = new Map(ours.map((item) => [item.id, item]));
    for (const item of ours)
      if (!javaById.has(item.id)) this.add('undeclared', item.id, `${what}: only ours`);
    for (const item of java)
      if (!oursById.has(item.id)) this.add('undeclared', item.id, `${what}: only Java's`);
    const both = (list: readonly T[], other: Map<string, T>): string[] =>
      list.filter((item) => other.has(item.id)).map((item) => item.id);
    if (both(ours, javaById).join('\n') !== both(java, oursById).join('\n')) {
      this.add(orderKind, `(${what})`, 'order');
    }
    for (const item of ours) {
      const other = javaById.get(item.id);
      if (other !== undefined) each(item, other);
    }
  }

  glyph(ours: SbgnGlyph, java: SbgnGlyph, onArc: boolean): void {
    const bulk = this.options.bulk === true;
    this.fields(ours.id, '', ours.attributes, java.attributes, (field, a, b) =>
      field === 'class' && onArc && a === 'cardinality' && b === 'stoichiometry'
        ? 'D3'
        : 'undeclared'
    );
    const unit = ours.attributes['class'] === 'unit of information';
    const compartment = ours.attributes['class'] === 'compartment';
    if (ours.label?.text !== java.label?.text) {
      this.add(
        'undeclared',
        ours.id,
        'label text',
        shortText(ours.label?.text),
        shortText(java.label?.text)
      );
    }
    if ((ours.label === undefined) !== (java.label === undefined)) {
      this.add(
        'undeclared',
        ours.id,
        'label',
        ours.label ? 'present' : 'absent',
        java.label ? 'present' : 'absent'
      );
    }
    this.fields(ours.id, 'label bbox ', ours.label?.bbox, java.label?.bbox, (field) =>
      field === 'w' && compartment && bulk ? 'D4' : 'undeclared'
    );
    this.fields(ours.id, 'bbox ', ours.bbox, java.bbox, (field) =>
      field === 'w' && unit && bulk ? 'D4' : 'undeclared'
    );
    this.matched(`ports of ${ours.id}`, ours.ports, java.ports, 'undeclared', (a, b) => {
      this.fields(a.id, '', a.attributes, b.attributes);
    });
    this.matched(`glyphs of ${ours.id}`, ours.glyphs, java.glyphs, 'undeclared', (a, b) => {
      this.glyph(a, b, false);
    });
  }

  arc(ours: SbgnArc, java: SbgnArc): void {
    this.fields(ours.id, '', ours.attributes, java.attributes);
    this.matched(`glyphs of ${ours.id}`, ours.glyphs, java.glyphs, 'undeclared', (a, b) => {
      this.glyph(a, b, true);
    });
    const same =
      ours.points.length === java.points.length &&
      ours.points.every((p, i) => p === java.points[i]);
    if (!same) {
      this.add(
        pointsKind(ours.id, ours.points, java.points, this.options.layout),
        ours.id,
        'points',
        ours.points.join(' '),
        java.points.join(' ')
      );
    }
  }

  document(ours: SbgnFile, java: SbgnFile): void {
    if (ours.language !== java.language)
      this.add('undeclared', '(map)', 'language', ours.language, java.language);
    this.matched('glyphs', ours.glyphs, java.glyphs, 'D1', (a, b) => {
      this.glyph(a, b, false);
    });
    this.matched('arcs', ours.arcs, java.arcs, 'D1', (a, b) => {
      this.arc(a, b);
    });
  }
}

/** Every difference between our document and Java's, each with its kind. */
export function compareDocuments(ours: string, java: string, options: Options = {}): Difference[] {
  const comparison = new Comparison(options);
  comparison.document(readSbgn(ours, 'ours'), readSbgn(java, "Java's"));
  return comparison.differences;
}

// -- Files, folders and the command line ------------------------------------------------

function read(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new UnreadableError(error instanceof Error ? error.message : String(error));
  }
}

function layoutFrom(path: string): DiagramLayout {
  try {
    return readLayout(JSON.parse(read(path)));
  } catch (error) {
    if (error instanceof UnreadableError) throw error;
    throw new UnreadableError(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (error) {
    throw new UnreadableError(error instanceof Error ? error.message : String(error));
  }
}

/** Two files, or two folders of `.sbgn` files compared by name. */
export function comparePaths(
  ours: string,
  java: string,
  layout: string | undefined,
  bulk: boolean
): Difference[] {
  if (!isFolder(ours)) {
    return compareDocuments(read(ours), read(java), {
      bulk,
      ...(layout === undefined ? {} : { layout: layoutFrom(layout) }),
    });
  }
  const names = (dir: string): string[] =>
    readdirSync(dir)
      .filter((name) => name.endsWith('.sbgn'))
      .sort();
  const oursNames = names(ours);
  const javaNames = names(java);
  const differences: Difference[] = [];
  for (const name of oursNames) {
    if (!javaNames.includes(name))
      differences.push({ kind: 'undeclared', id: name, field: 'file: only ours' });
  }
  for (const name of javaNames) {
    if (!oursNames.includes(name))
      differences.push({ kind: 'undeclared', id: name, field: "file: only Java's" });
  }
  for (const name of oursNames.filter((n) => javaNames.includes(n))) {
    const options: Options = {
      bulk,
      ...(layout === undefined
        ? {}
        : { layout: layoutFrom(join(layout, name.replace(/\.sbgn$/, '.json'))) }),
    };
    for (const difference of compareDocuments(
      read(join(ours, name)),
      read(join(java, name)),
      options
    )) {
      differences.push({ ...difference, file: name });
    }
  }
  return differences;
}

/** A count per kind, and every undeclared difference. */
export function report(differences: readonly Difference[]): string {
  const lines = KINDS.map(
    (kind) => `${kind}: ${String(differences.filter((d) => d.kind === kind).length)}`
  );
  for (const d of differences.filter((x) => x.kind === 'undeclared')) {
    const where = d.file === undefined ? d.id : `${d.file} ${d.id}`;
    const values =
      d.ours === undefined && d.java === undefined
        ? ''
        : `: ours ${d.ours ?? '(none)'}, Java's ${d.java ?? '(none)'}`;
    lines.push(`undeclared ${where} ${d.field}${values}`);
  }
  return `${lines.join('\n')}\n`;
}

const USAGE = 'Usage: node ci/compare.ts <ours> <java> [--layout <layout>] [--bulk] [--json]';

/** The command line: its exit status. */
export function main(
  args: readonly string[],
  out: (text: string) => void = (t) => process.stdout.write(t),
  err: (text: string) => void = (t) => process.stderr.write(t)
): number {
  const paths: string[] = [];
  let layout: string | undefined;
  let bulk = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--bulk') bulk = true;
    else if (arg === '--json') json = true;
    else if (arg === '--layout') layout = args[++i];
    else if (arg !== undefined && !arg.startsWith('--')) paths.push(arg);
    else {
      err(`${USAGE}\n`);
      return 2;
    }
  }
  const [ours, java] = paths;
  if (
    paths.length !== 2 ||
    ours === undefined ||
    java === undefined ||
    (args.includes('--layout') && layout === undefined)
  ) {
    err(`${USAGE}\n`);
    return 2;
  }
  let differences: Difference[];
  try {
    differences = comparePaths(ours, java, layout, bulk);
  } catch (error) {
    if (error instanceof UnreadableError) {
      err(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
  if (json) {
    const counts = Object.fromEntries(
      KINDS.map((kind) => [kind, differences.filter((d) => d.kind === kind).length])
    );
    const undeclared = differences.filter((d) => d.kind === 'undeclared');
    out(`${JSON.stringify({ counts, undeclared }, null, 2)}\n`);
  } else {
    out(report(differences));
  }
  return differences.some((d) => d.kind === 'undeclared') ? 1 : 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
