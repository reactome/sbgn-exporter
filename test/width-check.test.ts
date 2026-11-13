// The width check (spec 001 T033): every label box of Java's answers measured again with
// the table. Run by hand over the content service's answers (its counts are in tasks.md);
// here, on Java's answers for the fixtures and on planted widths the table does not give.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boxesOfDocument, checkFolder, differs, main, tableWidth } from '../ci/width-check.ts';

const doc = (compartmentW: string, unitW: string, unitText = 'P'): string =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<sbgn xmlns="http://sbgn.org/libsbgn/0.2">\n' +
  '    <map language="process description">\n' +
  '        <glyph class="compartment" id="c" compartmentOrder="10.0">\n' +
  '            <label text="cytosol">\n' +
  `                <bbox w="${compartmentW}" h="24.0" x="10.0" y="470.0"/>\n` +
  '            </label>\n' +
  '            <bbox w="400.0" h="300.0" x="0.0" y="0.0"/>\n' +
  '        </glyph>\n' +
  '        <glyph class="macromolecule" id="m">\n' +
  '            <label text="a protein whose box is not measured"/>\n' +
  '            <bbox w="999.0" h="40.0" x="100.0" y="100.0"/>\n' +
  '            <glyph class="unit of information" id="u">\n' +
  `                <label text="${unitText}"/>\n` +
  `                <bbox w="${unitW}" h="16.0" x="175.0" y="285.0"/>\n` +
  '            </glyph>\n' +
  '        </glyph>\n' +
  '    </map>\n' +
  '</sbgn>\n';

test("the table's width is written as Java writes it", () => {
  assert.equal(tableWidth('cytosol'), '48.0');
  assert.equal(tableWidth('P'), '11.0');
  assert.match(tableWidth('e\u0301'), /layout of the whole text/);
});

test("a compartment's label box and a unit of information's box are counted, and only those", () => {
  const boxes = boxesOfDocument(doc('48.0', '11.0'), 'ok.sbgn');
  assert.deepEqual(
    boxes.map((b) => [b.id, b.box, b.java, b.table]),
    [
      ['c', 'label', '48.0', '48.0'],
      ['u', 'glyph', '11.0', '11.0'],
    ]
  );
});

test("Java's answers for the fixtures, measured with Arial, are the table's", () => {
  const report = checkFolder('fixtures/java');
  assert.ok(report.boxes > 10, `only ${String(report.boxes)} boxes`);
  assert.deepEqual(report.differences, []);
});

test('a width the table does not give, or a label it refuses, is reported', () => {
  const planted = boxesOfDocument(doc('56.0', '11'), 'p.sbgn').filter(differs);
  // the bulk file's width for "cytosol" (D4 is not declared here), and `11` for `11.0`
  assert.deepEqual(
    planted.map((b) => [b.id, b.java, b.table]),
    [
      ['c', '56.0', '48.0'],
      ['u', '11', '11.0'],
    ]
  );
  const refused = boxesOfDocument(doc('48.0', '18.0', 'e\u0301'), 'r.sbgn');
  assert.equal(refused.filter(differs).length, 1);
});

test('the command line: 0 when every width is the table, 1 when one is not, 2 for no files', (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'width-check-'));
  t.after(() => {
    rmSync(folder, { recursive: true, force: true });
  });
  const out: string[] = [];
  const quiet = (): void => undefined;
  assert.equal(main([folder], quiet, quiet), 2);
  writeFileSync(join(folder, 'a.sbgn'), doc('48.0', '11.0'));
  assert.equal(
    main([folder], (s) => out.push(s), quiet),
    0
  );
  assert.match(out.join(''), /1 files, 2 label boxes \(2 distinct labels\), 0 differing/);
  writeFileSync(join(folder, 'b.sbgn'), doc('48.0', '10.0'));
  out.length = 0;
  assert.equal(
    main([folder], (s) => out.push(s), quiet),
    1
  );
  assert.match(
    out.join(''),
    /b\.sbgn u \(unit of information, glyph box\): Java 10\.0, the table 11\.0/
  );
});
