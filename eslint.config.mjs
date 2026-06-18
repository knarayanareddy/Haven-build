import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/coverage/**',
      '**/dist/**',
      '**/build/**',
      'pnpm-lock.yaml',
    ],
  },
  {
    plugins: {
      'jsx-a11y': jsxA11y,
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
        ...globals.serviceworker,
        Deno: 'readonly',
        chrome: 'readonly',
      },
    },
    rules: {
      'no-alert': 'error',
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      curly: 'off',
      'no-empty': 'off',
      'no-console': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
