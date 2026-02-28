import { defineConfig } from '../../../../src/index';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth', output: './generated/auth' },
    cms: { path: './schemas/cms', output: './generated/cms' },
  },
});
