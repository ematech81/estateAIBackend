/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Generous enough to cover MongoMemoryServer's launchTimeout (60s, see
  // tests/helpers/testDb.ts) plus the test body itself.
  testTimeout: 90000,
};
