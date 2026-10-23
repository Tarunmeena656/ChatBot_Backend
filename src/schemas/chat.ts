import { z } from 'zod';
import { uuid } from './common';

const groupName = z.string().trim().min(1).max(100);
const userIds = z.array(uuid).min(1).max(100);

export const createChatBody = z
  .object({ userAId: uuid, userBId: uuid })
  .refine((body) => body.userAId !== body.userBId, {
    message: 'userAId and userBId must be different users',
    path: ['userBId'],
  });

export const createGroupBody = z.object({
  name: groupName,
  createdBy: uuid,
  memberIds: userIds,
});

export const renameGroupBody = z.object({ name: groupName });

export const addMembersBody = z.object({ userIds });
