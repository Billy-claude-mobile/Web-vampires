export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', location: 'readonly', performance: 'readonly', requestAnimationFrame: 'readonly', setTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', process: 'readonly', console: 'readonly', URLSearchParams: 'readonly' },
    },
    rules: { 'no-unused-vars': 'error', 'no-undef': 'error' },
  },
];
