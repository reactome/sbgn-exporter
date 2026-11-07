/**
 * Every fixture's output, written to a folder for ci/validate.sh (spec 001 T019): each
 * diagram layout under fixtures/ that the exporter converts, converted by `toSbgn`, and the
 * hand-made document model of fixtures/write/, written by `writeSbgn`.
 *
 *     node ci/fixture-output.ts FOLDER
 *
 * The layouts are named here, folder by folder, so that a fixture added to one of these
 * folders is validated without a change here, and one moved elsewhere is not silently
 * dropped: every file written is listed, and a fixture that fails to convert fails the run.
 * fixtures/geometry/arcs.json and order.json are left out: they hold what Java throws on.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSbgn } from '../src/index.ts';
import { readLayout } from '../src/layout.ts';
import type { SbgnDocument } from '../src/model.ts';
import { writeSbgn } from '../src/write.ts';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** Every layout file converted: whole folders, and single files. */
export const LAYOUTS: readonly string[] = [
  ...['layouts', 'read-layout'].flatMap((folder) =>
    readdirSync(join(root, folder))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => `${folder}/${name}`)
  ),
  'convert/classes.json',
  'geometry/ports.json',
];

/** The document model written as it is. */
export const MODELS: readonly string[] = ['write/model.json'];

/** Writes every fixture's output into `folder`, and returns the files written. */
export function writeFixtureOutput(folder: string): string[] {
  mkdirSync(folder, { recursive: true });
  const written: string[] = [];
  const out = (fixture: string, sbgn: string): void => {
    const name = `${fixture.replace(/\.json$/, '').replaceAll('/', '-')}.sbgn`;
    writeFileSync(join(folder, name), sbgn);
    written.push(name);
  };
  for (const fixture of LAYOUTS) {
    const layout: unknown = JSON.parse(readFileSync(join(root, fixture), 'utf8'));
    out(fixture, toSbgn(readLayout(layout)));
  }
  for (const fixture of MODELS) {
    // A model as test/write.test.ts reads it: each number cast to float, as Java's harness
    // casts it.
    const floats = (_key: string, value: unknown): unknown =>
      typeof value === 'number' ? Math.fround(value) : value;
    const model = JSON.parse(readFileSync(join(root, fixture), 'utf8'), floats) as SbgnDocument;
    out(fixture, writeSbgn(model));
  }
  return written;
}

if (import.meta.main) {
  const [folder] = process.argv.slice(2);
  if (folder === undefined) {
    process.stderr.write('Usage: node ci/fixture-output.ts FOLDER\n');
    process.exitCode = 2;
  } else {
    for (const name of writeFixtureOutput(folder)) process.stdout.write(`${name}\n`);
  }
}
