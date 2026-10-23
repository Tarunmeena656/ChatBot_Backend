import { Router } from 'express';
import * as user from '../controllers/user';
import { validate } from '../middleware/validate';
import { userIdParam } from '../schemas/common';
import { createUserBody } from '../schemas/user';

export const userRouter = Router();

userRouter.post('/', validate(createUserBody), user.create);
userRouter.get('/:userId', validate(userIdParam, 'params'), user.get);
userRouter.get('/:userId/chats', validate(userIdParam, 'params'), user.listChats);
