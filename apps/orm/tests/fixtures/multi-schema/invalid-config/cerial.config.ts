import { defineConfig } from '../../../../src/index';

export default defineConfig({
  schemas: {
    // @ts-expect-error intentionally invalid config for testing
    auth: {},
  },
});
