import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.logLevel,
  base: { service: 'chat-backend' },
  transport: config.env === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});
