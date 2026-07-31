// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.wrangler/**',
      '**/node_modules/**',
      '**/.tmp/**',
      'backend/tmp/**',
      '**/*.config.{js,ts,mjs,cjs}',
      'backend/ima-skill/**',
      'backend/scripts/**',
      '**/proxy_patch.cjs',
      'backend/test-serving-and-download.ts',
    ],
  },

  // JS 基础规则
  js.configs.recommended,

  // TypeScript 基础规则（宽松，避免阻塞）
  ...tseslint.configs.recommended,

  // 前端 React 规则
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // 后端 Workers 规则
  {
    files: ['backend/src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
        // Cloudflare Workers 运行时全局变量
        caches: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      // Workers 环境下允许顶层 await
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // 通用规则
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },
)
