#!/usr/bin/env node
// The licence check (spec 001 T002, constitution VII): every installed package,
// development ones included, under a licence on the allowlist. It lists every offender,
// not only the first. Taken from reactome/pdf-export's ci/licences.ts, less its fonts.
//
//   node ci/licences.ts                 checks what `npm query '*'` reports
//   node ci/licences.ts --query FILE    checks a saved `npm query '*'` answer instead

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Licences any dependency may have: loose, and none of the GPL family. */
export const ALLOWED: ReadonlySet<string> = new Set([
  'MIT',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'Zlib',
  // Blue Oak Model License: permissive, like MIT (minimatch, which ESLint brings, uses it).
  'BlueOak-1.0.0',
]);

/** A package as `npm query` reports it, as far as this check needs. */
export interface Installed {
  name?: string;
  version?: string;
  license?: unknown;
  /** Relative to the project; the root package's is empty. */
  location?: string;
}

export interface Offender {
  name: string;
  version: string;
  license: string | null;
  reason: string;
}

/** The SPDX expression a package declares: a string, or the old `{ type }` and list forms. */
export function declared(license: unknown): string | null {
  if (typeof license === 'string') return license.trim() || null;
  if (Array.isArray(license)) {
    const types = license.map((item) => declared(item)).filter((t): t is string => t !== null);
    return types.length ? types.join(' OR ') : null;
  }
  if (license && typeof license === 'object' && 'type' in license) {
    return declared(license.type);
  }
  return null;
}

/**
 * Whether an SPDX expression is allowed: `A OR B` when either is, `A AND B` when both
 * are, `A WITH exception` as A, parentheses as grouping. An unparseable one is not.
 */
export function allowed(expression: string, allow: ReadonlySet<string> = ALLOWED): boolean {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let at = 0;
  const peek = (): string | undefined => tokens[at];
  const next = (): string | undefined => tokens[at++];

  function term(): boolean {
    const token = next();
    if (token === undefined) throw new Error('unexpected end');
    let value: boolean;
    if (token === '(') {
      value = or();
      if (next() !== ')') throw new Error('unclosed parenthesis');
    } else if (token === ')' || /^(AND|OR|WITH)$/i.test(token)) {
      throw new Error(`unexpected ${token}`);
    } else {
      value = allow.has(token.replace(/\+$/, ''));
    }
    if (peek()?.toUpperCase() === 'WITH') {
      next();
      if (next() === undefined) throw new Error('WITH needs an exception');
    }
    return value;
  }
  function and(): boolean {
    let value = term();
    while (peek()?.toUpperCase() === 'AND') {
      next();
      value = term() && value;
    }
    return value;
  }
  function or(): boolean {
    let value = and();
    while (peek()?.toUpperCase() === 'OR') {
      next();
      value = and() || value;
    }
    return value;
  }

  try {
    const value = or();
    return at === tokens.length && value;
  } catch {
    return false;
  }
}

/** Every installed package whose licence is not allowed. */
export function offenders(
  packages: readonly Installed[],
  allow: ReadonlySet<string> = ALLOWED
): Offender[] {
  const found: Offender[] = [];
  for (const pkg of packages) {
    const name = pkg.name ?? '(unnamed)';
    const version = pkg.version ?? '';
    const license = declared(pkg.license);
    if (license === null) {
      found.push({ name, version, license, reason: 'declares no licence' });
    } else if (!allowed(license, allow)) {
      found.push({ name, version, license, reason: 'not on the allowlist' });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/** The installed packages, from `npm query '*'` or a saved answer; the root is left out. */
export function installed(root: string, queryFile?: string): Installed[] {
  const text = queryFile
    ? readFileSync(queryFile, 'utf8')
    : execFileSync('npm', ['query', '*'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
  const all = JSON.parse(text) as Installed[];
  return all.filter((pkg) => pkg.location !== '');
}

function main(args: readonly string[]): number {
  const at = args.indexOf('--query');
  const queryFile = at === -1 ? undefined : args[at + 1];
  if (at !== -1 && (queryFile === undefined || queryFile.startsWith('-'))) {
    process.stderr.write('--query needs the file of a saved `npm query` answer\n');
    return 2;
  }
  // The project's root, wherever the check is run from: this file is in its ci/ folder
  const root = fileURLToPath(new URL('..', import.meta.url));
  const packages = installed(root, queryFile);
  const problems = offenders(packages);
  for (const { name, version, license, reason } of problems) {
    process.stderr.write(`${name}@${version}: ${license ?? '(none)'}: ${reason}\n`);
  }
  process.stdout.write(
    `${String(packages.length)} packages checked, ${String(problems.length)} offending\n`
  );
  return problems.length ? 1 : 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
