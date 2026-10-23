import { Request, Response } from 'express';
import { ChatIdParam, MemberParams } from '../schemas/common';
import * as chats from '../services/chats';

// 1:1 chat. 201 when it was just created, 200 when the pair already had one
export async function create(req: Request, res: Response) {
  const { userAId, userBId } = req.body;
  const result = await chats.getOrCreateDirectChat(userAId, userBId);
  res.status(result.created ? 201 : 200).json(result);
}

export async function get(req: Request<ChatIdParam>, res: Response) {
  res.json(await chats.getChat(req.params.chatId));
}

export async function createGroup(req: Request, res: Response) {
  const { name, createdBy, memberIds } = req.body;
  res.status(201).json(await chats.createGroupChat(name, createdBy, memberIds));
}

export async function rename(req: Request<ChatIdParam>, res: Response) {
  res.json(await chats.renameGroup(req.params.chatId, req.body.name));
}

export async function addMembers(req: Request<ChatIdParam>, res: Response) {
  res.json(await chats.addMembers(req.params.chatId, req.body.userIds));
}

export async function removeMember(req: Request<MemberParams>, res: Response) {
  res.json(await chats.removeMember(req.params.chatId, req.params.userId));
}
