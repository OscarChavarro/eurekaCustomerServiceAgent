const { createCjsPreset } = require('jest-preset-angular/presets');

/** @type {import('jest').Config} */
module.exports = {
  ...createCjsPreset(),
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src/test'],
  testMatch: ['**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup-jest.ts'],
  collectCoverageFrom: ['src/main/app/**/*.ts', '!src/main/**/*.spec.ts', '!src/main/main.ts'],
  coverageDirectory: '<rootDir>/coverage',
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  clearMocks: true
};
