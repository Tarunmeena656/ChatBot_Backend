import express from 'express';
import { errorHandler, notFound } from './middleware/errors';
import { routes } from './routes';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(routes);
app.use(notFound);
app.use(errorHandler);
