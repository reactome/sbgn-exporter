// Writing the document as libSBGN 0.2 writes it (spec 001 T010, research R4).
//
// The expected files in fixtures/write/java/ are libSBGN 0.2's own output, written on
// 7 Nov 2026 by SbgnUtil.writeToFile (as the content service's ExportManager calls it;
// JAXB 2.3.0, OpenJDK 11.0.32, offline) and kept exactly as written:
// - model.sbgn: a scratch program built libSBGN's bindings (Sbgn, Map, Glyph, Label,
//   Bbox, Port, Arc) from fixtures/write/model.json, a model made by hand, casting each
//   number to float as Java's `(float)` does, and wrote them. It holds every escape
//   (`&`, `<`, `>`, `"`, an apostrophe and a tab left as they are, a line feed and a
//   carriage return), text outside ASCII and the BMP, an empty label, and every form of
//   float: whole (48.0), fractional, a float that is not the double it came from
//   (1234.5677), E notation both ways, JDK 11's non-shortest 3.0000001E10, the least
//   subnormal and normal and the greatest finite, the infinities (INF, -INF), and both
//   zeros.
// - disease.sbgn and ports.sbgn: diagram-exporter 2.0.12's SbgnConverter.getSbgn() on
//   fixtures/read-layout/disease.json and fixtures/geometry/ports.json, its glyphs and
//   arcs then put in the fixed order (D1) by the same program, and D3 applied, before
//   writing. Neither has a production arc, so Java's points do not depend on its random
//   order (D2) and D5 and D6 do not arise: the files are Java's but for D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert } from '../src/convert.ts';
import { readLayout, SbgnLayoutError } from '../src/layout.ts';
import type { SbgnDocument } from '../src/model.ts';
import { writeSbgn } from '../src/write.ts';

function file(path: string): Buffer {
  return readFileSync(new URL(`../fixtures/${path}`, import.meta.url));
}

/** model.json, each number cast to float as Java's harness casts it. */
function model(): SbgnDocument {
  const floats = (_key: string, value: unknown): unknown =>
    typeof value === 'number' ? Math.fround(value) : value;
  return JSON.parse(file('write/model.json').toString('utf8'), floats) as SbgnDocument;
}

function java(name: string): string {
  return file(`write/java/${name}.sbgn`).toString('utf8');
}

/** The written line holding `marker`, ours and Java's. */
function lineWith(text: string, marker: string): string | undefined {
  return text.split('\n').find((line) => line.includes(marker));
}

test("a hand-made model is written byte for byte as libSBGN's writer writes it", () => {
  const ours = Buffer.from(writeSbgn(model()), 'utf8');
  assert.equal(ours.toString('utf8'), java('model'));
  assert.ok(ours.equals(file('write/java/model.sbgn')));
});

for (const [name, path] of [
  ['disease', 'read-layout/disease.json'],
  ['ports', 'geometry/ports.json'],
] as const) {
  test(`${name}: a layout converted and written is Java's file, in the fixed order`, () => {
    const layout = readLayout(JSON.parse(file(path).toString('utf8')));
    assert.equal(writeSbgn(convert(layout)), java(name));
  });
}

test('attribute values are escaped as JAXB escapes them', () => {
  const ours = writeSbgn(model());
  for (const marker of ['a&amp;b', 'two&#10;', 'é α', '<label text=""/>']) {
    assert.equal(lineWith(ours, marker), lineWith(java('model'), marker), marker);
  }
  assert.equal(
    lineWith(ours, 'a&amp;b'),
    `            <label text="a&amp;b&lt;c&gt;d&quot;e'f\tg"/>`
  );
  assert.equal(
    lineWith(ours, 'two&#10;'),
    '            <label text="two&#10;lines&#13;&#10;here"/>'
  );
});

test('numbers are written as Java writes a float', () => {
  const ours = writeSbgn(model());
  const java11 = java('model');
  for (const marker of [
    'w="1234.5677"',
    'x="9999999.0" y="1.0E7"',
    'w="3.0000001E10"',
    'x="INF" y="-INF"',
    'y="-0.0"',
  ]) {
    assert.equal(lineWith(ours, marker), lineWith(java11, marker), marker);
    assert.ok(lineWith(ours, marker), marker);
  }
});

test("attributes and children are in libSBGN's order, four spaces a level", () => {
  const ours = writeSbgn(model());
  assert.equal(
    lineWith(ours, '<glyph class="compartment"'),
    '        <glyph class="compartment" id="compartmentVertex_1_1" compartmentOrder="10.0">'
  );
  assert.equal(
    lineWith(ours, 'w="48.0"'),
    '                <bbox w="48.0" h="24.0" x="228.5" y="570.25"/>'
  );
  assert.equal(
    lineWith(ours, '<arc class="consumption"'),
    '        <arc class="consumption" id="arc_2_input_7" source="entityVertex_2_2" target="reactionVertex_7.1">'
  );
  assert.ok(
    ours.startsWith(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sbgn xmlns="http://sbgn.org/libsbgn/0.2">\n'
    )
  );
  assert.ok(ours.endsWith('    </map>\n</sbgn>\n'));
});

test('an empty map is self-closed, as libSBGN writes it', () => {
  // libSBGN's writer, on a Map with no glyphs and no arcs (same program, same day)
  assert.equal(
    writeSbgn({ language: 'process description', glyphs: [], arcs: [] }),
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<sbgn xmlns="http://sbgn.org/libsbgn/0.2">\n' +
      '    <map language="process description"/>\n' +
      '</sbgn>\n'
  );
});

test('a label XML 1.0 cannot hold is refused (JAXB writes it into a file no parser reads)', () => {
  for (const [text, code] of [
    ['a\u0001b', '0001'],
    ['a￾b', 'FFFE'],
    ['a\uD800b', 'D800'],
  ] as const) {
    const doc = model();
    const glyphs = doc.glyphs.map((g) =>
      g.id === 'entityVertex_6_6' ? { ...g, label: { text } } : g
    );
    assert.throws(
      () => writeSbgn({ ...doc, glyphs }),
      (error: unknown) =>
        error instanceof SbgnLayoutError &&
        error.message.startsWith('SBGN-ML, the label of entityVertex_6_6:') &&
        error.message.endsWith(`(U+${code})`),
      code
    );
  }
  // a pair of surrogates, a tab, U+007F and U+2028 are XML, and are written as they are
  const doc = model();
  const glyphs = doc.glyphs.map((g) =>
    g.id === 'entityVertex_6_6' ? { ...g, label: { text: '😀\t\u007F ' } } : g
  );
  assert.ok(writeSbgn({ ...doc, glyphs }).includes('<label text="😀\t\u007F "/>'));
});
