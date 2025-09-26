import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import ts from '@typescript-eslint/eslint-plugin'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', '.playwright/**', 'index.html'] },
  // App/browser files
  {
    files: ['src/**/*.{ts,js}', 'index.html'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...js.configs.recommended.rules,
      ...ts.configs.recommended.rules,
      // Use TS variant; disable core rules that conflict with TS
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  // Config/Node files
  {
    files: ['*.config.{js,ts}', 'vitest.config.{js,ts}', 'playwright.config.{js,ts}', 'eslint.config.{js,ts}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { process: 'readonly', __dirname: 'readonly', module: 'readonly' }
    },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...js.configs.recommended.rules,
      ...ts.configs.recommended.rules,
      'no-undef': 'off'
    }
  },
  // Tests (Vitest + jsdom)
  {
    files: ['tests/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...js.configs.recommended.rules,
      ...ts.configs.recommended.rules,
      'no-undef': 'off'
    }
  }
]
