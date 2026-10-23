import { beforeEach, describe, expect, it } from 'vitest';
import { api, createChat, createUser, resetAll, sendMessage } from './helpers';

beforeEach(resetAll);

async function team() {
  const a = await createUser('Aditi');
  const b = await createUser('Vikram');
  const c = await createUser('Neha');
  return { a, b, c };
}

describe('group chats', () => {
  it('creates a group with the creator as a member', async () => {
    const { a, b, c } = await team();

    const res = await api()
      .post('/chat/group')
      .send({ name: 'Backend team', createdBy: a.id, memberIds: [b.id, c.id, b.id] });
    expect(res.status).toBe(201);

    const chat = await api().get(`/chat/${res.body.chatId}`);
    expect(chat.body).toMatchObject({ type: 'group', name: 'Backend team', createdBy: a.id });
    expect(chat.body.memberIds.sort()).toEqual([a.id, b.id, c.id].sort());

    // a second group with the same people is a different chat, unlike 1:1
    const again = await api()
      .post('/chat/group')
      .send({ name: 'Backend team', createdBy: a.id, memberIds: [b.id] });
    expect(again.body.chatId).not.toBe(res.body.chatId);
  });

  it('adds and removes members and renames the group', async () => {
    const { a, b, c } = await team();
    const { body } = await api()
      .post('/chat/group')
      .send({ name: 'Standup', createdBy: a.id, memberIds: [b.id] });

    const added = await api()
      .post(`/chat/${body.chatId}/members`)
      .send({ userIds: [c.id, b.id] });
    expect(added.status).toBe(200);
    expect(added.body.memberIds.sort()).toEqual([a.id, b.id, c.id].sort());

    const removed = await api().delete(`/chat/${body.chatId}/members/${b.id}`);
    expect(removed.body.memberIds.sort()).toEqual([a.id, c.id].sort());
    expect((await api().delete(`/chat/${body.chatId}/members/${b.id}`)).status).toBe(404);

    const renamed = await api().patch(`/chat/${body.chatId}`).send({ name: 'Daily standup' });
    expect(renamed.body.name).toBe('Daily standup');

    const chats = await api().get(`/user/${b.id}/chats`);
    expect(chats.body.chats).toHaveLength(0);

    const ghost = await api()
      .post(`/chat/${body.chatId}/members`)
      .send({ userIds: ['00000000-0000-4000-8000-000000000000'] });
    expect(ghost.status).toBe(404);
  });

  it('does not let 1:1 chats be changed like groups', async () => {
    const { a, b, c } = await team();
    const chatId = await createChat(a.id, b.id);

    const res = await api()
      .post(`/chat/${chatId}/members`)
      .send({ userIds: [c.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_A_GROUP');
    expect((await api().patch(`/chat/${chatId}`).send({ name: 'x' })).status).toBe(400);
  });

  it('lets every member of a group send and read', async () => {
    const { a, b, c } = await team();
    const { body } = await api()
      .post('/chat/group')
      .send({ name: 'Standup', createdBy: a.id, memberIds: [b.id, c.id] });

    const message = await sendMessage(body.chatId, c.id, 'morning');
    const read = await api().post(`/chat/${body.chatId}/message/${message.id}/read`).send({ userId: b.id });
    expect(read.status).toBe(200);
    expect(read.body.readBy[b.id]).toBeTruthy();
  });
});

describe('edit and delete', () => {
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
