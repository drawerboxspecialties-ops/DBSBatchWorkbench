import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['dist', 'docs', 'node_modules', 'coverage'],
  },
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error', 'warn', 'info', 'log'] }],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'always'],
    },
  },
  {
    files: ['tests/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
