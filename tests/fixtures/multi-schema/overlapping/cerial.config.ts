import { defineConfig } from '../../../../src/main';

export default defineConfig({
  schemas: {
    auth: { path: './schemas/auth' },
    cms: { path: './schemas' },
  },
});
