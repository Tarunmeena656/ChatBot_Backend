import { Db, pool, query, queryOne, transaction } from '../db';
import { AppError } from '../middleware/errors';
import { assertUsersExist, getUser } from './users';

export type Chat = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  createdBy: string | null;
  memberIds: string[];
  createdAt: Date;
};

const chatSelect = `
  select c.id, c.type, c.name, c.created_by as "createdBy", c.created_at as "createdAt",
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
  // one row per user: ($1, $2), ($1, $3), ...
  const values = userIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  return query(
    `insert into chat_members (chat_id, user_id) values ${values} on conflict do nothing`,
    [chatId, ...userIds],
    db,
  );
}

// 1:1 chat between two users. the same pair always gets the same chat back.
export async function getOrCreateDirectChat(userAId: string, userBId: string) {
  await assertUsersExist([userAId, userBId]);
  const key = [userAId, userBId].sort().join(':');

  const existing = await queryOne<{ id: string }>('select id from chats where direct_key = $1', [key]);
  if (existing) {
    return { chatId: existing.id, created: false };
  }

  return transaction(async (client) => {
    const inserted = await queryOne<{ id: string }>(
      `insert into chats (type, direct_key, created_by) values ('direct', $1, $2)
       on conflict (direct_key) do nothing
       returning id`,
      [key, userAId],
      client,
    );
    if (!inserted) {
      // another request created the same chat between our select and insert
      const chat = await queryOne<{ id: string }>('select id from chats where direct_key = $1', [key], client);
      return { chatId: chat!.id, created: false };
    }
    await insertMembers(inserted.id, [userAId, userBId], client);
    return { chatId: inserted.id, created: true };
  });
}

export async function createGroupChat(name: string, createdBy: string, memberIds: string[]) {
  const ids = [...new Set([createdBy, ...memberIds])];
  await assertUsersExist(ids);

  return transaction(async (client) => {
    const chat = await queryOne<{ id: string }>(
      `insert into chats (type, name, created_by) values ('group', $1, $2) returning id`,
      [name, createdBy],
      client,
    );
    await insertMembers(chat!.id, ids, client);
    return { chatId: chat!.id };
  });
}

export async function renameGroup(chatId: string, name: string): Promise<Chat> {
  await getGroupChat(chatId);
  await query('update chats set name = $2 where id = $1', [chatId, name]);
  return getChat(chatId);
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
