module.exports = {
  root: true,
  env: {
    node: true
  },
  extends: [
    'plugin:vue/recommended',
    'eslint:recommended',
    '@vue/standard',
    '@vue/typescript',
    '@vue/typescript/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2020
  },
  globals: {
    __BUILD_VERSION__: 'readonly',
    __BUILD_DATE__: 'readonly'
  },
  rules: {
    'vue/no-v-model-argument': 'off',
    'padded-blocks': 'off',
    'prefer-const': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    'vue/script-indent': ['warn', 2, { baseIndent: 1 }],
    'vue/no-unused-components': 'warn',
    'vue/component-tags-order': 'warn',
    'vue/valid-v-slot': 'off', // Bug: https://github.com/vuejs/eslint-plugin-vue/issues/1229
    'vue/max-attributes-per-line': 'off',
    'vue/html-closing-bracket-newline': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/first-attribute-linebreak': 'off',
    'no-console': 'off',
    'no-debugger': 'warn',
    'no-empty-pattern': 'off',
    'comma-dangle': 'off',
    'space-before-function-paren': ['error', 'never'],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
  overrides: [
    {
      files: ['*.vue'],
      rules: {
        indent: 'off'
      }
    }
  ]
}
