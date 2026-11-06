/** A UTF-16 code unit, 0 to 0xFFFF: what Java's stringWidth walks. */
export type CodeUnit = number;
/** A width in pixels, as FontMetrics answers it: a whole number. */
export type Pixels = number;
/** Consecutive code units of one width. */
export type WidthRun = readonly [first: CodeUnit, last: CodeUnit, width: Pixels];
/** Consecutive code units Java measures only by laying out the whole string. */
export type WholeRange = readonly [first: CodeUnit, last: CodeUnit];
/** The table Widths.java writes. */
export interface WidthTable {
    readonly font: 'Arial';
    readonly style: 'plain';
    readonly size: 16;
    /** The Java version it was measured with. */
    readonly java: string;
    /** The missing glyph's width: any code unit in neither runs nor whole. */
    readonly missing: Pixels;
    readonly runs: readonly WidthRun[];
    readonly whole: readonly WholeRange[];
}
/**
 * Reads the table, refusing anything that is not one: the fields Widths.java writes,
 * widths below the lookup's marker, and runs and whole ranges in order, apart from
 * each other, within the code units.
 */
export declare function readWidthTable(value: unknown): WidthTable;
/** The table, read once. */
export declare const WIDTH_TABLE: WidthTable;
/**
 * The label's width as Java measures it: the sum of its code units' widths.
 *
 * @throws RangeError for text Java measures with a layout of the whole string, naming
 *   the first code unit that makes it do so.
 */
export declare function textWidth(text: string): Pixels;
