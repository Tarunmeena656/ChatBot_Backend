import { beforeEach, describe, expect, it } from 'vitest';
import { api, createChat, createUser, resetAll } from './helpers';

beforeEach(resetAll);

describe('users', () => {
  it('creates and fetches a user', async () => {
    const created = await api().post('/user').send({ name: 'Aditi' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Aditi' });

    const fetched = await api().get(`/user/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });

  it('rejects an empty name and unknown ids', async () => {
    const bad = await api().post('/user').send({ name: '   ' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.details[0].field).toBe('name');

    expect((await api().get('/user/not-a-uuid')).status).toBe(400);
    expect((await api().get('/user/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('1:1 chats', () => {
  it('creates one chat per pair of users, whichever order the ids come in', async () => {
    const a = await createUser('Aditi');
    const b = await createUser('Vikram');

    const first = await api().post('/chat/create').send({ userAId: a.id, userBId: b.id });
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(true);

    const again = await api().post('/chat/create').send({ userAId: b.id, userBId: a.id });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ chatId: first.body.chatId, created: false });

    const chat = await api().get(`/chat/${first.body.chatId}`);
    expect(chat.body.type).toBe('direct');
    expect(chat.body.memberIds.sort()).toEqual([a.id, b.id].sort());
  });

  it('refuses a chat with yourself or with an unknown user', async () => {
    const a = await createUser('Aditi');

    const self = await api().post('/chat/create').send({ userAId: a.id, userBId: a.id });
    expect(self.status).toBe(400);
    expect(self.body.error.details[0].field).toBe('userBId');

    const ghost = await api()
      .post('/chat/create')
      .send({ userAId: a.id, userBId: '00000000-0000-4000-8000-000000000000' });
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('gives every concurrent request for the same pair the same chat', async () => {
    const a = await createUser('Aditi');
    const b = await createUser('Vikram');

    const results = await Promise.all(
      Array.from({ length: 6 }, () => api().post('/chat/create').send({ userAId: a.id, userBId: b.id })),
    );
    const ids = new Set(results.map((r) => r.body.chatId));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it('lists the chats a user is in with their member ids', async () => {
    const a = await createUser('Aditi');
    const b = await createUser('Vikram');
    const c = await createUser('Neha');
    const ab = await createChat(a.id, b.id);
    const ac = await createChat(a.id, c.id);
    await createChat(b.id, c.id);

    const res = await api().get(`/user/${a.id}/chats`);
    expect(res.status).toBe(200);
    expect(res.body.chats.map((chat: { id: string }) => chat.id).sort()).toEqual([ab, ac].sort());
    const first = res.body.chats.find((chat: { id: string }) => chat.id === ab);
    expect(first.memberIds.sort()).toEqual([a.id, b.id].sort());

    const none = await api().get(`/user/${c.id}/chats`);
    expect(none.body.chats).toHaveLength(2);
    expect((await api().get('/user/00000000-0000-4000-8000-000000000000/chats')).status).toBe(404);
  });

  it('returns 404 for an unknown chat', async () => {
    const res = await api().get('/chat/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CHAT_NOT_FOUND');
  });
});
