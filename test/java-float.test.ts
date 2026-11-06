import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { type Float32, float32, floatFromBits, isFloat32, javaFloat } from '../src/java-float.ts';

/** JDK 11's text for a float given as a decimal, rounded to float as `floatValue()` does. */
function java(value: number): string {
  return javaFloat(float32(value));
}

test('NaN, the infinities and the zeros', () => {
  assert.equal(java(Number.NaN), 'NaN');
  assert.equal(javaFloat(floatFromBits(0x7f800001)), 'NaN');
  assert.equal(javaFloat(floatFromBits(0xffc00000)), 'NaN');
  assert.equal(java(Infinity), 'Infinity');
  assert.equal(java(-Infinity), '-Infinity');
  assert.equal(java(3.5e38), 'Infinity');
  assert.equal(java(0), '0.0');
  assert.equal(java(-0), '-0.0');
});

test('plain from 10^-3 up to 10^7, computerized scientific outside', () => {
  assert.equal(java(48), '48.0');
  assert.equal(java(228.5), '228.5');
  assert.equal(java(-228.5), '-228.5');
  assert.equal(java(100), '100.0');
  assert.equal(java(0.1), '0.1');
  assert.equal(java(0.001), '0.001');
  assert.equal(java(0.00099999), '9.9999E-4');
  assert.equal(java(1e-4), '1.0E-4');
  assert.equal(java(9999999), '9999999.0');
  assert.equal(java(1e7), '1.0E7');
  assert.equal(java(-1e7), '-1.0E7');
  assert.equal(java(123456.79), '123456.79');
  assert.equal(java(3.4028235e38), '3.4028235E38');
});

test('a float that is not the double it came from is written as the float', () => {
  // research R4: digits such as 1234.5677 where the float is not the double.
  assert.equal(java(1234.5678), '1234.5677');
  assert.equal(java(8.5e9), '8.4999997E9');
});

test('where JDK 11 does not write the shortest form', () => {
  // An integer above 2^24, rounded to fewer digits than it has, but not the fewest:
  // 3.0E10 reads back as the same float.
  assert.equal(java(3e10), '3.0000001E10');
  // A larger one, from the long digits: 2.8037546E13 reads back as the same float.
  assert.equal(java(2.8037546e13), '2.80375465E13');
  assert.equal(java(1.0000002e17), '1.00000024E17');
  // Scientific form always takes a second digit, a real one where there is one:
  // 1.0E-45 reads back as the same float.
  assert.equal(java(1e-45), '1.4E-45');
  assert.equal(javaFloat(floatFromBits(0x00000003)), '4.2E-45');
  // The smallest normal float: 1.1754944E-38 reads back as the same float.
  assert.equal(javaFloat(floatFromBits(0x00800000)), '1.17549435E-38');
});

test('every float of the fixture is written as JDK 11 writes it', () => {
  const text = readFileSync(new URL('../fixtures/java-float/jdk11.txt', import.meta.url), 'utf8');
  let compared = 0;
  let nonShortest = 0;
  const wrong: string[] = [];
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const [hex = '', expected = '', flag = ''] = line.split(' ');
    assert.match(hex, /^[0-9a-f]{8}$/, line);
    assert.match(flag, /^[01]$/, line);
    const actual = javaFloat(floatFromBits(Number.parseInt(hex, 16)));
    if (actual !== expected) wrong.push(`${hex}: ${actual}, JDK 11 ${expected}`);
    compared++;
    if (flag === '1') nonShortest++;
  }
  assert.deepEqual(wrong.slice(0, 20), [], `${String(wrong.length)} of ${String(compared)} differ`);
  // The fixture is what it says it is: thousands of floats, over a thousand of them
  // written by JDK 11 in more digits than needed.
  assert.ok(compared > 5000, String(compared));
  assert.ok(nonShortest > 1000, String(nonShortest));
});

test('a number that is not a float is refused, not rounded', () => {
  assert.equal(isFloat32(0.1), false);
  assert.equal(isFloat32(Math.fround(0.1)), true);
  assert.equal(isFloat32(Number.NaN), true);
  assert.equal(isFloat32(-0), true);
  assert.throws(() => javaFloat(0.1 as Float32), /not a float/);
  assert.throws(() => javaFloat(1e39 as Float32), /not a float/);
});

test('float32 rounds as floatValue() does; floatFromBits reads the bits', () => {
  assert.equal(float32(0.1), Math.fround(0.1));
  assert.equal(float32(1e39), Infinity);
  assert.ok(Object.is(float32(-0), -0));
  assert.equal(floatFromBits(0x3f800000), 1);
  assert.equal(floatFromBits(0xbf800000), -1);
  assert.equal(floatFromBits(0x00000001), 2 ** -149);
  assert.throws(() => floatFromBits(2 ** 32), RangeError);
  assert.throws(() => floatFromBits(-1), RangeError);
  assert.throws(() => floatFromBits(1.5), RangeError);
});
