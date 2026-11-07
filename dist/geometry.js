/**
 * Where a reaction's process glyph, its ports and its arcs are drawn (spec 001 T008,
 * data-model.md): diagram-exporter 2.0.12's `ShapeWrapper`, the box and ports of
 * `SbgnConverter.getEdgeGlyph`, and the points of `SbgnConverter.getArc` with
 * `Participant.getSegments` and `getArcNextList`, with the declared differences D2, D5 and
 * D6 (research R3.2, R3.5 to R3.7).
 *
 * **Numbers follow Java's arithmetic step by step.** Java takes `floatValue()` of the
 * layout's doubles and computes in float from there: each float operation here is one
 * `float32` (`Math.fround`), in Java's order, never one at the end. Where Java computes in
 * doubles (a BOX's centre through `Coordinate`, the test of a port's direction), so does
 * this, rounding once where Java calls `floatValue()`.
 *
 * **Nothing here alters the layout** (D2). Java reverses a reaction's backbone in place
 * for every OUTPUT arc it writes, so its later arcs of that reaction read it as given or
 * reversed by chance; here every arc reads the backbone as the layout gives it, as Java
 * reads it for a reaction none of whose OUTPUT arcs it has written yet, and reversals are
 * made on copies.
 */
import { float32 } from "./java-float.js";
import { SbgnLayoutError, } from "./layout.js";
const JAVA_INT_MIN = -(2 ** 31);
const JAVA_INT_MAX = 2 ** 31 - 1;
/**
 * A Java `Double`'s `intValue()`: truncated toward zero (not floored: -10.5 is -10), and
 * held within an `int`'s range. A layout's numbers are finite, so NaN does not arise.
 */
function intValue(value) {
    if (value <= JAVA_INT_MIN)
        return JAVA_INT_MIN;
    if (value >= JAVA_INT_MAX)
        return JAVA_INT_MAX;
    return Math.trunc(value);
}
/**
 * A reaction shape's bounds as Java's `ShapeWrapper` holds them: the least and greatest x
 * and y of its corners (a box's `a` and `b`, a circle's centre plus and minus its radius,
 * in doubles), each truncated toward zero by `intValue()`.
 */
export class ShapeBounds {
    minX;
    maxX;
    minY;
    maxY;
    constructor(shape) {
        const xs = [];
        const ys = [];
        if (shape.type === 'BOX') {
            xs.push(shape.a.x, shape.b.x);
            ys.push(shape.a.y, shape.b.y);
        }
        else {
            xs.push(shape.c.x + shape.r, shape.c.x - shape.r);
            ys.push(shape.c.y + shape.r, shape.c.y - shape.r);
        }
        this.minX = intValue(Math.min(...xs));
        this.maxX = intValue(Math.max(...xs));
        this.minY = intValue(Math.min(...ys));
        this.maxY = intValue(Math.max(...ys));
    }
    /** Whether either end of the segment lies within the bounds, edges included. */
    touches(segment) {
        return this.contains(segment.from) || this.contains(segment.to);
    }
    contains(point) {
        return (point.x >= this.minX && point.x <= this.maxX && point.y >= this.minY && point.y <= this.maxY);
    }
}
/** A layout point as Java writes it: each double's `floatValue()`. */
function point(coordinate) {
    return { x: float32(coordinate.x), y: float32(coordinate.y) };
}
/** Java's float subtraction, addition, product and quotient: one rounding each. */
function minus(a, b) {
    return float32(a - b);
}
function plus(a, b) {
    return float32(a + b);
}
function times(a, b) {
    return float32(a * b);
}
function over(a, b) {
    return float32(a / b);
}
const TWO = float32(2);
const THREE = float32(3);
const FOUR = float32(4);
function edgeName(edge) {
    return `edge ${String(edge.id)} (reactomeId ${String(edge.reactomeId)})`;
}
/** A backbone none of whose segments touches the shape, where Java throws. */
function untouched(edge) {
    return new SbgnLayoutError(`Diagram layout, ${edgeName(edge)}: no segment of its backbone touches its shape`);
}
/** The process glyph's box (getEdgeGlyph): a box's corners, or a circle's square. */
function processBox(shape) {
    if (shape.type === 'BOX') {
        const ax = float32(shape.a.x);
        const ay = float32(shape.a.y);
        return {
            x: ax,
            y: ay,
            w: minus(float32(shape.b.x), ax),
            h: minus(float32(shape.b.y), ay),
        };
    }
    const r = float32(shape.r);
    return {
        x: minus(float32(shape.c.x), r),
        y: minus(float32(shape.c.y), r),
        w: times(r, TWO),
        h: times(r, TWO),
    };
}
/**
 * A reaction's process glyph: its box, and where its two ports go (`getEdgeGlyph`).
 *
 * With a backbone, the ports follow the first two of its segments that touch the shape
 * (the first twice if only one does): beside the box, a third of its width out, when
 * those segments run further across than the box is wide, else above and below it, a
 * third of its height out. Without one, both ports are at the shape's centre.
 *
 * @throws SbgnLayoutError when the reaction has a backbone none of whose segments touches
 *   its shape, where Java's `portCandidates.get(0)` throws.
 */
export function processGeometry(edge) {
    const shape = edge.reactionShape;
    const box = processBox(shape);
    const backbone = edge.segments ?? [];
    if (backbone.length === 0) {
        // Coordinate's arithmetic, in doubles: a + (b - a) / 2.
        const centre = shape.type === 'BOX'
            ? {
                x: shape.a.x + (shape.b.x - shape.a.x) / 2,
                y: shape.a.y + (shape.b.y - shape.a.y) / 2,
            }
            : shape.c;
        return { box, ports: [point(centre), point(centre)] };
    }
    const bounds = new ShapeBounds(shape);
    const candidates = backbone.filter((segment) => bounds.touches(segment));
    const first = candidates[0];
    if (first === undefined)
        throw untouched(edge);
    const second = candidates[1] ?? first;
    // A double difference against the float width, widened, as Java compares them.
    if (Math.abs(first.from.x - second.to.x) > box.w) {
        return {
            box,
            ports: [
                { x: minus(box.x, over(box.w, THREE)), y: float32(first.from.y) },
                { x: plus(box.x, over(times(FOUR, box.w), THREE)), y: float32(second.to.y) },
            ],
        };
    }
    return {
        box,
        ports: [
            { x: float32(first.from.x), y: plus(box.y, over(times(FOUR, box.h), THREE)) },
            { x: float32(second.to.x), y: minus(box.y, over(box.h, THREE)) },
        ],
    };
}
/**
 * The points an arc passes through between its ends (`getArcNextList`): the `to` of each
 * of the connector's own segments that does not touch the shape; then, for an INPUT, the
 * `to` of each backbone segment up to the first that touches it, and for an OUTPUT the
 * `from` of each segment of the backbone reversed (a copy, D2) up to the first that
 * touches it; for an OUTPUT, all of them in reverse order.
 */
function nextPoints(connector, edge, bounds) {
    const next = [];
    for (const segment of connector.segments ?? []) {
        if (!bounds.touches(segment))
            next.push(point(segment.to));
    }
    const backbone = edge.segments;
    if (backbone !== undefined) {
        if (connector.type === 'INPUT') {
            for (const segment of backbone) {
                if (bounds.touches(segment))
                    break;
                next.push(point(segment.to));
            }
        }
        else if (connector.type === 'OUTPUT') {
            for (const segment of backbone.toReversed()) {
                if (bounds.touches(segment))
                    break;
                next.push(point(segment.from));
            }
        }
    }
    return connector.type === 'OUTPUT' ? next.toReversed() : next;
}
/**
 * The segments whose ends are an arc's start and end: the connector's own, if it has any;
 * else, for an INPUT, the backbone's first segment, and for a regulator the whole backbone,
 * if any, as `Participant.getSegments` takes them.
 *
 * For an OUTPUT without segments of its own, D6 (research R3.6): the backbone from its
 * last segment that touches the reaction's shape to its end, which is the part from the
 * reaction's output port to the product. Its start is that segment's `from`, and its end
 * the last segment's `to`; the next points Java's walk gives are the `from` of each
 * segment between. Java instead takes the backbone's second segment (its only one, if it
 * has one), which leads away from the reaction only on a backbone of one or two segments.
 * Java's refusals are kept: a missing or empty backbone, and one that never touches the
 * shape (Java's `getEdgeGlyph` throws on it).
 */
function arcLine(node, connector, edge) {
    const own = connector.segments;
    if (own !== undefined && own.length > 0)
        return own;
    if (connector.type !== 'INPUT' && connector.type !== 'OUTPUT')
        return edge.segments;
    const backbone = edge.segments ?? [];
    if (backbone.length === 0) {
        const has = edge.segments === undefined ? 'no backbone' : `${String(backbone.length)} segments`;
        throw new SbgnLayoutError(`Diagram layout, node ${String(node.id)} (reactomeId ${String(node.reactomeId)}): ` +
            `its ${connector.type} to ${edgeName(edge)} has no segments of its own, and the ` +
            `reaction's backbone, which it would take, has ${has}`);
    }
    if (connector.type === 'INPUT')
        return backbone.slice(0, 1);
    const bounds = new ShapeBounds(edge.reactionShape);
    const output = backbone.findLastIndex((segment) => bounds.touches(segment));
    if (output < 0)
        throw untouched(edge);
    return backbone.slice(output);
}
/**
 * An arc's points (`getArc`), with D2 (the backbone as given), D6 (an OUTPUT without
 * segments of its own runs along the backbone from the reaction's output port to its end,
 * towards the product) and
 * D5 (an OUTPUT with segments of its own runs from the reaction: Java's end is its start
 * and Java's start its end; the next points are Java's).
 *
 * Returns `undefined` where Java writes an arc with no points: a regulator (CATALYST,
 * INHIBITOR or ACTIVATOR) with no segments of its own on a reaction without a backbone.
 *
 * @throws SbgnLayoutError for an INPUT or OUTPUT without segments of its own on a reaction
 *   whose backbone is missing or empty, where Java's `subList` throws, or, for such an
 *   OUTPUT, one none of whose segments touches the reaction's shape.
 */
export function arcPoints(node, connector, edge) {
    const line = arcLine(node, connector, edge);
    const first = line?.[0];
    const last = line?.[line.length - 1];
    if (first === undefined || last === undefined)
        return undefined;
    const next = nextPoints(connector, edge, new ShapeBounds(edge.reactionShape));
    const start = point(first.from);
    const end = point(last.to);
    const own = connector.segments !== undefined && connector.segments.length > 0;
    if (connector.type === 'OUTPUT' && own)
        return { start: end, next, end: start };
    return { start, next, end };
}
