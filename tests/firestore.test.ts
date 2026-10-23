import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { firestore } from '../src/firebase';
import { api, createChat, createUser, resetAll, sendMessage } from './helpers';

beforeEach(resetAll);

async function pair() {
  const a = await createUser('Aditi');
  const b = await createUser('Vikram');
  const chatId = await createChat(a.id, b.id);
  return { a, b, chatId };
}

describe('firestore documents', () => {
  it('stores each message under chats/{chatId}/messages with timestamps and a readBy map', async () => {
    const { a, b, chatId } = await pair();
    const message = await sendMessage(chatId, a.id, 'stored');
    await api().post(`/chat/${chatId}/message/${message.id}/read`).send({ userId: b.id });

    const snap = await firestore.doc(`chats/${chatId}/messages/${message.id}`).get();
    expect(snap.exists).toBe(true);
    const data = snap.data()!;
    expect(data).toMatchObject({ chatId, senderId: a.id, text: 'stored', deleted: false, editedAt: null });
    expect(data.createdAt).toBeInstanceOf(Timestamp);
    expect(data.createdAt.toDate().toISOString()).toBe(message.createdAt);
    expect(data.readBy[b.id]).toBeInstanceOf(Timestamp);
  });

  it('stores the last seen pointer under chats/{chatId}/members/{userId}', async () => {
    const { a, b, chatId } = await pair();
    const message = await sendMessage(chatId, a.id, 'seen');
    await api().post(`/chat/${chatId}/lastseen`).send({ userId: b.id, messageId: message.id });

    const snap = await firestore.doc(`chats/${chatId}/members/${b.id}`).get();
    const data = snap.data()!;
    expect(data.lastSeenMessageId).toBe(message.id);
    expect(data.lastSeenMessageAt.toDate().toISOString()).toBe(message.createdAt);
    expect(data.updatedAt).toBeInstanceOf(Timestamp);
  });

  it('keeps chats separate from each other', async () => {
    const { a, chatId } = await pair();
    const c = await createUser('Neha');
    const other = await createChat(a.id, c.id);
    const message = await sendMessage(chatId, a.id, 'only here');
    await sendMessage(other, a.id, 'other chat');

    const list = await api().get(`/chat/${other}/messages`);
    expect(list.body.messages.map((m: { text: string }) => m.text)).toEqual(['other chat']);

    const read = await api().post(`/chat/${other}/message/${message.id}/read`).send({ userId: c.id });
    expect(read.status).toBe(404);
    const seen = await api().post(`/chat/${other}/lastseen`).send({ userId: a.id, messageId: message.id });
    expect(seen.status).toBe(404);
  });

  it('returns an empty list for a new chat and when paging past the first message', async () => {
    const { a, chatId } = await pair();
    expect((await api().get(`/chat/${chatId}/messages`)).body.messages).toEqual([]);

    const first = await sendMessage(chatId, a.id, 'first');
    const res = await api().get(`/chat/${chatId}/messages?before=${first.createdAt}`);
    expect(res.body.messages).toEqual([]);
  });

  it('collects one read receipt per reader', async () => {
    const a = await createUser('Aditi');
    const b = await createUser('Vikram');
    const c = await createUser('Neha');
    const group = await api()
      .post('/chat/group')
      .send({ name: 'Team', createdBy: a.id, memberIds: [b.id, c.id] });
    const chatId = group.body.chatId as string;
    const message = await sendMessage(chatId, a.id, 'read by all');

    const firstRead = await api().post(`/chat/${chatId}/message/${message.id}/read`).send({ userId: b.id });
    await api().post(`/chat/${chatId}/message/${message.id}/read`).send({ userId: c.id });
    const again = await api().post(`/chat/${chatId}/message/${message.id}/read`).send({ userId: b.id });

    expect(Object.keys(again.body.readBy).sort()).toEqual([b.id, c.id].sort());
    expect(again.body.readBy[b.id] >= firstRead.body.readBy[b.id]).toBe(true);

    const listed = await api().get(`/chat/${chatId}/messages`);
    expect(Object.keys(listed.body.messages[0].readBy).sort()).toEqual([b.id, c.id].sort());
  });

  it('keeps createdAt and read receipts through edit and delete', async () => {
    const { a, b, chatId } = await pair();
    const message = await sendMessage(chatId, a.id, 'typo');
    await api().post(`/chat/${chatId}/message/${message.id}/read`).send({ userId: b.id });

    const edited = await api().patch(`/chat/${chatId}/message/${message.id}`).send({ senderId: a.id, text: 'fixed' });
    expect(edited.body.createdAt).toBe(message.createdAt);
    expect(Object.keys(edited.body.readBy)).toEqual([b.id]);

    const deleted = await api().delete(`/chat/${chatId}/message/${message.id}`).send({ senderId: a.id });
    expect(deleted.body.createdAt).toBe(message.createdAt);
    expect(deleted.body.editedAt).toBe(edited.body.editedAt);
    expect(Object.keys(deleted.body.readBy)).toEqual([b.id]);
  });

  it('lists the last seen pointer of every member in a group', async () => {
    const a = await createUser('Aditi');
    const b = await createUser('Vikram');
    const c = await createUser('Neha');
    const group = await api()
      .post('/chat/group')
      .send({ name: 'Team', createdBy: a.id, memberIds: [b.id, c.id] });
    const chatId = group.body.chatId as string;
    const first = await sendMessage(chatId, a.id, 'one');
    const second = await sendMessage(chatId, b.id, 'two');

    await api().post(`/chat/${chatId}/lastseen`).send({ userId: a.id, messageId: second.id });
    await api().post(`/chat/${chatId}/lastseen`).send({ userId: b.id, messageId: second.id });
    await api().post(`/chat/${chatId}/lastseen`).send({ userId: c.id, messageId: first.id });

    const res = await api().get(`/chat/${chatId}/lastseen`);
    expect(res.status).toBe(200);
    const byUser = Object.fromEntries(
      res.body.members.map((m: { userId: string; lastSeenMessageId: string }) => [m.userId, m.lastSeenMessageId]),
    );
    expect(byUser).toEqual({ [a.id]: second.id, [b.id]: second.id, [c.id]: first.id });
  });

  it('starts every test with an empty firestore', async () => {
    const snap = await firestore.collectionGroup('messages').get();
    expect(snap.empty).toBe(true);
  });
});
