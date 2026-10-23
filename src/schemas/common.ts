import { z } from 'zod';

export const uuid = z.uuid();

export const chatIdParam = z.object({ chatId: uuid });
export const userIdParam = z.object({ userId: uuid });
export const memberParams = z.object({ chatId: uuid, userId: uuid });
export const messageParams = z.object({ chatId: uuid, messageId: z.string().min(1).max(100) });

export type ChatIdParam = z.infer<typeof chatIdParam>;
export type UserIdParam = z.infer<typeof userIdParam>;
export type MemberParams = z.infer<typeof memberParams>;
export type MessageParams = z.infer<typeof messageParams>;
