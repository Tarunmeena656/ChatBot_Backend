import { Request, Response } from 'express';
import { UserIdParam } from '../schemas/common';
import * as chats from '../services/chats';

export async function listChats(req: Request<UserIdParam>, res: Response) {
  res.json({ chats: await chats.listUserChats(req.params.userId) });
}
