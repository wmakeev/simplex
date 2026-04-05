import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import nodePlugin from 'eslint-plugin-n'
// defineConfig() — ESLint core API (v9.22+), replaces deprecated tseslint.config()
// https://eslint.org/docs/latest/use/configure/configuration-files#defining-a-configuration
import { defineConfig } from 'eslint/config'

export default defineConfig(
  eslint.configs.recommended,
  nodePlugin.configs['flat/recommended-script'],
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs']
        },
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'warn',
        {
          allowForKnownSafeCalls: [
            { from: 'package', name: 'it', package: 'node:test' },
            { from: 'package', name: 'test', package: 'node:test' },
            { from: 'package', name: 'skip', package: 'node:test' },
            { from: 'package', name: 'only', package: 'node:test' },
            { from: 'package', name: 'suite', package: 'node:test' },
            { from: 'package', name: 'describe', package: 'node:test' },
            {
              from: 'package',
              name: 'stringToUint8Array',
              package: 'uint8array-extras'
            }
          ]
        }
      ],
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',

      // project scope — compiler works with `any` from parser by design
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
      '@typescript-eslint/no-implied-eval': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'prefer-spread': 'off',
      'no-var': 'off'
    }
  },
  {
    ignores: ['lib/', 'parser/', 'build/', '__temp/', 'coverage/', 'scripts/', 'playground/']
  }
)
