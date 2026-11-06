// The label widths (spec 001 T006, research R5, D4): what Java 11's
// `new Canvas().getFontMetrics(new Font("Arial", Font.PLAIN, 16)).stringWidth(text)`
// answers, from the table ci/reference/widths/Widths.java took from Java. The expected
// widths below are Java's own answers for these strings, by the same call, on the host
// that made the table (6 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWidthTable, textWidth, WIDTH_TABLE } from '../src/text-width.ts';
import json from '../src/text-widths.json' with { type: 'json' };

test("a string measures what Java's font metrics give for Arial plain 16", () => {
  const java: [string, number][] = [
    ['', 0],
    ['P', 11],
    ['mt:prot', 48],
    ['cytosol', 48],
    ['nucleoplasm', 87],
    ['endoplasmic reticulum membrane', 234],
    ['1,6-bisP', 59],
    ['Ser-473', 57],
    ['$', 9],
    // Greek and accented Latin, drawn by Arial
    ['α-helix', 45],
    ['β2', 18],
    ['Ψ', 11],
    ['café', 30],
    // a tab, which Arial draws with no width
    ['x\ty', 14],
  ];
  for (const [text, width] of java) assert.equal(textWidth(text), width, JSON.stringify(text));
});

test("a character Arial cannot draw measures the missing glyph's width", () => {
  assert.equal(WIDTH_TABLE.missing, 12);
  assert.equal(textWidth('一'), 12);
  assert.equal(textWidth('a一b'), 30);
});

test('text Java measures as a whole, with a layout, is refused rather than guessed', () => {
  // A combining mark, a Hebrew letter, a joiner and a character outside the BMP
  // (surrogates): Java's stringWidth lays each such string out whole, where widths can
  // depend on neighbours, so a sum of the table's widths is not Java's answer.
  for (const text of ['e\u0301', 'a\u05D0', 'a\u200Db', 'ab\u{1D400}']) {
    assert.throws(() => textWidth(text), RangeError, JSON.stringify(text));
  }
});

test('the table is read and checked: its fields, widths and ranges', () => {
  assert.equal(WIDTH_TABLE.font, 'Arial');
  assert.equal(WIDTH_TABLE.style, 'plain');
  assert.equal(WIDTH_TABLE.size, 16);
  // Surrogates are never measured alone: Java lays out a string holding one whole.
  assert.ok(WIDTH_TABLE.whole.some(([first, last]) => first === 0xd800 && last === 0xdfff));

  const planted: [string, unknown][] = [
    ['not an object', [1, 2]],
    ['another font', { ...json, font: 'Liberation Sans' }],
    ['bold', { ...json, style: 'bold' }],
    ['another size', { ...json, size: 8 }],
    ['no Java version', { ...json, java: undefined }],
    ['a fractional missing width', { ...json, missing: 12.5 }],
    ['no runs', { ...json, runs: undefined }],
    ['a run of two numbers', { ...json, runs: [[65, 65]] }],
    ['a run beyond the code units', { ...json, runs: [[65, 0x10000, 11]] }],
    ['a run backwards', { ...json, runs: [[66, 65, 11]] }],
    ['a width as large as the marker', { ...json, runs: [[65, 65, 255]] }],
    ['overlapping runs', { ...json, runs: [...json.runs, [65, 65, 11]] }],
    ['a run inside a whole range', { ...json, runs: [...json.runs, [0x0301, 0x0301, 0]] }],
    ['a whole range of three numbers', { ...json, whole: [[1, 2, 3]] }],
  ];
  for (const [what, table] of planted) assert.throws(() => readWidthTable(table), TypeError, what);
  assert.deepEqual(readWidthTable(json), WIDTH_TABLE);
});
