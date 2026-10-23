import request from 'supertest';
import { app } from '../src/app';
import { config } from '../src/config';
import { pool } from '../src/db';
import { Message } from '../src/services/messages';

export const api = () => request(app);

export async function resetAll() {
  await pool.query('truncate table users, chats cascade');
  // the emulator has a rest endpoint that wipes every document
  const { emulatorHost, projectId } = config.firebase;
  await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });
}

export async function createUser(name: string) {
  const res = await api().post('/user').send({ name });
  return res.body as { id: string; name: string };
}

export async function createChat(userAId: string, userBId: string) {
  const res = await api().post('/chat/create').send({ userAId, userBId });
  return res.body.chatId as string;
}

export async function sendMessage(chatId: string, senderId: string, text: string) {
  const res = await api().post(`/chat/${chatId}/message/send`).send({ senderId, text });
  return res.body as Message;
}
