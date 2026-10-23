import { query, queryOne } from '../db';
import { AppError } from '../middleware/errors';

export async function getUser(id: string) {
  const user = await queryOne<{ id: string; name: string }>('select id, name from users where id = $1', [id]);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  return user;
}

export async function assertUsersExist(ids: string[]) {
  const rows = await query<{ id: string }>('select id from users where id = any($1::uuid[])', [ids]);
  const found = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new AppError(404, 'USER_NOT_FOUND', `Unknown user id: ${missing.join(', ')}`);
  }
}
