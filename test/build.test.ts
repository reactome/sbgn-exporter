// The website's import (spec 001 T001): the build compiles src/ to JavaScript and
// declarations, emits its JSON tables beside them, and package.json's entry points name
// what it writes. The build runs fresh in a temporary folder, so a stale dist/ can
// neither hide a file the build no longer writes nor be overwritten by the tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as source from '../src/index.ts';
import { loads } from './loads.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

interface PackageJson {
  type: string;
  exports: { '.': { types: string; default: string } };
  types: string;
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJson;

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

/**
 * Builds a copy of the package with the repository's own build configuration, with a
 * JSON file planted in src/ (the text-width table is one, from T006), in `dir`.
 */
function build(dir: string): void {
  for (const name of ['package.json', 'tsconfig.json', 'tsconfig.build.json']) {
    cpSync(join(root, name), join(dir, name));
  }
  cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'planted.json'), '{ "A": 11, "é": 9.5 }\n');
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  execFileSync(process.execPath, [tsc, '-p', join(dir, 'tsconfig.build.json')], {
    encoding: 'utf8',
  });
}

test('the build writes JavaScript, declarations and the JSON tables to dist/', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sbgn-build-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  build(dir);
  const src = join(dir, 'src');
  const dist = join(dir, 'dist');

  const expected = files(src)
    .flatMap((name) =>
      name.endsWith('.ts')
        ? [name.replace(/\.ts$/, '.js'), name.replace(/\.ts$/, '.d.ts')]
        : name.endsWith('.json')
          ? [name]
          : []
    )
    .sort();
  assert.deepEqual(files(dist), expected);

  for (const name of files(src).filter((n) => n.endsWith('.json'))) {
    assert.deepEqual(
      JSON.parse(readFileSync(join(dist, name), 'utf8')),
      JSON.parse(readFileSync(join(src, name), 'utf8')),
      name
    );
  }

  await t.test("package.json's entry points name files the build writes", () => {
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.types, pkg.exports['.'].types);
    for (const entry of [pkg.exports['.'].default, pkg.exports['.'].types]) {
      assert.ok(files(dist).includes(relative('./dist', entry)), entry);
    }
  });

  await t.test('the built entry point loads under Node and exports what src/ does', async () => {
    const built = (await import(
      pathToFileURL(join(dir, pkg.exports['.'].default)).href
    )) as typeof source;
    assert.deepEqual(Object.keys(built).sort(), Object.keys(source).sort());
    assert.equal(built.sbgnFileName('R-HSA-69620'), source.sbgnFileName('R-HSA-69620'));
    // the whole conversion, built: Java's file for this layout (test/write.test.ts)
    const layout = JSON.parse(
      readFileSync(join(root, 'fixtures', 'read-layout', 'disease.json'), 'utf8')
    ) as source.DiagramLayout;
    assert.equal(
      built.toSbgn(layout),
      readFileSync(join(root, 'fixtures', 'write', 'java', 'disease.sbgn'), 'utf8')
    );
  });

  await t.test("the built entry point loads the build's own modules only", () => {
    const built = pathToFileURL(join(dir, 'dist')).href + '/';
    const loaded = loads(pathToFileURL(join(dir, pkg.exports['.'].default)).href);
    assert.ok(loaded.length > 1);
    for (const url of loaded) assert.ok(url.startsWith(built), url);
  });

  await t.test('the declarations import the declarations beside them', () => {
    // A declaration's `./x.ts` is resolved by TypeScript to the `x.d.ts` beside it, so
    // it is left as it is; what matters is that each one is there.
    for (const name of files(dist).filter((n) => n.endsWith('.d.ts'))) {
      const text = readFileSync(join(dist, name), 'utf8');
      for (const [, target] of text.matchAll(/from '(\.{1,2}\/[^']+)\.ts'/g)) {
        assert.ok(
          files(dist).includes(join(dirname(name), `${target ?? ''}.d.ts`)),
          `${name} imports ${target ?? ''}.ts`
        );
      }
    }
  });
});
