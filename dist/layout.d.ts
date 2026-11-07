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
export declare class SbgnLayoutError extends Error {
    readonly name = "SbgnLayoutError";
}
declare const layoutIdBrand: unique symbol;
/**
 * A diagram object's `id`: its number within this layout, which a connector's `edgeId`
 * names and Java writes into glyph and arc ids. Not a database identifier.
 */
export type LayoutId = number & {
    readonly [layoutIdBrand]: true;
};
declare const reactomeIdBrand: unique symbol;
/** A diagram object's `reactomeId`: the database identifier (dbId) of what it draws. */
export type ReactomeId = number & {
    readonly [reactomeIdBrand]: true;
};
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
export interface Compartment extends DiagramObject {
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
    readonly shape: {
        readonly a: Coordinate;
    };
}
export declare const CONNECTOR_TYPES: readonly ["INPUT", "OUTPUT", "CATALYST", "INHIBITOR", "ACTIVATOR"];
/** How a node takes part in a reaction (diagram-reader's `ConnectorType`). */
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];
/** A participant's count, and the box it is drawn in when it is drawn (not for 1). */
export interface Stoichiometry {
    /** A Java `Integer`. */
    readonly value: number;
    readonly shape?: {
        readonly a: Coordinate;
        readonly b: Coordinate;
    };
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
/**
 * Reads a parsed diagram layout into its type, refusing a field of the wrong type with
 * an `SbgnLayoutError` that names the object (its kind, `id`, `reactomeId` and place in
 * its list) and the field.
 */
export declare function readLayout(value: unknown): DiagramLayout;
export {};
