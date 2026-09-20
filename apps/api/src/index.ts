import { app } from './app.js';
import { loadConfig } from './common/config.js';

const { port } = loadConfig();

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
