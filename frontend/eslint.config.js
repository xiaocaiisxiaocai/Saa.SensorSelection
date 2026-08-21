import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tseslint.parser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parser: vueParser,
      parserOptions: {
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'vue/html-self-closing': [
        'error',
        { html: { component: 'always', normal: 'always', void: 'never' } },
      ],
      'vue/max-attributes-per-line': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
);
