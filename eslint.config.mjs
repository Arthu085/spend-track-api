// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import { readdirSync } from 'node:fs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Module boundaries: another module is reachable only through its root entry
// points (index.ts, presentation.ts, persistence.ts, <name>.module.ts), never
// through its infrastructure/ or presentation/ folders. Domain and application
// code never import presentation code. Tests are exempt so they can build
// fixtures from other modules' internals. ORM entity files may import another
// module's ORM entity file directly for a relation, so their import graph never
// reaches a barrel (and the mappers and seeders it re-exports).
const modules = readdirSync(new URL('./src/modules', import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const testFiles = ['**/__tests__/**'];

const ormEntityFile = 'infrastructure/persistence/entities/[^/]+\\.orm-entity$';

const crossModuleImport = (
  otherModules,
  { allowOrmEntities = false } = {},
) => ({
  regex: `^(@modules/|(\\./|(\\.\\./)+)?(src/)?modules/|(\\.\\./)+)(${otherModules.join('|')})/${allowOrmEntities ? `(?!${ormEntityFile})` : ''}(infrastructure(/|$)|presentation/)`,
  message:
    'Import another module through its public entry points (index, presentation, persistence or *.module), not its infrastructure/ or presentation/ internals.',
});

const presentationImport = {
  regex: '(^|/)presentation(/|$)',
  message: 'Domain and application layers must not import presentation code.',
};

const restrictImports = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

const boundaryConfigs = [
  {
    files: ['src/**/*.ts'],
    ignores: ['src/modules/**', ...testFiles],
    rules: restrictImports([crossModuleImport(modules)]),
  },
  {
    files: ['src/shared/domain/**/*.ts', 'src/shared/application/**/*.ts'],
    ignores: testFiles,
    rules: restrictImports([crossModuleImport(modules), presentationImport]),
  },
  ...modules.flatMap((name) => {
    const otherModules = modules.filter((m) => m !== name);
    const crossModule = crossModuleImport(otherModules);

    return [
      {
        files: [`src/modules/${name}/**/*.ts`],
        ignores: testFiles,
        rules: restrictImports([crossModule]),
      },
      {
        files: [
          `src/modules/${name}/infrastructure/persistence/entities/*.orm-entity.ts`,
        ],
        rules: restrictImports([
          crossModuleImport(otherModules, { allowOrmEntities: true }),
        ]),
      },
      {
        files: [
          `src/modules/${name}/domain/**/*.ts`,
          `src/modules/${name}/application/**/*.ts`,
        ],
        ignores: testFiles,
        rules: restrictImports([crossModule, presentationImport]),
      },
    ];
  }),
];

export default tseslint.config(
  {
    // Migrations are TypeORM CLI output (npm run migration:generate --name=...);
    // their formatting is generator-owned, so they are excluded from lint.
    ignores: ['eslint.config.mjs', 'src/core/database/migrations/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      // Require a blank line before and after multiline const declarations so
      // consecutive object/config blocks stay visually separated.
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'multiline-const', next: '*' },
        { blankLine: 'always', prev: '*', next: 'multiline-const' },
      ],
    },
  },
  ...boundaryConfigs,
);
