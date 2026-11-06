import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SBGN_LANGUAGE, SBGN_NAMESPACE, sbgnFileName } from '../src/sbgn.ts';

test('the namespace and language are those Java writes today', () => {
  assert.equal(SBGN_NAMESPACE, 'http://sbgn.org/libsbgn/0.2');
  assert.equal(SBGN_LANGUAGE, 'process description');
});

test('a file is named after its stable identifier', () => {
  assert.equal(sbgnFileName('R-HSA-69620'), 'R-HSA-69620.sbgn');
});

test('a value that is not a stable identifier is refused', () => {
  assert.throws(() => sbgnFileName('69620'), /Not a Reactome stable identifier/);
  assert.throws(() => sbgnFileName('R-HSA-69620/../x'), /Not a Reactome stable identifier/);
});
