import { defineConfig } from '../../../../src/index';

export default defineConfig({
  schemas: {
    alpha: {
      path: './schemas/alpha',
      output: './generated/alpha',
      connection: {
        url: 'http://127.0.0.1:8000',
        namespace: 'main',
        database: 'ms_rt_alpha',
        auth: { username: 'root', password: 'root' },
      },
    },
    beta: { path: './schemas/beta', output: './generated/beta' },
  },
  connection: {
    url: 'http://127.0.0.1:8000',
    namespace: 'main',
    database: 'main',
    auth: { username: 'root', password: 'root' },
  },
});
