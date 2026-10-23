import { Db, pool, query, queryOne, transaction } from '../db';
import { AppError } from '../middleware/errors';
import { assertUsersExist, getUser } from './users';

export type Chat = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  memberIds: string[];
  createdAt: Date;
};

const chatSelect = `
  select c.id, c.type, c.name, c.created_at as "createdAt",
         coalesce(array_agg(m.user_id order by m.joined_at) filter (where m.user_id is not null), '{}') as "memberIds"
  from chats c
  left join chat_members m on m.chat_id = c.id`;

export async function getChat(chatId: string): Promise<Chat> {
  const chat = await queryOne<Chat>(`${chatSelect} where c.id = $1 group by c.id`, [chatId]);
  if (!chat) {
    throw new AppError(404, 'CHAT_NOT_FOUND', 'Chat not found');
  }
  return chat;
}

export async function getChatForMember(chatId: string, userId: string): Promise<Chat> {
  const chat = await getChat(chatId);
  if (!chat.memberIds.includes(userId)) {
    throw new AppError(403, 'NOT_A_MEMBER', 'User is not a member of this chat');
  }
  return chat;
}

async function getGroupChat(chatId: string): Promise<Chat> {
  const chat = await getChat(chatId);
  if (chat.type !== 'group') {
    throw new AppError(400, 'NOT_A_GROUP', 'Members of a 1:1 chat cannot be changed');
  }
  return chat;
}

function insertMembers(chatId: string, userIds: string[], db: Db) {
  const values = userIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  return query(
    `insert into chat_members (chat_id, user_id) values ${values} on conflict do nothing`,
    [chatId, ...userIds],
    db,
  );
}

export async function getOrCreateDirectChat(userAId: string, userBId: string): Promise<string> {
  await assertUsersExist([userAId, userBId]);
  const key = [userAId, userBId].sort().join(':');

  const existing = await queryOne<{ id: string }>('select id from chats where direct_key = $1', [key]);
  if (existing) {
    return existing.id;
  }

  return transaction(async (client) => {
    const inserted = await queryOne<{ id: string }>(
      `insert into chats (type, direct_key) values ('direct', $1)
       on conflict (direct_key) do nothing
       returning id`,
      [key],
      client,
    );
    if (!inserted) {
      const chat = await queryOne<{ id: string }>('select id from chats where direct_key = $1', [key], client);
      return chat!.id;
    }
    await insertMembers(inserted.id, [userAId, userBId], client);
    return inserted.id;
  });
}

export async function createGroupChat(name: string, createdBy: string, memberIds: string[]): Promise<string> {
  const ids = [...new Set([createdBy, ...memberIds])];
  await assertUsersExist(ids);

  return transaction(async (client) => {
    const chat = await queryOne<{ id: string }>(
      `insert into chats (type, name) values ('group', $1) returning id`,
      [name],
      client,
    );
    await insertMembers(chat!.id, ids, client);
    return chat!.id;
  });
}

export async function addMembers(chatId: string, userIds: string[]): Promise<Chat> {
  await getGroupChat(chatId);
  await assertUsersExist(userIds);
  await insertMembers(chatId, userIds, pool);
  return getChat(chatId);
}

export async function removeMember(chatId: string, userId: string): Promise<Chat> {
  await getGroupChat(chatId);
  const removed = await query('delete from chat_members where chat_id = $1 and user_id = $2 returning user_id', [
    chatId,
    userId,
  ]);
  if (!removed.length) {
    throw new AppError(404, 'NOT_A_MEMBER', 'User is not a member of this chat');
  }
  return getChat(chatId);
}

export async function listUserChats(userId: string): Promise<Chat[]> {
  await getUser(userId);
  return query<Chat>(
    `${chatSelect}
     where c.id in (select chat_id from chat_members where user_id = $1)
     group by c.id
     order by c.created_at desc`,
    [userId],
  );
}
