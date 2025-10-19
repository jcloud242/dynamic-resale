import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'j', 'j/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Keep code clean but pragmatic:
      // - don't require naming unused catch params
      // - allow empty catch blocks (we intentionally ignore failures in some flows)
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  // Node/server code override: CommonJS, Node globals, relax some browser-centric rules
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
      globals: globals.node,
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unsafe-finally': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',
      'no-fallthrough': 'off',
      'no-sparse-arrays': 'off',
    },
  },
  // Node-based config files (ESM or CJS): allow process, require, etc.
  {
    files: ['vite.config.js', 'postcss.config.cjs', 'tailwind.config.cjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2020,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: globals.node,
    },
    rules: {
      'no-undef': 'off',
    },
  },
])
