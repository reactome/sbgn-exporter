// The float check (spec 001 T005): every number of Java's files re-derived from its text.
// Run by hand over a release's files (its counts are in tasks.md); here, on documents with
// numbers that do come back and planted ones that do not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocument, main, rewritten } from '../ci/float-check.ts';

const doc = (bbox: string, extra = ''): string =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<sbgn xmlns="http://sbgn.org/libsbgn/0.2">\n' +
  '    <map language="process description">\n' +
  `        <glyph class="compartment" id="c" compartmentOrder="10.0">\n` +
  `            <label text="x=&quot;48&quot; w=1"/>\n` +
  `            <bbox ${bbox}/>\n` +
  `            <port id="p" x="96.0" y="106.0"/>\n` +
  '        </glyph>\n' +
  `        <arc class="consumption" id="a" source="c" target="p"><start x="1.0" y="2.0"/><next x="3.5" y="4.25"/><end x="5.0" y="6.0"/>${extra}</arc>\n` +
  '    </map>\n' +
  '</sbgn>\n';

test("a number comes back as JDK 11's Float.toString writes it", () => {
  assert.equal(rewritten('48.0'), '48.0');
  // a float that is not the decimal it was written from: Java writes the float's digits
  assert.equal(rewritten('1234.5677'), '1234.5677');
  assert.equal(rewritten('1234.5678'), '1234.5677');
  // JDK 11's non-shortest form, and E notation
  assert.equal(rewritten('3.0000001E10'), '3.0000001E10');
  assert.equal(rewritten('3.0E10'), '3.0000001E10');
  assert.equal(rewritten('1.0E-5'), '1.0E-5');
  assert.equal(rewritten('-0.0'), '-0.0');
  // JAXB's infinities, and a number past the float range
  assert.equal(rewritten('INF'), 'INF');
  assert.equal(rewritten('-INF'), '-INF');
  assert.equal(rewritten('1e39'), 'INF');
});

test('every float attribute is counted, and only those', () => {
  const ok = checkDocument(doc('w="48.0" h="24.0" x="228.5" y="570.25"'), 'ok.sbgn');
  // compartmentOrder, a bbox's four, a port's two, three points' two each; the label's
  // text is no number, though it reads like one
  assert.equal(ok.numbers, 1 + 4 + 2 + 6);
  assert.deepEqual(ok.mismatches, []);
});

test('a number Java would not have written is reported, with what it would have been', () => {
  const planted = checkDocument(doc('w="48" h="24.0" x="1234.5678" y="3.0E10"'), 'p.sbgn');
  assert.deepEqual(
    planted.mismatches.map((m) => [m.element, m.attribute, m.text, m.rewritten]),
    [
      ['bbox', 'x', '1234.5678', '1234.5677'],
      ['bbox', 'y', '3.0E10', '3.0000001E10'],
      ['bbox', 'w', '48', '48.0'],
    ]
  );
});

test('the command line: 0 when all come back, 1 when one does not, 2 for no files', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sbgn-floats-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  writeFileSync(join(dir, 'R-HSA-1.sbgn'), doc('w="48.0" h="24.0" x="0.0" y="1.0E-5"'));
  let out = '';
  assert.equal(
    main(
      [dir],
      (text) => (out += text),
      () => undefined
    ),
    0
  );
  assert.equal(out, '1 files, 13 numbers, 0 not written again identically\n');
  writeFileSync(join(dir, 'R-HSA-2.sbgn'), doc('w="48" h="24.0" x="0.0" y="0.0"'));
  out = '';
  assert.equal(
    main(
      [dir],
      (text) => (out += text),
      () => undefined
    ),
    1
  );
  assert.match(
    out,
    /^2 files, 26 numbers, 1 not written again identically\nR-HSA-2\.sbgn <bbox w="48"> written again as 48\.0\n$/
  );
  const empty = mkdtempSync(join(tmpdir(), 'sbgn-floats-'));
  t.after(() => {
    rmSync(empty, { recursive: true, force: true });
  });
  assert.equal(
    main(
      [empty],
      () => undefined,
      () => undefined
    ),
    2
  );
  assert.equal(
    main(
      [],
      () => undefined,
      () => undefined
    ),
    2
  );
});
