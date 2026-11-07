// What importing a module loads: every module Node resolves while importing it, recorded
// by a resolve hook in a fresh Node process, so nothing this test runner has loaded counts.
import { execFileSync } from 'node:child_process';

const PROGRAM = `
import { registerHooks } from 'node:module';
const seen = [];
registerHooks({
  resolve(specifier, context, next) {
    const resolved = next(specifier, context);
    seen.push(resolved.url);
    return resolved;
  },
});
await import(process.argv[1]);
process.stdout.write(JSON.stringify(seen));
`;

/** The URLs of every module importing `entry` (a file URL) resolves, in order, once each. */
export function loads(entry: string): string[] {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', PROGRAM, entry], {
    encoding: 'utf8',
  });
  return [...new Set(JSON.parse(out) as string[])];
}
