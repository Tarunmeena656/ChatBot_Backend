import { beforeEach, describe, expect, it } from 'vitest';
import { api, createChat, createUser, resetAll, sendMessage } from './helpers';

beforeEach(resetAll);

async function pair() {
  const a = await createUser('Aditi');
  const b = await createUser('Vikram');
  const chatId = await createChat(a.id, b.id);
  return { a, b, chatId };
}

describe('messages', () => {
  it('stores messages and returns them oldest first', async () => {
    const { a, b, chatId } = await pair();

    const sent = await api().post(`/chat/${chatId}/message/send`).send({ senderId: a.id, text: 'hi' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ chatId, senderId: a.id, text: 'hi', deleted: false, readBy: {} });
    expect(sent.body.id).toBeTruthy();

    await sendMessage(chatId, b.id, 'hello');
    await sendMessage(chatId, a.id, 'how are you');

    const res = await api().get(`/chat/${chatId}/messages`);
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m: { text: string }) => m.text)).toEqual(['hi', 'hello', 'how are you']);
    const times = res.body.messages.map((m: { createdAt: string }) => m.createdAt);
    expect([...times].sort()).toEqual(times);
  });

  it('only lets members send', async () => {
    const { chatId } = await pair();
    const outsider = await createUser('Neha');

    const res = await api().post(`/chat/${chatId}/message/send`).send({ senderId: outsider.id, text: 'hey' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');

    const missing = await api()
      .post('/chat/00000000-0000-4000-8000-000000000000/message/send')
      .send({ senderId: outsider.id, text: 'hey' });
    expect(missing.status).toBe(404);
  });

  it('keeps the latest messages when limited and pages back with before', async () => {
    const { a, chatId } = await pair();
    for (const text of ['1', '2', '3', '4', '5']) {
      await sendMessage(chatId, a.id, text);
    }

    const latest = await api().get(`/chat/${chatId}/messages?limit=2`);
    expect(latest.body.messages.map((m: { text: string }) => m.text)).toEqual(['4', '5']);

    const older = await api().get(`/chat/${chatId}/messages?limit=2&before=${latest.body.messages[0].createdAt}`);
    expect(older.body.messages.map((m: { text: string }) => m.text)).toEqual(['2', '3']);

    expect((await api().get(`/chat/${chatId}/messages?limit=0`)).status).toBe(400);
    expect((await api().get(`/chat/${chatId}/messages?before=yesterday`)).status).toBe(400);
  });

  it('records who read a message', async () => {
    const { a, b, chatId } = await pair();
    const message = await sendMessage(chatId, a.id, 'read me');

    const res = await api().post(`/chat/${chatId}/message/${message.id}/read`).send({ userId: b.id });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.readBy)).toEqual([b.id]);

    const listed = await api().get(`/chat/${chatId}/messages`);
    expect(listed.body.messages[0].readBy[b.id]).toBe(res.body.readBy[b.id]);

    const outsider = await createUser('Neha');
    const forbidden = await api().post(`/chat/${chatId}/message/${message.id}/read`).send({ userId: outsider.id });
    expect(forbidden.status).toBe(403);

    const unknown = await api().post(`/chat/${chatId}/message/nope/read`).send({ userId: b.id });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('tracks the last seen message per user and never moves it backwards', async () => {
    const { a, b, chatId } = await pair();
    const first = await sendMessage(chatId, a.id, 'one');
    const second = await sendMessage(chatId, a.id, 'two');

    const seen = await api().post(`/chat/${chatId}/lastseen`).send({ userId: b.id, messageId: second.id });
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({ chatId, userId: b.id, lastSeenMessageId: second.id });

    // an older pointer coming in late must not undo the newer one
    const stale = await api().post(`/chat/${chatId}/lastseen`).send({ userId: b.id, messageId: first.id });
    expect(stale.body.lastSeenMessageId).toBe(second.id);

    await api().post(`/chat/${chatId}/lastseen`).send({ userId: a.id, messageId: first.id });
    const all = await api().get(`/chat/${chatId}/lastseen`);
    expect(all.body.members).toHaveLength(2);
    expect(all.body.members.find((m: { userId: string }) => m.userId === a.id).lastSeenMessageId).toBe(first.id);

    const missing = await api().post(`/chat/${chatId}/lastseen`).send({ userId: b.id, messageId: 'nope' });
    expect(missing.status).toBe(404);
  });

  it('validates the message body', async () => {
    const { a, chatId } = await pair();
    const empty = await api().post(`/chat/${chatId}/message/send`).send({ senderId: a.id, text: '  ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.details[0].field).toBe('text');

    const noSender = await api().post(`/chat/${chatId}/message/send`).send({ text: 'x' });
    expect(noSender.body.error.details[0].field).toBe('senderId');
  });
});
