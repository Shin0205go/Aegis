/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testMatch: [
    '**/test/e2e/**/*.test.ts'
  ],
  testTimeout: 30000, // E2Eテストは時間がかかる可能性がある
  setupFilesAfterEnv: ['<rootDir>/src/test/e2e/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/test/**',
  ],
  coverageDirectory: 'coverage/e2e',
  verbose: true,
};