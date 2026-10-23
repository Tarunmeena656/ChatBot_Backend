import { Router } from 'express';
import * as user from '../controllers/user';
import { validate } from '../middleware/validate';
import { userIdParam } from '../schemas/common';

export const userRouter = Router();

userRouter.get('/:userId/chats', validate(userIdParam, 'params'), user.listChats);
