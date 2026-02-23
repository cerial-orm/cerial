import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
  {
    label: 'integrationTests',
    files: 'out/tests/integration/*.test.js',
    workspaceFolder: './tests/fixtures/workspace',
    mocha: { timeout: 30000 },
  },
  {
    label: 'e2eTests',
    files: 'out/tests/e2e/*.test.js',
    workspaceFolder: './tests/fixtures/workspace',
    mocha: { timeout: 60000 },
  },
  {
    label: 'integrationConvention',
    files: 'out/tests/integration/multi-schema/convention.test.js',
    workspaceFolder: './tests/fixtures/workspace-convention',
    mocha: { timeout: 30000 },
  },
  {
    label: 'integrationRootConfig',
    files: 'out/tests/integration/multi-schema/root-config.test.js',
    workspaceFolder: './tests/fixtures/workspace-root-config',
    mocha: { timeout: 30000 },
  },
  {
    label: 'integrationFolderConfig',
    files: 'out/tests/integration/multi-schema/folder-config.test.js',
    workspaceFolder: './tests/fixtures/workspace-folder-config',
    mocha: { timeout: 30000 },
  },
  {
    label: 'integrationRootFolderOverride',
    files: 'out/tests/integration/multi-schema/root-folder-override.test.js',
    workspaceFolder: './tests/fixtures/workspace-root-folder-override',
    mocha: { timeout: 30000 },
  },
  {
    label: 'integrationCerialignore',
    files: 'out/tests/integration/multi-schema/cerialignore.test.js',
    workspaceFolder: './tests/fixtures/workspace-cerialignore',
    mocha: { timeout: 30000 },
  },
  {
    label: 'integrationPathFiltering',
    files: 'out/tests/integration/multi-schema/path-filtering.test.js',
    workspaceFolder: './tests/fixtures/workspace-path-filtering',
    mocha: { timeout: 30000 },
  },
  {
    label: 'integrationMixed',
    files: 'out/tests/integration/multi-schema/mixed.test.js',
    workspaceFolder: './tests/fixtures/workspace-mixed',
    mocha: { timeout: 30000 },
  },
  {
    label: 'e2eWorkflows',
    files: 'out/tests/e2e/workflows/*.test.js',
    workspaceFolder: './tests/fixtures/workspace-e2e-workflows',
    mocha: { timeout: 60000 },
  },
]);
