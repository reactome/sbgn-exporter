/**
 * The document model written as SBGN-ML, byte for byte as libSBGN 0.2 writes it (spec 001
 * T010, research R4): `SbgnUtil.writeToFile`, which the content service calls, marshals
 * with JAXB 2.3 and formatted output.
 *
 * - The declaration `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`, the
 *   default namespace on `<sbgn>`, four spaces per level, LF line ends, a final newline.
 * - Attributes in libSBGN's order: glyph `class`, `id`, `compartmentOrder`; label `text`;
 *   bbox `w`, `h`, `x`, `y`; port `id`, `x`, `y`; arc `class`, `id`, `source`, `target`;
 *   start, next and end `x`, `y`. Children in its order: a glyph's label, bbox, glyphs,
 *   ports; an arc's glyphs, start, nexts, end. An element without children is
 *   self-closed.
 * - Attribute values escaped as JAXB escapes them: `&amp;`, `&lt;`, `&gt;`, `&quot;`,
 *   and a line feed and carriage return as `&#10;` and `&#13;`; everything else as it is,
 *   in UTF-8, a tab included.
 * - Numbers as JAXB prints an `xs:float`: `INF` and `-INF` for the infinities, otherwise
 *   JDK 11's `Float.toString` (`java-float.ts`).
 *
 * One difference from Java: text with a character XML 1.0 cannot hold (a control
 * character other than tab, line feed and carriage return; U+FFFE, U+FFFF; half a
 * surrogate pair) is refused, where JAXB writes it as it is into a file no XML parser
 * reads (constitution IV).
 */
import { javaFloat } from "./java-float.js";
import { SbgnLayoutError } from "./layout.js";
import { SBGN_NAMESPACE } from "./sbgn.js";
function element(name, attributes, children = []) {
    return { name, attributes, children };
}
/** An `xs:float` as JAXB prints it. */
function float(value) {
    if (value === Infinity)
        return 'INF';
    if (value === -Infinity)
        return '-INF';
    return javaFloat(value);
}
/**
 * The first character XML 1.0 cannot hold, if any: a C0 control but tab, line feed and
 * carriage return; U+FFFE or U+FFFF; half a surrogate pair.
 */
function notXml(value) {
    for (const character of value) {
        const code = character.codePointAt(0) ?? 0;
        const control = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
        const surrogate = code >= 0xd800 && code <= 0xdfff;
        if (control || surrogate || code === 0xfffe || code === 0xffff)
            return code;
    }
    return undefined;
}
const ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\n': '&#10;',
    '\r': '&#13;',
};
function escape(value, where) {
    const bad = notXml(value);
    if (bad !== undefined) {
        const code = bad.toString(16).toUpperCase().padStart(4, '0');
        throw new SbgnLayoutError(`SBGN-ML, ${where}: ${JSON.stringify(value)} has a character XML 1.0 cannot hold (U+${code})`);
    }
    return value.replace(/[&<>"\n\r]/g, (c) => ESCAPES[c] ?? c);
}
function box(b) {
    return element('bbox', [
        ['w', float(b.w)],
        ['h', float(b.h)],
        ['x', float(b.x)],
        ['y', float(b.y)],
    ]);
}
function point(name, p) {
    return element(name, [
        ['x', float(p.x)],
        ['y', float(p.y)],
    ]);
}
function port(p) {
    return element('port', [
        ['id', p.id],
        ['x', float(p.x)],
        ['y', float(p.y)],
    ]);
}
function glyph(g) {
    const attributes = [
        ['class', g.class],
        ['id', g.id],
    ];
    if (g.compartmentOrder !== undefined) {
        attributes.push(['compartmentOrder', float(g.compartmentOrder)]);
    }
    const label = element('label', [['text', escape(g.label.text, `the label of ${g.id}`)]], g.label.bbox === undefined ? [] : [box(g.label.bbox)]);
    return element('glyph', attributes, [
        label,
        box(g.bbox),
        ...g.glyphs.map(glyph),
        ...g.ports.map(port),
    ]);
}
function arc(a) {
    return element('arc', [
        ['class', a.class],
        ['id', a.id],
        ['source', a.source],
        ['target', a.target],
    ], [
        ...a.glyphs.map(glyph),
        point('start', a.start),
        ...a.next.map((p) => point('next', p)),
        point('end', a.end),
    ]);
}
const INDENT = '    ';
function lines(e, depth, out) {
    const indent = INDENT.repeat(depth);
    const attributes = e.attributes.map(([name, value]) => ` ${name}="${value}"`).join('');
    if (e.children.length === 0) {
        out.push(`${indent}<${e.name}${attributes}/>`);
        return;
    }
    out.push(`${indent}<${e.name}${attributes}>`);
    for (const child of e.children)
        lines(child, depth + 1, out);
    out.push(`${indent}</${e.name}>`);
}
/**
 * The document's SBGN-ML text, as libSBGN 0.2 writes it; to be saved or sent as UTF-8.
 *
 * @throws SbgnLayoutError for a label with a character XML 1.0 cannot hold, naming its
 *   glyph.
 */
export function writeSbgn(document) {
    const map = element('map', [['language', document.language]], [...document.glyphs.map(glyph), ...document.arcs.map(arc)]);
    const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
    lines(element('sbgn', [['xmlns', SBGN_NAMESPACE]], [map]), 0, out);
    return `${out.join('\n')}\n`;
}
