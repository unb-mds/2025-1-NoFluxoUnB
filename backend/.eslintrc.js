module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    // src + tests-ts (o tsconfig.json de build só cobre src/)
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
    es6: true,
    jest: true,
  },
  rules: {
    // `_x` = não usado de propósito (parâmetro de assinatura, desestruturação)
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    // let { data, error } = ... com só um dos dois reatribuído não vira const
    'prefer-const': ['error', { destructuring: 'all' }],
    // while (true) de leitura de stream é intencional
    'no-constant-condition': ['error', { checkLoops: false }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    'no-var': 'error',
    'no-console': 'warn',
  },
  overrides: [
    {
      // Jest: jest.mock() é içado acima das declarações; só `var mockX` fica
      // acessível na fábrica, e require() recarrega módulos entre testes.
      files: ['tests-ts/**/*.ts'],
      rules: {
        'no-var': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};
