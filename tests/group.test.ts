import { beforeEach, describe, expect, it } from 'vitest';
import { api, createChat, createGroup, createUser, resetAll, sendMessage } from './helpers';

beforeEach(resetAll);

async function team() {
  const a = await createUser('Aditi');
  const b = await createUser('Vikram');
  const c = await createUser('Neha');
  return { a, b, c };
}

type ChatRow = { id: string; type: string; name: string | null; memberIds: string[] };

async function chatsOf(userId: string): Promise<ChatRow[]> {
  const res = await api().get(`/user/${userId}/chats`);
  return res.body.chats;
}

describe('group chats', () => {
  it('creates a group with the creator as a member', async () => {
    const { a, b, c } = await team();

    const res = await api()
      .post('/chat/group')
      .send({ name: 'Backend team', createdBy: a.id, memberIds: [b.id, c.id, b.id] });
    expect(res.status).toBe(201);
    expect(res.body.chatId).toBeTruthy();

    const [chat] = await chatsOf(c.id);
    expect(chat).toMatchObject({ id: res.body.chatId, type: 'group', name: 'Backend team' });
    expect(chat.memberIds.sort()).toEqual([a.id, b.id, c.id].sort());

    const again = await api()
      .post('/chat/group')
      .send({ name: 'Backend team', createdBy: a.id, memberIds: [b.id] });
    expect(again.body.chatId).not.toBe(res.body.chatId);
  });

  it('adds and removes members', async () => {
    const { a, b, c } = await team();
    const chatId = await createGroup('Standup', a.id, [b.id]);

    const added = await api()
      .post(`/chat/${chatId}/members`)
      .send({ userIds: [c.id, b.id] });
    expect(added.status).toBe(200);
    expect(added.body.memberIds.sort()).toEqual([a.id, b.id, c.id].sort());

    const removed = await api().delete(`/chat/${chatId}/members/${b.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.memberIds.sort()).toEqual([a.id, c.id].sort());
    expect((await api().delete(`/chat/${chatId}/members/${b.id}`)).status).toBe(404);
    expect(await chatsOf(b.id)).toEqual([]);

    const ghost = await api()
      .post(`/chat/${chatId}/members`)
      .send({ userIds: ['00000000-0000-4000-8000-000000000000'] });
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('does not change members of a 1:1 chat', async () => {
    const { a, b, c } = await team();
    const chatId = await createChat(a.id, b.id);

    const res = await api()
      .post(`/chat/${chatId}/members`)
      .send({ userIds: [c.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_A_GROUP');
    expect((await api().delete(`/chat/${chatId}/members/${b.id}`)).status).toBe(400);
  });

  it('lets every member of a group send and read', async () => {
    const { a, b, c } = await team();
    const chatId = await createGroup('Standup', a.id, [b.id, c.id]);

    const message = await sendMessage(chatId, c.id, 'morning');
    const read = await api().post(`/chat/${chatId}/message/${message.id}/read`).send({ userId: b.id });
    expect(read.status).toBe(200);
    expect(read.body.readBy[b.id]).toBeTruthy();

    const outsider = await createUser('Ravi');
    const res = await api().post(`/chat/${chatId}/message/send`).send({ senderId: outsider.id, text: 'hi' });
    expect(res.status).toBe(403);
  });
});

describe('message edit and delete', () => {
  it('lets only the sender edit a message', async () => {
    const a = await createUser('Aditi');
    const b = await createUser('Vikram');
    const chatId = await createChat(a.id, b.id);
    const message = await sendMessage(chatId, a.id, 'helo');

    const notYours = await api().patch(`/chat/${chatId}/message/${message.id}`).send({ senderId: b.id, text: 'x' });
    expect(notYours.status).toBe(403);
    expect(notYours.body.error.code).toBe('NOT_SENDER');

    const edited = await api().patch(`/chat/${chatId}/message/${message.id}`).send({ senderId: a.id, text: 'hello' });
    expect(edited.status).toBe(200);
    expect(edited.body.text).toBe('hello');
    expect(edited.body.editedAt).toBeTruthy();

    const listed = await api().get(`/chat/${chatId}/messages`);
    expect(listed.body.messages[0]).toMatchObject({ text: 'hello', editedAt: edited.body.editedAt });
  });

  it('soft deletes a message so it keeps its place', async () => {
    const a = await createUser('Aditi');
    const b = await createUser('Vikram');
    const chatId = await createChat(a.id, b.id);
    const first = await sendMessage(chatId, a.id, 'oops');
    await sendMessage(chatId, b.id, 'what?');

    const notYours = await api().delete(`/chat/${chatId}/message/${first.id}`).send({ senderId: b.id });
    expect(notYours.status).toBe(403);

    const deleted = await api().delete(`/chat/${chatId}/message/${first.id}`).send({ senderId: a.id });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ deleted: true, text: '' });

    const listed = await api().get(`/chat/${chatId}/messages`);
    expect(listed.body.messages.map((m: { text: string; deleted: boolean }) => [m.text, m.deleted])).toEqual([
      ['', true],
      ['what?', false],
    ]);

    const editAfter = await api().patch(`/chat/${chatId}/message/${first.id}`).send({ senderId: a.id, text: 'back' });
    expect(editAfter.status).toBe(409);
    expect(editAfter.body.error.code).toBe('MESSAGE_DELETED');
  });
});
