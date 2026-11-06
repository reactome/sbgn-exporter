/**
 * The width Java gives a label's box (research R5, D4): diagram-exporter's SbgnConverter
 * measures a unit of information's label and a compartment's name with
 * `new Canvas().getFontMetrics(new Font("Arial", Font.PLAIN, 16)).stringWidth(text)`.
 *
 * The widths come from text-widths.json, taken from Java 11 by
 * ci/reference/widths/Widths.java, not from the font, which is not under a licence this
 * repository can take. Java's stringWidth adds each UTF-16 code unit's width while every
 * one is "simple", and so does this; a code unit the font cannot draw is the missing
 * glyph's width. A string holding one that is not simple (a combining mark, a complex
 * script, a bidi or joiner control, a surrogate) Java lays out whole, where a width can
 * depend on its neighbours: this refuses it rather than write a width Java would not.
 */
import json from './text-widths.json' with { type: 'json' };
const LAST_UNIT = 0xffff;
/** Marks a code unit measured whole in the lookup; above any width the table allows. */
const WHOLE = 0xff;
function refuse(what, value, expected) {
    throw new TypeError(`text-widths.json: ${what} is ${JSON.stringify(value)}, not ${expected}`);
}
function wholeNumber(value, max, what) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
        return refuse(what, value, `a whole number from 0 to ${String(max)}`);
    }
    return value;
}
function list(value, what) {
    if (!Array.isArray(value))
        return refuse(what, value, 'a list');
    const items = value;
    return items;
}
/** A [first, last, ...] range of code units, with first ≤ last. */
function range(value, length, what) {
    const items = list(value, what);
    if (items.length !== length)
        return refuse(what, value, `${String(length)} numbers`);
    const first = wholeNumber(items[0], LAST_UNIT, `${what}'s first`);
    const last = wholeNumber(items[1], LAST_UNIT, `${what}'s last`);
    if (last < first)
        return refuse(what, value, 'a range whose last follows its first');
    return [first, last];
}
/**
 * Reads the table, refusing anything that is not one: the fields Widths.java writes,
 * widths below the lookup's marker, and runs and whole ranges in order, apart from
 * each other, within the code units.
 */
export function readWidthTable(value) {
    if (typeof value !== 'object' || value === null)
        return refuse('the table', value, 'an object');
    const field = (key) => (key in value ? Reflect.get(value, key) : undefined);
    const [font, style, size, java] = [field('font'), field('style'), field('size'), field('java')];
    if (font !== 'Arial')
        return refuse('font', font, 'Arial');
    if (style !== 'plain')
        return refuse('style', style, 'plain');
    if (size !== 16)
        return refuse('size', size, '16');
    if (typeof java !== 'string')
        return refuse('java', java, 'text');
    const missing = wholeNumber(field('missing'), WHOLE - 1, 'missing');
    const runs = list(field('runs'), 'runs').map((item, i) => {
        const [first = 0, last = 0] = range(item, 3, `run ${String(i)}`);
        const width = wholeNumber(list(item, `run ${String(i)}`)[2], WHOLE - 1, `run ${String(i)}'s width`);
        return [first, last, width];
    });
    const whole = list(field('whole'), 'whole').map((item, i) => {
        const [first = 0, last = 0] = range(item, 2, `whole range ${String(i)}`);
        return [first, last];
    });
    const ranges = [...runs, ...whole].map(([first, last]) => [
        first,
        last,
    ]);
    ranges.sort((a, b) => a[0] - b[0]);
    let end = -1;
    for (const [first, last] of ranges) {
        if (first <= end)
            return refuse('a range', [first, last], 'apart from the others');
        end = last;
    }
    return { font, style, size, java, missing, runs, whole };
}
/** The table, read once. */
export const WIDTH_TABLE = readWidthTable(json);
/** Each code unit's width, or WHOLE. */
const WIDTHS = (() => {
    const widths = new Uint8Array(LAST_UNIT + 1).fill(WIDTH_TABLE.missing);
    for (const [first, last, width] of WIDTH_TABLE.runs)
        widths.fill(width, first, last + 1);
    for (const [first, last] of WIDTH_TABLE.whole)
        widths.fill(WHOLE, first, last + 1);
    return widths;
})();
/**
 * The label's width as Java measures it: the sum of its code units' widths.
 *
 * @throws RangeError for text Java measures with a layout of the whole string, naming
 *   the first code unit that makes it do so.
 */
export function textWidth(text) {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
        const unit = text.charCodeAt(i);
        const w = WIDTHS[unit] ?? WHOLE;
        if (w === WHOLE) {
            const code = unit.toString(16).toUpperCase().padStart(4, '0');
            throw new RangeError(`Java measures ${JSON.stringify(text)} with a layout of the whole text (U+${code}), which the width table cannot reproduce`);
        }
        width += w;
    }
    return width;
}
