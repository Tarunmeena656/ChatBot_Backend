import { Router } from 'express';
import * as chat from '../controllers/chat';
import * as message from '../controllers/message';
import { validate } from '../middleware/validate';
import { addMembersBody, createChatBody, createGroupBody, renameGroupBody } from '../schemas/chat';
import { chatIdParam, memberParams, messageParams } from '../schemas/common';
import {
  deleteMessageBody,
  editMessageBody,
  lastSeenBody,
  listMessagesQuery,
  markReadBody,
  sendMessageBody,
} from '../schemas/message';

export const chatRouter = Router();

const chatId = validate(chatIdParam, 'params');
const messageIds = validate(messageParams, 'params');

// chats (postgres)
chatRouter.post('/create', validate(createChatBody), chat.create);
chatRouter.post('/group', validate(createGroupBody), chat.createGroup);
chatRouter.get('/:chatId', chatId, chat.get);
chatRouter.patch('/:chatId', chatId, validate(renameGroupBody), chat.rename);
chatRouter.post('/:chatId/members', chatId, validate(addMembersBody), chat.addMembers);
chatRouter.delete('/:chatId/members/:userId', validate(memberParams, 'params'), chat.removeMember);

// messages, read receipts and last seen (firestore)
chatRouter.post('/:chatId/message/send', chatId, validate(sendMessageBody), message.send);
chatRouter.get('/:chatId/messages', chatId, validate(listMessagesQuery, 'query'), message.list);
chatRouter.post('/:chatId/message/:messageId/read', messageIds, validate(markReadBody), message.markRead);
chatRouter.patch('/:chatId/message/:messageId', messageIds, validate(editMessageBody), message.edit);
chatRouter.delete('/:chatId/message/:messageId', messageIds, validate(deleteMessageBody), message.remove);
chatRouter.post('/:chatId/lastseen', chatId, validate(lastSeenBody), message.updateLastSeen);
chatRouter.get('/:chatId/lastseen', chatId, message.listLastSeen);
