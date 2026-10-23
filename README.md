# Chat Backend

Chat API built with Node.js + TypeScript. Users, chats and chat members live in PostgreSQL. Messages,
read receipts and "last seen" pointers live in Firebase Firestore.

Supports 1:1 chats, sending messages, ordered message history, read receipts, last seen tracking, and
(bonus) group chats with member management plus message edit/delete.

## Stack

- Node 22, Express 5, TypeScript in strict mode
- PostgreSQL through `pg` with plain SQL (schema in `sql/schema.sql`)
- Firebase Firestore through `firebase-admin`
- `zod` for request validation, `pino` for logging
- `vitest` + `supertest` for tests, run against a real Postgres and the Firestore emulator

## Running it

```bash
npm install
docker compose up -d          # postgres with the `chat` and `chat_test` databases (or use your own, see .env)
cp .env.example .env
npm run migrate               # creates the tables
npm run emulator              # Firestore emulator on 127.0.0.1:8080 (needs Java 17+), keep it running
npm run dev                   # api on http://localhost:3000
```

`curl localhost:3000/health` should answer `{"status":"ok"}`.

To use a real Firebase project instead of the emulator: remove `FIRESTORE_EMULATOR_HOST` from `.env`, set
`FIREBASE_PROJECT_ID` and point `FIREBASE_SERVICE_ACCOUNT` at the service account json from the Firebase
console. Nothing in the code changes.

Other scripts: `npm run build` / `npm start` (compiled), `npm run typecheck`, `npm run format`.

## Tests

```bash
npm test
```

This boots the Firestore emulator, applies the schema to the `chat_test` database and runs 19 tests covering
every endpoint, including the concurrent create-chat case. `.env.test` points at the docker Postgres; to use
another one run `DATABASE_URL=postgresql://... npm test`.

There is also a Postman collection in `postman/` with the whole flow (setup users, required APIs, bonus
APIs, error cases). It stores the ids in collection variables, so just run it top to bottom.

## API

All bodies are JSON. Ids for users and chats are UUIDs from Postgres, message ids are Firestore document ids.

### Required

| Method | Path                                    | Body / query                     | Returns                                                       |
| ------ | --------------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| POST   | `/chat/create`                          | `userAId`, `userBId`             | `{ chatId, created }` (201 when new, 200 when it existed)     |
| POST   | `/chat/:chatId/message/send`            | `senderId`, `text`               | the message (201)                                             |
| GET    | `/chat/:chatId/messages?limit=50`       | `limit` 1-100, optional `before` | `{ messages }` oldest first                                   |
| POST   | `/chat/:chatId/message/:messageId/read` | `userId`                         | the message with `readBy[userId]` set to the read time        |
| POST   | `/chat/:chatId/lastseen`                | `userId`, `messageId`            | `{ chatId, userId, lastSeenMessageId, updatedAt }`            |
| GET    | `/user/:userId/chats`                   |                                  | `{ chats: [{ id, type, name, createdBy, memberIds, createdAt }] }` |

`before` takes a message `createdAt` and returns the messages older than it, so a client pages backwards by
passing the `createdAt` of the first message it already has.

### Bonus

| Method | Path                               | Body                              | Notes                                          |
| ------ | ---------------------------------- | --------------------------------- | ---------------------------------------------- |
| POST   | `/chat/group`                      | `name`, `createdBy`, `memberIds`  | creator is always a member                     |
| PATCH  | `/chat/:chatId`                    | `name`                            | rename a group                                 |
| POST   | `/chat/:chatId/members`            | `userIds`                         | add members (groups only)                      |
| DELETE | `/chat/:chatId/members/:userId`    |                                   | remove a member (groups only)                  |
| PATCH  | `/chat/:chatId/message/:messageId` | `senderId`, `text`                | edit own message, sets `editedAt`              |
| DELETE | `/chat/:chatId/message/:messageId` | `senderId`                        | soft delete own message (`deleted: true`)      |

### Helpers

| Method | Path                     | Body   | Notes                                     |
| ------ | ------------------------ | ------ | ----------------------------------------- |
| POST   | `/user`                  | `name` | create a user to test with                |
| GET    | `/user/:userId`          |        |                                           |
| GET    | `/chat/:chatId`          |        | chat with its member ids                  |
| GET    | `/chat/:chatId/lastseen` |        | last seen pointer of every member         |
| GET    | `/health`                |        |                                           |

### Errors

Every error has the same shape:

```json
{ "error": { "code": "NOT_A_MEMBER", "message": "User is not a member of this chat", "details": null } }
```

Codes: `VALIDATION_ERROR` (400, `details` lists the fields), `NOT_A_GROUP` (400), `NOT_A_MEMBER` (403),
`NOT_SENDER` (403), `USER_NOT_FOUND` / `CHAT_NOT_FOUND` / `MESSAGE_NOT_FOUND` (404), `MESSAGE_DELETED` (409).

### Example

```bash
A=$(curl -s localhost:3000/user -H 'content-type: application/json' -d '{"name":"Aditi"}' | jq -r .id)
B=$(curl -s localhost:3000/user -H 'content-type: application/json' -d '{"name":"Vikram"}' | jq -r .id)

CHAT=$(curl -s localhost:3000/chat/create -H 'content-type: application/json' \
  -d "{\"userAId\":\"$A\",\"userBId\":\"$B\"}" | jq -r .chatId)

MSG=$(curl -s localhost:3000/chat/$CHAT/message/send -H 'content-type: application/json' \
  -d "{\"senderId\":\"$A\",\"text\":\"hi\"}" | jq -r .id)

curl -s localhost:3000/chat/$CHAT/message/$MSG/read -H 'content-type: application/json' -d "{\"userId\":\"$B\"}"
curl -s localhost:3000/chat/$CHAT/lastseen -H 'content-type: application/json' -d "{\"userId\":\"$B\",\"messageId\":\"$MSG\"}"
curl -s "localhost:3000/chat/$CHAT/messages?limit=50"
curl -s localhost:3000/user/$A/chats
```

## Data model

PostgreSQL (`sql/schema.sql`):

```
users         id, name, created_at
chats         id, type ('direct' | 'group'), name, created_by, direct_key, created_at
chat_members  chat_id, user_id, joined_at        primary key (chat_id, user_id)
```

`direct_key` is `"<smaller user id>:<larger user id>"` for 1:1 chats and has a unique index, so the same two
users can never end up with two chats, even if they both hit `/chat/create` at the same moment. Groups leave
it null.

Firestore:

```
chats/{chatId}/messages/{messageId}   chatId, senderId, text, createdAt, editedAt, deleted, readBy { userId: readAt }
chats/{chatId}/members/{userId}       lastSeenMessageId, lastSeenMessageAt, updatedAt
```

## Decisions worth knowing

- **Postgres is the source of truth for who is in a chat.** Every message endpoint first checks the chat
  exists and the user is a member (one query), then talks to Firestore. Firestore never decides access.
- **Create-or-get is race safe.** Select by `direct_key`, then `insert ... on conflict do nothing` inside a
  transaction and re-select if the insert lost. There is a test that fires six creates at once.
- **Message order** comes from `createdAt`, which the API sets when it writes the message. Listing queries
  Firestore newest-first with the limit so you always get the latest N, then flips them into reading order.
- **Read receipts are a map on the message** (`readBy.<userId> = time`). One document read returns the
  message together with everyone who read it. The update uses a `FieldPath` because user ids contain dashes.
- **Last seen never moves backwards.** The member document stores the `createdAt` of the last seen message;
  a late request pointing at an older message is ignored and the current pointer is returned.
- **Delete is a soft delete.** The message keeps its place (and its id, so last seen pointers stay valid) but
  loses its text and gets `deleted: true`. Deleted messages cannot be edited again.
- **No authentication**, as in the brief: the acting user is passed as `userId` / `senderId`. In a real
  deployment this would come from a verified token instead of the body.
- **Layout:** `routes` (paths + validation) → `controllers` (read the request, send the response) →
  `services` (`chats.ts`, `users.ts` talk to Postgres, `messages.ts` talks to Firestore).
