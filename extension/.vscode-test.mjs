import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
  {
    label: 'unitTests',
    files: 'out/test/unit/**/*.test.js',
  },
  {
    label: 'integrationTests',
    files: 'out/test/integration/**/*.test.js',
    workspaceFolder: './tests/fixtures',
    mocha: { timeout: 30000 },
  },
]);
