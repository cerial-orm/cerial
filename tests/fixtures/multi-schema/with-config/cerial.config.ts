import { defineConfig } from '../../../../src/main';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth', output: './generated/auth' },
    cms: { path: './schemas/cms', output: './generated/cms' },
  },
});
