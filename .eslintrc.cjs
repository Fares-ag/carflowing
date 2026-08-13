/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:security/recommended-legacy',
  ],
  ignorePatterns: ['dist', 'node_modules', 'playwright-report', '.pgdata-test', '.pgdata-e2e'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', 'jsx-a11y', 'import', 'security'],
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': 'warn',
    'import/order': ['warn', { alphabetize: { order: 'asc' }, 'newlines-between': 'never' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      files: ['apps/backend/**/*.ts'],
      env: { node: true, browser: false },
    },
    {
      files: ['apps/*/src/pages/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'warn',
          {
            patterns: [
              {
                group: ['**/fetch'],
                message: 'Use domain *Service.ts modules instead of direct fetch in pages.',
              },
            ],
          },
        ],
      },
    },
  ],
}
