import { z } from 'zod';
import { uuid } from './common';

const userIds = z.array(uuid).min(1).max(100);

export const createChatBody = z
  .object({ userAId: uuid, userBId: uuid })
  .refine((body) => body.userAId !== body.userBId, {
    message: 'userAId and userBId must be different users',
    path: ['userBId'],
  });

export const createGroupBody = z.object({
  name: z.string().trim().min(1).max(100),
  createdBy: uuid,
  memberIds: userIds,
});

export const addMembersBody = z.object({ userIds });
