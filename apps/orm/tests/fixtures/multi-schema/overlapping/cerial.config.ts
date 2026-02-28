import { defineConfig } from '../../../../src/index';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth' },
    cms: { path: './schemas' },
  },
});
