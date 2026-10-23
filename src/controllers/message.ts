import { Request, Response } from 'express';
import { ChatIdParam, MessageParams } from '../schemas/common';
import * as chats from '../services/chats';
import * as messages from '../services/messages';

export async function send(req: Request<ChatIdParam>, res: Response) {
  const { chatId } = req.params;
  const { senderId, text } = req.body;
  await chats.getChatForMember(chatId, senderId);
  res.status(201).json(await messages.sendMessage(chatId, senderId, text));
}

export async function list(req: Request<ChatIdParam>, res: Response) {
  const { chatId } = req.params;
  const { limit, before } = res.locals.query;
  await chats.getChat(chatId);
  res.json({ messages: await messages.listMessages(chatId, limit, before) });
}

export async function markRead(req: Request<MessageParams>, res: Response) {
  const { chatId, messageId } = req.params;
  const { userId } = req.body;
  await chats.getChatForMember(chatId, userId);
  res.json(await messages.markRead(chatId, messageId, userId));
}

export async function updateLastSeen(req: Request<ChatIdParam>, res: Response) {
  const { chatId } = req.params;
  const { userId, messageId } = req.body;
  await chats.getChatForMember(chatId, userId);
  res.json(await messages.updateLastSeen(chatId, userId, messageId));
}

export async function listLastSeen(req: Request<ChatIdParam>, res: Response) {
  const { chatId } = req.params;
  await chats.getChat(chatId);
  res.json({ members: await messages.listLastSeen(chatId) });
}

export async function edit(req: Request<MessageParams>, res: Response) {
  const { chatId, messageId } = req.params;
  const { senderId, text } = req.body;
  await chats.getChatForMember(chatId, senderId);
  res.json(await messages.editMessage(chatId, messageId, senderId, text));
}

export async function remove(req: Request<MessageParams>, res: Response) {
  const { chatId, messageId } = req.params;
  const { senderId } = req.body;
  await chats.getChatForMember(chatId, senderId);
  res.json(await messages.deleteMessage(chatId, messageId, senderId));
}
