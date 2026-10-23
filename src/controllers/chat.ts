import { Request, Response } from 'express';
import { ChatIdParam, MemberParams } from '../schemas/common';
import * as chats from '../services/chats';

export async function create(req: Request, res: Response) {
  const { userAId, userBId } = req.body;
  const chatId = await chats.getOrCreateDirectChat(userAId, userBId);
  res.json({ chatId });
}

export async function createGroup(req: Request, res: Response) {
  const { name, createdBy, memberIds } = req.body;
  const chatId = await chats.createGroupChat(name, createdBy, memberIds);
  res.status(201).json({ chatId });
}

export async function addMembers(req: Request<ChatIdParam>, res: Response) {
  res.json(await chats.addMembers(req.params.chatId, req.body.userIds));
}

export async function removeMember(req: Request<MemberParams>, res: Response) {
  res.json(await chats.removeMember(req.params.chatId, req.params.userId));
}
