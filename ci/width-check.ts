/**
 * The width table checked against Java's own answers (spec 001 T033, plan's risks): every
 * label box in a folder of Java's SBGN-ML files is measured again with the table
 * (`src/text-width.ts`) and its width compared with Java's, as the string written. No
 * width difference is declared here (no D4): any is reported.
 *
 *     node ci/width-check.ts <folder> [--json]
 *
 * A label box is a box whose width Java measures from a label's text: a label's own bbox
 * (Java gives one only to a compartment's name), and a unit of information's bbox, whose
 * width is its label's. Child glyphs and arcs' glyphs are walked too. Run by hand over the
 * content service's answers, never in CI. Exit status: 0 if every width is the table's, 1
 * if any is not or the table refuses a label, 2 for a folder that cannot be read or holds
 * no `.sbgn` file.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { float32, javaFloat } from '../src/java-float.ts';
import { textWidth } from '../src/text-width.ts';
import { readSbgn } from './compare.ts';

type Glyph = ReturnType<typeof readSbgn>['glyphs'][number];

export interface Box {
  readonly file: string;
  readonly id: string;
  /** The glyph's class. */
  readonly class: string;
  /** `label` for a label's own bbox, `glyph` for a unit of information's. */
  readonly box: 'label' | 'glyph';
  readonly text: string;
  /** Java's width, as written. */
  readonly java: string;
  /** The table's, as Java would write it, or why the table refuses the text. */
  readonly table: string;
}

export interface Report {
  readonly files: number;
  readonly boxes: number;
  /** Distinct label texts among the boxes. */
  readonly texts: number;
  readonly differences: readonly Box[];
}

/** The width the table gives a text, written as Java writes a float, or the refusal. */
export function tableWidth(text: string): string {
  try {
    return javaFloat(float32(textWidth(text)));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Whether Java's width is not the table's: compared as the strings written (`11` is not `11.0`). */
export function differs(box: Box): boolean {
  return box.java !== box.table;
}

function boxesOf(glyph: Glyph, file: string, into: Box[]): void {
  const cls = glyph.attributes['class'] ?? '';
  const text = glyph.label?.text;
  const labelBox = glyph.label?.bbox;
  if (labelBox !== undefined) {
    // A label's own box with no text or no width is reported, not passed over.
    const t = text ?? '';
    into.push({
      file,
      id: glyph.id,
      class: cls,
      box: 'label',
      text: t,
      java: labelBox['w'] ?? '(none)',
      table: tableWidth(t),
    });
  }
  if (cls === 'unit of information') {
    const t = text ?? '';
    into.push({
      file,
      id: glyph.id,
      class: cls,
      box: 'glyph',
      text: t,
      java: glyph.bbox?.['w'] ?? '(none)',
      table: tableWidth(t),
    });
  }
  for (const child of glyph.glyphs) boxesOf(child, file, into);
}

/** Every label box of one document. */
export function boxesOfDocument(text: string, file: string): Box[] {
  const document = readSbgn(text, file);
  const boxes: Box[] = [];
  for (const glyph of document.glyphs) boxesOf(glyph, file, boxes);
  for (const arc of document.arcs) for (const glyph of arc.glyphs) boxesOf(glyph, file, boxes);
  return boxes;
}

/** Every `.sbgn` file of a folder, checked. */
export function checkFolder(folder: string): Report {
  const names = readdirSync(folder)
    .filter((name) => name.endsWith('.sbgn'))
    .sort();
  const boxes: Box[] = [];
  for (const name of names) {
    boxes.push(...boxesOfDocument(readFileSync(join(folder, name), 'utf8'), name));
  }
  return {
    files: names.length,
    boxes: boxes.length,
    texts: new Set(boxes.map((b) => b.text)).size,
    differences: boxes.filter(differs),
  };
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
    err('Usage: node ci/width-check.ts <folder> [--json]\n');
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
      `${String(report.files)} files, ${String(report.boxes)} label boxes (${String(report.texts)} distinct labels), ${String(report.differences.length)} differing from the table\n`
    );
    for (const d of report.differences.slice(0, 50)) {
      out(`${d.file} ${d.id} (${d.class}, ${d.box} box): Java ${d.java}, the table ${d.table}\n`);
    }
  }
  return report.differences.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
