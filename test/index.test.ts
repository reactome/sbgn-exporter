// The library's contract (spec 001 T011, contracts/library.md): what src/index.ts
// exports, toSbgn from layout JSON to bytes, and that importing it loads the library's own
// modules and nothing else (no package, so none of the command line's or the comparison's
// dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as library from '../src/index.ts';
import { SbgnLayoutError as LayoutError } from '../src/layout.ts';
import { loads } from './loads.ts';

function fixture(path: string): string {
  return readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');
}

test('the entry point exports the contract, and nothing else', () => {
  assert.deepEqual(Object.keys(library).sort(), [
    'SBGN_LANGUAGE',
    'SBGN_MEDIA_TYPE',
    'SBGN_NAMESPACE',
    'SbgnLayoutError',
    'sbgnFileName',
    'toSbgn',
  ]);
  assert.equal(library.SBGN_MEDIA_TYPE, 'application/sbgn+xml;charset=UTF-8');
  assert.equal(library.SbgnLayoutError, LayoutError);
  assert.equal(library.sbgnFileName('R-HSA-69615'), 'R-HSA-69615.sbgn');
});

// The expected files are libSBGN 0.2's own output for Java's conversion of these layouts,
// put in the fixed order (D1, D3): see test/write.test.ts.
for (const [name, path] of [
  ['disease', 'read-layout/disease.json'],
  ['ports', 'geometry/ports.json'],
] as const) {
  test(`${name}: layout JSON in, Java's file out`, () => {
    const layout = JSON.parse(fixture(path)) as library.DiagramLayout;
    const sbgn = library.toSbgn(layout);
    assert.ok(
      Buffer.from(sbgn, 'utf8').equals(
        readFileSync(new URL(`../fixtures/write/java/${name}.sbgn`, import.meta.url))
      )
    );
    // the same layout, the same text
    assert.equal(library.toSbgn(layout), sbgn);
  });
}

test('a layout of the wrong shape is refused with SbgnLayoutError, the type unchecked', () => {
  const layout = JSON.parse(
    '{"stableId": "R-HSA-1", "compartments": [], "nodes": {}, "edges": []}'
  ) as library.DiagramLayout;
  assert.throws(() => library.toSbgn(layout), library.SbgnLayoutError);
});

test("importing the entry point loads the library's own modules only", () => {
  const src = new URL('../src/', import.meta.url).href;
  const loaded = loads(new URL('../src/index.ts', import.meta.url).href);
  assert.deepEqual(
    loaded.map((url) => (url.startsWith(src) ? url.slice(src.length) : url)).sort(),
    [
      'convert.ts',
      'geometry.ts',
      'index.ts',
      'java-float.ts',
      'layout.ts',
      'sbgn.ts',
      'text-width.ts',
      'text-widths.json',
      'write.ts',
    ]
  );
});
