import { z } from 'zod';
import { uuid } from './common';

const text = z.string().trim().min(1).max(4000);
const messageId = z.string().min(1).max(100);

export const sendMessageBody = z.object({ senderId: uuid, text });

export const editMessageBody = z.object({ senderId: uuid, text });

export const deleteMessageBody = z.object({ senderId: uuid });

export const markReadBody = z.object({ userId: uuid });

export const lastSeenBody = z.object({ userId: uuid, messageId });

export const listMessagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  // iso timestamp, returns messages older than this. used to page backwards
  before: z.coerce.date().optional(),
});
