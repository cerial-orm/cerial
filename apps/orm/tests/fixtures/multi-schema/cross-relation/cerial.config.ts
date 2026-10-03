import { defineConfig } from '../../../../src/index';

export default defineConfig({
  schemas: {
    owners: { path: './schemas/owners', output: './generated/owners' },
    items: { path: './schemas/items', output: './generated/items' },
  },
});
