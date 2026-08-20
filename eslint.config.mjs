import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

/**
 * The rules here are not style preferences. Each one enforces an invariant from
 * CLAUDE.md §5 that is otherwise easy to break silently in a large change.
 */
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'public/sw.js'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // CLAUDE.md §5.4 rule 13 — `any` defeats every other guarantee here.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],

      // docs/12 §6 — these are the ways SQL and script injection get in.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='$queryRawUnsafe']",
          message: 'Use a tagged $queryRaw template. $queryRawUnsafe concatenates SQL (docs/12 §6).',
        },
        {
          selector: "CallExpression[callee.property.name='$executeRawUnsafe']",
          message: 'Use a tagged $executeRaw template (docs/12 §6).',
        },
        {
          selector: "CallExpression[callee.name='eval']",
          message: 'eval is forbidden (docs/12 §6).',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'new Function is forbidden (docs/12 §6).',
        },
      ],
    },
  },
  {
    // CLAUDE.md §5.1 rule 3 — the raw Prisma client is confined to lib/db, the
    // seed and the migration scripts. Everywhere else goes through
    // getTenantDb()/withTenant(), so no query can escape its tenant.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/lib/db/**', 'src/lib/crypto/secrets.ts', 'src/lib/audit.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              importNames: ['PrismaClient'],
              message: 'Use getTenantDb()/withTenant() from @/lib/db/tenant-client (CLAUDE.md §5.1).',
            },
          ],
          patterns: [
            {
              group: ['**/lib/db/client', '@/lib/db/client'],
              importNames: ['prisma'],
              message:
                'Direct `prisma` access bypasses the tenant guard. Use withTenant(), or authDb for the non-scoped auth tables.',
            },
          ],
        },
      ],
    },
  },
  {
    // CLAUDE.md §5.3 rule 11 — a hard-coded colour breaks white-label for every
    // tenant at once, and it is invisible until someone rebrands.
    files: ['src/components/**/*.tsx', 'src/modules/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message: 'No hard-coded colours in components. Use a brand token (CLAUDE.md §5.3).',
        },
        {
          selector: "Literal[value=/\\b(rgb|rgba|hsl|hsla)\\(/]",
          message: 'No hard-coded colours in components. Use a brand token (CLAUDE.md §5.3).',
        },
      ],
    },
  },
  {
    // The default brand, the seed and the email templates are where literal
    // colours legitimately live: tokens have to start somewhere, and an email
    // client cannot read a CSS variable.
    files: [
      'src/modules/branding/default-brand.ts',
      'src/modules/auth/emails.ts',
      'src/worker/processors/notifications.ts',
      'prisma/**',
      'tests/**',
      'scripts/**',
    ],
    rules: { 'no-restricted-syntax': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
];
