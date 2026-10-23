import { beforeEach, describe, expect, it } from 'vitest';
import { api, createChat, createUser, resetAll } from './helpers';

beforeEach(resetAll);

const unknownId = '00000000-0000-4000-8000-000000000000';

describe('POST /chat/create', () => {
  it('creates one chat per pair of users, whichever order the ids come in', async () => {
    const a = await createUser('Aditi');
    const b = await createUser('Vikram');

    const first = await api().post('/chat/create').send({ userAId: a.id, userBId: b.id });
    expect(first.status).toBe(200);
    expect(first.body.chatId).toBeTruthy();

    const again = await api().post('/chat/create').send({ userAId: b.id, userBId: a.id });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ chatId: first.body.chatId });

    const chats = await api().get(`/user/${a.id}/chats`);
    expect(chats.body.chats).toHaveLength(1);
    expect(chats.body.chats[0].type).toBe('direct');
    expect(chats.body.chats[0].memberIds.sort()).toEqual([a.id, b.id].sort());
  });

  it('refuses a chat with yourself or with an unknown user', async () => {
    const a = await createUser('Aditi');

    const self = await api().post('/chat/create').send({ userAId: a.id, userBId: a.id });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('VALIDATION_ERROR');
    expect(self.body.error.details[0].field).toBe('userBId');

    const ghost = await api().post('/chat/create').send({ userAId: a.id, userBId: unknownId });
    expect(ghost.status).toBe(404);
    expect(ghost.body.error.code).toBe('USER_NOT_FOUND');

    const bad = await api().post('/chat/create').send({ userAId: 'abc', userBId: a.id });
    expect(bad.status).toBe(400);
  });

  it('gives concurrent requests for the same pair the same chat', async () => {
    const a = await createUser('Aditi');
    const b = await createUser('Vikram');

    const results = await Promise.all(
      Array.from({ length: 6 }, () => api().post('/chat/create').send({ userAId: a.id, userBId: b.id })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.chatId)).size).toBe(1);

    const chats = await api().get(`/user/${a.id}/chats`);
    expect(chats.body.chats).toHaveLength(1);
  });
});

describe('GET /user/:userId/chats', () => {
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
  });

  it('is empty for a user without chats and 404 for an unknown user', async () => {
    const a = await createUser('Aditi');
    expect((await api().get(`/user/${a.id}/chats`)).body.chats).toEqual([]);

    const res = await api().get(`/user/${unknownId}/chats`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
    expect((await api().get('/user/not-a-uuid/chats')).status).toBe(400);
  });
});
