import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { firestore } from '../firebase';
import { AppError } from '../middleware/errors';

// chats/{chatId}/messages/{messageId}
type MessageDoc = {
  chatId: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
  editedAt: Timestamp | null;
  deleted: boolean;
  // userId -> when that user read the message
  readBy: Record<string, Timestamp>;
};

// chats/{chatId}/members/{userId}
type LastSeenDoc = {
  lastSeenMessageId: string;
  // createdAt of that message, kept so the pointer never moves backwards
  lastSeenMessageAt: Timestamp;
  updatedAt: Timestamp;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  readBy: Record<string, string>;
};

const messages = (chatId: string) => firestore.collection('chats').doc(chatId).collection('messages');
const members = (chatId: string) => firestore.collection('chats').doc(chatId).collection('members');

const iso = (ts: Timestamp) => ts.toDate().toISOString();

function toMessage(id: string, doc: MessageDoc): Message {
  const readBy: Record<string, string> = {};
  for (const [userId, at] of Object.entries(doc.readBy)) {
    readBy[userId] = iso(at);
  }
  return {
    id,
    chatId: doc.chatId,
    senderId: doc.senderId,
    text: doc.text,
    createdAt: iso(doc.createdAt),
    editedAt: doc.editedAt ? iso(doc.editedAt) : null,
    deleted: doc.deleted,
    readBy,
  };
}

function toLastSeen(chatId: string, userId: string, doc: LastSeenDoc) {
  return { chatId, userId, lastSeenMessageId: doc.lastSeenMessageId, updatedAt: iso(doc.updatedAt) };
}

async function getMessageDoc(chatId: string, messageId: string) {
  const snap = await messages(chatId).doc(messageId).get();
  if (!snap.exists) {
    throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
  }
  return { ref: snap.ref, data: snap.data() as MessageDoc };
}

export async function sendMessage(chatId: string, senderId: string, text: string): Promise<Message> {
  const ref = messages(chatId).doc();
  const doc: MessageDoc = {
    chatId,
    senderId,
    text,
    createdAt: Timestamp.now(),
    editedAt: null,
    deleted: false,
    readBy: {},
  };
  await ref.set(doc);
  return toMessage(ref.id, doc);
}

export async function listMessages(chatId: string, limit: number, before?: Date): Promise<Message[]> {
  let q = messages(chatId).orderBy('createdAt', 'desc').limit(limit);
  if (before) {
    q = q.where('createdAt', '<', Timestamp.fromDate(before));
  }
  const snap = await q.get();
  // newest first so limit keeps the latest ones, then back into reading order
  return snap.docs.map((d) => toMessage(d.id, d.data() as MessageDoc)).reverse();
}

export async function markRead(chatId: string, messageId: string, userId: string): Promise<Message> {
  const { ref, data } = await getMessageDoc(chatId, messageId);
  const readAt = Timestamp.now();
  // FieldPath because user ids contain dashes, which a dotted string path would reject
  await ref.update(new FieldPath('readBy', userId), readAt);
  return toMessage(messageId, { ...data, readBy: { ...data.readBy, [userId]: readAt } });
}

export async function updateLastSeen(chatId: string, userId: string, messageId: string) {
  const { data: message } = await getMessageDoc(chatId, messageId);
  const ref = members(chatId).doc(userId);
  const current = (await ref.get()).data() as LastSeenDoc | undefined;
  if (current && current.lastSeenMessageAt.toMillis() > message.createdAt.toMillis()) {
    return toLastSeen(chatId, userId, current);
  }
  const next: LastSeenDoc = {
    lastSeenMessageId: messageId,
    lastSeenMessageAt: message.createdAt,
    updatedAt: Timestamp.now(),
  };
  await ref.set(next);
  return toLastSeen(chatId, userId, next);
}

export async function listLastSeen(chatId: string) {
  const snap = await members(chatId).get();
  return snap.docs.map((d) => toLastSeen(chatId, d.id, d.data() as LastSeenDoc));
}

function assertCanChange(message: MessageDoc, senderId: string) {
  if (message.senderId !== senderId) {
    throw new AppError(403, 'NOT_SENDER', 'Only the sender can change a message');
  }
  if (message.deleted) {
    throw new AppError(409, 'MESSAGE_DELETED', 'Message was deleted');
  }
}

export async function editMessage(chatId: string, messageId: string, senderId: string, text: string) {
  const { ref, data } = await getMessageDoc(chatId, messageId);
  assertCanChange(data, senderId);
  const editedAt = Timestamp.now();
  await ref.update({ text, editedAt });
  return toMessage(messageId, { ...data, text, editedAt });
}

// soft delete so ordering and last seen pointers keep working
export async function deleteMessage(chatId: string, messageId: string, senderId: string) {
  const { ref, data } = await getMessageDoc(chatId, messageId);
  assertCanChange(data, senderId);
  await ref.update({ text: '', deleted: true });
  return toMessage(messageId, { ...data, text: '', deleted: true });
}
