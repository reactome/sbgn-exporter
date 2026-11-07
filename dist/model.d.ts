/**
 * The SBGN-ML document as the conversion builds it and the writer writes it (spec 001,
 * data-model.md's output model): libSBGN 0.2's `Sbgn`, `Map`, `Glyph`, `Arc`, `Port`,
 * `Label` and `Bbox`, with only what Java's converter sets. Every number is a Java float
 * (`Float32`), as libSBGN holds it; references to glyphs and ports are their ids, as
 * libSBGN writes them.
 */
import type { Float32 } from './java-float.ts';
import type { Box, Point } from './geometry.ts';
import type { SBGN_LANGUAGE } from './sbgn.ts';
declare const sbgnIdBrand: unique symbol;
/** A glyph's, port's or arc's id in the document, which arcs name as source and target. */
export type SbgnId = string & {
    readonly [sbgnIdBrand]: true;
};
/** An entity's class: what a layout node is drawn as (research R2). */
export type EntityClass = 'complex' | 'macromolecule' | 'simple chemical' | 'submap' | 'unspecified entity';
/** A reaction's class: its process glyph's (research R2). */
export type ProcessClass = 'process' | 'omitted process' | 'uncertain process' | 'association' | 'dissociation';
/**
 * Every glyph class written: compartments, entities, reactions, a node's units of
 * information, and an arc's cardinality (D3: Java writes `stoichiometry`, which libSBGN 0.2
 * does not have).
 */
export type GlyphClass = 'compartment' | EntityClass | ProcessClass | 'unit of information' | 'cardinality';
/** An arc's class, by its connector's type (research R2). */
export type ArcClass = 'consumption' | 'production' | 'catalysis' | 'inhibition' | 'stimulation';
export interface Label {
    readonly text: string;
    /** Only a compartment's label has a box. */
    readonly bbox?: Box;
}
export interface Port {
    readonly id: SbgnId;
    readonly x: Float32;
    readonly y: Float32;
}
export interface Glyph {
    readonly class: GlyphClass;
    readonly id: SbgnId;
    /** Only compartments have one: 10. */
    readonly compartmentOrder?: Float32;
    readonly label: Label;
    readonly bbox: Box;
    /** An entity's units of information. */
    readonly glyphs: readonly Glyph[];
    /** A reaction's two ports. */
    readonly ports: readonly Port[];
}
export interface Arc {
    readonly class: ArcClass;
    readonly id: SbgnId;
    /** A glyph's or port's id. */
    readonly source: SbgnId;
    /** A glyph's or port's id. */
    readonly target: SbgnId;
    /** Its cardinality, if the layout draws one. */
    readonly glyphs: readonly Glyph[];
    readonly start: Point;
    readonly next: readonly Point[];
    readonly end: Point;
}
/** One SBGN-ML map: its glyphs (compartments, entities, reactions) and its arcs. */
export interface SbgnDocument {
    readonly language: typeof SBGN_LANGUAGE;
    readonly glyphs: readonly Glyph[];
    readonly arcs: readonly Arc[];
}
export {};
