import { defineConfig } from '../../../../src/main';

export default defineConfig({
  schemas: {
    // @ts-expect-error intentionally invalid config for testing
    auth: {},
  },
});
