/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  globalSetup: '<rootDir>/test/global-setup.mjs',
  globalTeardown: '<rootDir>/test/global-teardown.mjs',
  testTimeout: 30000,
};
