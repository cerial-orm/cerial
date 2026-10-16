import { defineConfig } from '../../../../src/index';

const connection = (database: string) => ({
  url: 'http://127.0.0.1:8000',
  namespace: 'main',
  database,
  auth: { username: 'root', password: 'root' },
});

// Both entries map MsRtPinned to ms_rt_pinned, which is allowed because each sets its own database
export default defineConfig({
  schemas: {
    east: { path: './schemas/east', output: './generated/east', connection: connection('ms_rt_pin_east') },
    west: { path: './schemas/west', output: './generated/west', connection: connection('ms_rt_pin_west') },
  },
});
