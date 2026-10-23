# Chat Backend

Chat API with Node.js + TypeScript. Users, chats and members are stored in PostgreSQL. Messages,
read receipts and last seen pointers are stored in Firebase Firestore.

## Stack

- Node 22, Express 5, TypeScript (strict)
- PostgreSQL with `pg` (schema in `sql/schema.sql`)
- Firebase Firestore with `firebase-admin`
- `zod` for validation
- `vitest` + `supertest` for tests, run against Postgres and the Firestore emulator

## Setup

```bash
npm install
createdb chat && createdb chat_test       # or create them in pgAdmin
cp .env.example .env                      # set DATABASE_URL
npm run migrate                           # create tables
npm run seed                              # 3 sample users, prints their ids
npm run emulator                          # Firestore emulator (needs Java 17+), keep running
npm run dev                               # http://localhost:3000
```

To use a real Firebase project: remove `FIRESTORE_EMULATOR_HOST` from `.env`, set `FIREBASE_PROJECT_ID`
and point `FIREBASE_SERVICE_ACCOUNT` at the service account json from the Firebase console.

## Tests

```bash
npm test
```

Starts the emulator, applies the schema to `chat_test` and runs the suite (every endpoint, the Firestore
document layout, and six parallel `/chat/create` calls for the same pair). `.env.test` has the database
URL; override with `DATABASE_URL=... npm test`.

Postman: import `postman/chat-backend.postman_collection.json`, paste the three ids from `npm run seed`
into the `userA`, `userB`, `userC` variables and run the folders top to bottom.

## API

User and chat ids are UUIDs from Postgres. Message ids are Firestore document ids.

| Method | Path                                    | Body                  | Response                                      |
| ------ | --------------------------------------- | --------------------- | --------------------------------------------- |
| POST   | `/chat/create`                          | `userAId`, `userBId`  | `{ chatId }` (same chatId for the same pair)  |
| POST   | `/chat/:chatId/message/send`            | `senderId`, `text`    | the message (201)                             |
| GET    | `/chat/:chatId/messages?limit=50`       |                       | `{ messages }` ordered by `createdAt`         |
| POST   | `/chat/:chatId/message/:messageId/read` | `userId`              | the message with `readBy[userId]`             |
| POST   | `/chat/:chatId/lastseen`                | `userId`, `messageId` | `{ chatId, userId, lastSeenMessageId, updatedAt }` |
| GET    | `/user/:userId/chats`                   |                       | `{ chats: [{ id, type, name, memberIds, createdAt }] }` |

Bonus:

| Method | Path                               | Body                             | Response                                |
| ------ | ---------------------------------- | -------------------------------- | --------------------------------------- |
| POST   | `/chat/group`                      | `name`, `createdBy`, `memberIds` | `{ chatId }` (201)                      |
| POST   | `/chat/:chatId/members`            | `userIds`                        | the chat with `memberIds`               |
| DELETE | `/chat/:chatId/members/:userId`    |                                  | the chat with `memberIds`               |
| PATCH  | `/chat/:chatId/message/:messageId` | `senderId`, `text`               | the edited message (`editedAt` set)     |
| DELETE | `/chat/:chatId/message/:messageId` | `senderId`                       | the message with `deleted: true`        |

Message:

```json
{
  "id": "PdPqWLGVqROMZs0Hx17s",
  "chatId": "35e7dbcf-5134-4ce5-841a-c56a5704a64b",
  "senderId": "40e5d288-c274-4cef-922b-084394d6ec9b",
  "text": "hi",
  "createdAt": "2026-10-23T08:10:12.345Z",
  "editedAt": null,
  "deleted": false,
  "readBy": { "e2329ab3-a554-475a-a8e2-8aa880ab7fa9": "2026-10-23T08:10:20.001Z" }
}
```

Errors:

```json
{ "error": { "code": "NOT_A_MEMBER", "message": "User is not a member of this chat" } }
```

`VALIDATION_ERROR` 400 (with `details` per field), `NOT_A_GROUP` 400, `NOT_A_MEMBER` 403, `NOT_SENDER` 403,
`USER_NOT_FOUND` / `CHAT_NOT_FOUND` / `MESSAGE_NOT_FOUND` 404, `MESSAGE_DELETED` 409.

## Data

PostgreSQL:

```
users         id, name, created_at
chats         id, type (direct | group), name, direct_key, created_at
chat_members  chat_id, user_id, joined_at
```

`direct_key` is `"<smaller user id>:<larger user id>"` and is unique, so one pair of users can only have
one 1:1 chat. Creating it is a select, then `insert ... on conflict do nothing` in a transaction, so two
requests at the same time still end up with one chat.

Firestore:

```
chats/{chatId}/messages/{messageId}   chatId, senderId, text, createdAt, editedAt, deleted, readBy { userId: readAt }
chats/{chatId}/members/{userId}       lastSeenMessageId, updatedAt
```

Membership is checked in Postgres before any message operation. Messages are listed newest first with
the limit and then reversed, so `limit=50` always gives the latest 50 in order. Delete is a soft delete so
the message keeps its position and id.

Code layout: `src/routes` (paths + validation) -> `src/controllers` -> `src/services` (`chats.ts`,
`users.ts` for Postgres, `messages.ts` for Firestore).
