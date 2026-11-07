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
import { type Float32 } from './java-float.ts';
import { type Connector, type Edge, type Node, type ReactionShape, type Segment } from './layout.ts';
/** A point written to SBGN: a Java float pair. */
export interface Point {
    readonly x: Float32;
    readonly y: Float32;
}
/** A glyph's box written to SBGN (libSBGN's `Bbox`): Java floats. */
export interface Box {
    readonly x: Float32;
    readonly y: Float32;
    readonly w: Float32;
    readonly h: Float32;
}
/** A reaction's process glyph: its box, and its two ports (`.1` the inputs', `.2` the outputs'). */
export interface ProcessGeometry {
    readonly box: Box;
    readonly ports: readonly [Point, Point];
}
/** An arc's points: where it starts, the points it passes through, and where it ends. */
export interface ArcPoints {
    readonly start: Point;
    readonly next: readonly Point[];
    readonly end: Point;
}
/**
 * A reaction shape's bounds as Java's `ShapeWrapper` holds them: the least and greatest x
 * and y of its corners (a box's `a` and `b`, a circle's centre plus and minus its radius,
 * in doubles), each truncated toward zero by `intValue()`.
 */
export declare class ShapeBounds {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    constructor(shape: ReactionShape);
    /** Whether either end of the segment lies within the bounds, edges included. */
    touches(segment: Segment): boolean;
    private contains;
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
export declare function processGeometry(edge: Edge): ProcessGeometry;
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
export declare function arcPoints(node: Node, connector: Connector, edge: Edge): ArcPoints | undefined;
