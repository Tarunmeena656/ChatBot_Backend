import { app } from './app';
import { config } from './config';
import { pool } from './db';
import { logger } from './logger';

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.env, firestore: config.firebase.emulatorHost || 'cloud' },
    'api listening',
  );
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
