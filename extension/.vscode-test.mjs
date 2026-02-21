import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
  {
    label: 'integrationTests',
    files: 'out/tests/integration/**/*.test.js',
    workspaceFolder: './tests/fixtures/workspace',
    mocha: { timeout: 30000 },
  },
  {
    label: 'e2eTests',
    files: 'out/tests/e2e/**/*.test.js',
    workspaceFolder: './tests/fixtures/workspace',
    mocha: { timeout: 60000 },
  },
]);
