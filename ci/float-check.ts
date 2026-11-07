/**
 * Every number in a folder of Java's SBGN-ML files, re-derived from its own text (spec 001
 * T005, research R4): read as a number, rounded to a float (`Math.fround`, as Java held
 * it), and written again as JDK 11's `Float.toString` writes it (`java-float.ts`), or as
 * JAXB writes an infinity (`INF`, `-INF`). Any that does not come back as the same text is
 * reported: the writer could not reproduce Java's bytes for it.
 *
 *     node ci/float-check.ts <folder> [--json]
 *
 * The numbers are the attributes Java writes floats into: a bbox's `x`, `y`, `w`, `h`; a
 * port's and a point's `x`, `y`; a glyph's `compartmentOrder`. Run by hand over a
 * release's bulk files, never in CI. Exit status: 0 if every number comes back, 1 if any
 * does not, 2 for a folder that cannot be read.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SaxesParser } from 'saxes';
import { float32, javaFloat } from '../src/java-float.ts';

/** The elements and attributes Java writes a float into. */
const FLOATS: Readonly<Record<string, readonly string[]>> = {
  bbox: ['x', 'y', 'w', 'h'],
  port: ['x', 'y'],
  start: ['x', 'y'],
  next: ['x', 'y'],
  end: ['x', 'y'],
  glyph: ['compartmentOrder'],
};

/** A number's text as Java writes it again, from the float it reads as. */
export function rewritten(text: string): string {
  if (text === 'INF') return 'INF';
  if (text === '-INF') return '-INF';
  const value = float32(Number(text));
  if (value === Infinity) return 'INF';
  if (value === -Infinity) return '-INF';
  return javaFloat(value);
}

export interface Mismatch {
  readonly file: string;
  readonly element: string;
  readonly attribute: string;
  readonly text: string;
  readonly rewritten: string;
}

export interface Report {
  readonly files: number;
  readonly numbers: number;
  readonly mismatches: readonly Mismatch[];
}

/** Every float attribute of one document, checked. */
export function checkDocument(
  text: string,
  file: string
): { numbers: number; mismatches: Mismatch[] } {
  const mismatches: Mismatch[] = [];
  let numbers = 0;
  const parser = new SaxesParser({ xmlns: false });
  parser.on('opentag', (tag) => {
    for (const attribute of FLOATS[tag.name] ?? []) {
      const value: unknown = tag.attributes[attribute];
      if (typeof value !== 'string') continue;
      numbers++;
      const again = rewritten(value);
      if (again !== value)
        mismatches.push({ file, element: tag.name, attribute, text: value, rewritten: again });
    }
  });
  parser.write(text).close();
  return { numbers, mismatches };
}

/** Every `.sbgn` file of a folder, checked. */
export function checkFolder(folder: string): Report {
  const names = readdirSync(folder)
    .filter((name) => name.endsWith('.sbgn'))
    .sort();
  let numbers = 0;
  const mismatches: Mismatch[] = [];
  for (const name of names) {
    const result = checkDocument(readFileSync(join(folder, name), 'utf8'), name);
    numbers += result.numbers;
    mismatches.push(...result.mismatches);
  }
  return { files: names.length, numbers, mismatches };
}

/** The command line: its exit status. */
export function main(
  args: readonly string[],
  out: (text: string) => void = (t) => process.stdout.write(t),
  err: (text: string) => void = (t) => process.stderr.write(t)
): number {
  const json = args.includes('--json');
  const folders = args.filter((arg) => arg !== '--json');
  const [folder] = folders;
  if (folders.length !== 1 || folder === undefined) {
    err('Usage: node ci/float-check.ts <folder> [--json]\n');
    return 2;
  }
  let report: Report;
  try {
    report = checkFolder(folder);
  } catch (error) {
    err(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  if (report.files === 0) {
    err(`No .sbgn file in ${folder}\n`);
    return 2;
  }
  if (json) out(`${JSON.stringify(report, null, 2)}\n`);
  else {
    out(
      `${String(report.files)} files, ${String(report.numbers)} numbers, ${String(report.mismatches.length)} not written again identically\n`
    );
    for (const m of report.mismatches.slice(0, 50)) {
      out(`${m.file} <${m.element} ${m.attribute}="${m.text}"> written again as ${m.rewritten}\n`);
    }
  }
  return report.mismatches.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
