// typescript-eslint's strict, type-checked rules over the TypeScript.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', '.specify/', 'specs/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A field left out of an object by destructuring the rest is not a mistake.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // Node runs the TypeScript as it is: a relative import must name its .ts file, and
      // one naming .js passes the type check but fails at run time.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ':matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration, ImportExpression)[source.value=/^\\.{1,2}\\/.*\\.js$/]',
          message: 'Import the .ts file: Node runs the TypeScript as it is.',
        },
      ],
      // node:test's test() and describe() return promises the runner awaits itself.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['test', 'describe', 'it'] },
          ],
        },
      ],
    },
  },
  // The types used as fully as possible. The library takes no type on trust: what it
  // reads arrives as `unknown` and is checked into its type, so `src/` has no `as` at
  // all, and every exported function says what it returns. Scripts and tests may
  // assert a type they have just parsed, never invent an object's type.
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
    },
  },
  {
    files: ['ci/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
    },
  },
  { files: ['eslint.config.js'], ...tseslint.configs.disableTypeChecked }
);
