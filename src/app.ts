import { randomUUID } from 'node:crypto';
import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { errorHandler, notFound } from './middleware/errors';
import { routes } from './routes';

export const app = express();

app.disable('x-powered-by');
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
    customLogLevel: (req, res, err) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url }) },
  }),
);
app.use(express.json({ limit: '100kb' }));

app.use(routes);

app.use(notFound);
app.use(errorHandler);
