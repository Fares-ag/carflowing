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
  ignorePatterns: [
    'dist',
    'node_modules',
    'playwright-report',
    '.pgdata-test',
    '.pgdata-e2e',
    'src/**',
    'supabase/**',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', 'jsx-a11y', 'import', 'security'],
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    'import/default': 'off',
    'import/order': 'off',
    'no-console': 'off',
    'jsx-a11y/label-has-associated-control': 'off',
    'jsx-a11y/click-events-have-key-events': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'jsx-a11y/no-noninteractive-element-interactions': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    'security/detect-object-injection': 'off',
    'security/detect-possible-timing-attacks': 'off',
    'security/detect-unsafe-regex': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'react-refresh/only-export-components': 'off',
    'import/no-named-as-default': 'off',
    'import/no-named-as-default-member': 'off',
    'import/no-unresolved': 'off',
  },
  overrides: [
    {
      files: ['tests/**/*.{ts,tsx}'],
      rules: {
        'security/detect-non-literal-fs-filename': 'off',
        'security/detect-unsafe-regex': 'off',
        'security/detect-non-literal-regexp': 'off',
      },
    },
    {
      files: ['apps/backend/**/*.ts'],
      env: { node: true, browser: false },
      rules: {
        'security/detect-object-injection': 'off',
        'security/detect-non-literal-fs-filename': 'off',
        'security/detect-unsafe-regex': 'off',
      },
    },
    {
      files: ['apps/*/src/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'TemplateLiteral[expressions.length>0] > TemplateElement[value.raw=/QAR \\$/]',
            message: 'Use formatCurrency() from @carflow/shared instead of raw `QAR ${...}` literals.',
          },
          {
            selector: 'CallExpression[callee.property.name="toLocaleDateString"]',
            message: 'Use formatDate(), formatDateOrDash(), or formatDateTime() from @carflow/shared.',
          },
        ],
      },
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
