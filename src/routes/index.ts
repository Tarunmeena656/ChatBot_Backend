import { Router } from 'express';
import { chatRouter } from './chat';
import { userRouter } from './user';

export const routes = Router();

routes.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
routes.use('/chat', chatRouter);
routes.use('/user', userRouter);
