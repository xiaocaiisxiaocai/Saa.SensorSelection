/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['dist/**/*', 'node_modules/**/*'],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
    {
      files: ['**/tokens.css'],
      rules: {
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],
  rules: {
    'alpha-value-notation': null,
    'color-function-notation': 'modern',
    'color-hex-length': null,
    'custom-property-empty-line-before': null,
    'declaration-property-value-disallowed-list': {
      '/^(animation-delay|animation-duration|transition-delay|transition-duration)$/':
        ['/\\d+ms$/', '/\\d+s$/'],
      '/^(background|background-color|border-color|caret-color|color|fill|outline-color|stroke)$/':
        ['/^#/', '/^rgb/', '/^hsl/', '/^hwb/', '/^lab/', '/^lch/', '/^oklch/'],
      'font-size': ['/^[0-9]/', '/px$/', '/rem$/', '/em$/'],
    },
    'import-notation': 'string',
    'media-feature-range-notation': 'context',
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,
    'selector-class-pattern': [
      '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$',
      {
        message: 'Expected class selector to be kebab-case',
      },
    ],
  },
};
