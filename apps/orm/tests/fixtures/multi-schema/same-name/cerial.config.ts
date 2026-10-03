import { defineConfig } from '../../../../src/index';

export default defineConfig({
  schemas: {
    one: { path: './schemas/one', output: './generated/one' },
    two: { path: './schemas/two', output: './generated/two' },
  },
});
