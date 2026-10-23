import { Request, Response } from 'express';
import { UserIdParam } from '../schemas/common';
import * as chats from '../services/chats';
import * as users from '../services/users';

export async function create(req: Request, res: Response) {
  const user = await users.createUser(req.body.name);
  res.status(201).json(user);
}

export async function get(req: Request<UserIdParam>, res: Response) {
  res.json(await users.getUser(req.params.userId));
}

export async function listChats(req: Request<UserIdParam>, res: Response) {
  res.json({ chats: await chats.listUserChats(req.params.userId) });
}
