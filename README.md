# Chat (Next.js)

A ChatGPT-style chat interface built with Next.js 14 (App Router + TypeScript).

## What it does

- Chat UI where you type a question and get a reply, like ChatGPT.
- Every message sends `{ question, session_id }` to `/api/chat`, which forwards it
  to your backend's `POST {BACKEND_API_URL}/chat` endpoint.
- An **Update data** button in the top bar sends `{ session_id }` to `/api/update`,
  which forwards it to your backend's `POST {BACKEND_API_URL}/update` endpoint.
- A session id is generated once per browser (stored in `localStorage`) and reused
  for every message and every update call.

## Setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```
BACKEND_API_URL=https://your-backend.example.com
BACKEND_API_KEY=            # optional, sent as "Authorization: Bearer <key>"
```

Run it:

```bash
npm run dev
```

Open http://localhost:3000.

## Backend contract

Your backend must expose:

**`POST {BACKEND_API_URL}/chat`**
Request body:
```json
{ "question": "string", "session_id": "string" }
```
Expected response body:
```json
{ "answer": "string" }
```

**`POST {BACKEND_API_URL}/update`**
Request body:
```json
{ "session_id": "string" }
```
Expected response body:
```json
{ "success": true }
```

If your backend's response shapes differ, adjust the types in `lib/types.ts` and
how the response is read in `app/page.tsx` (`data.answer`) and
`components/TopBar.tsx` / `app/page.tsx` (`data.success`).

## Project structure

```
app/
  api/chat/route.ts     -> proxies to {BACKEND_API_URL}/chat
  api/update/route.ts   -> proxies to {BACKEND_API_URL}/update
  page.tsx              -> chat UI (client component)
  layout.tsx
  globals.css
components/
  MessageBubble.tsx
  TypingIndicator.tsx
  Composer.tsx           -> message input box
  TopBar.tsx              -> header with "Update data" button
lib/
  backend.ts              -> server-side fetch helper (adds auth header)
  types.ts
```

## Notes

- The browser never talks to your backend directly — it always goes through the
  Next.js API routes in `app/api/*`, so `BACKEND_API_KEY` stays server-side only.
- Enter sends the message, Shift+Enter adds a new line.
- Build for production with `npm run build && npm start`.
# completed-chat-bot
