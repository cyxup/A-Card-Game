# Stacked

A fast, chaotic card game: **UNO's colour matching** with **Blazing 8s' dirty tricks**.
Match colours, stack draw cards, jump in out of turn, steal hands with Oscar's Swap, and be
the first to go empty. 2–8 players, humans and bots, guests welcome.

Built as a Vite SPA on top of [Plum UI](https://ui.plumsy.dev) with one small, authoritative
Node service that serves the app, the JSON API and the WebSocket. State lives in memory per
room; accounts, cosmetics and match results live in PostgreSQL.

---

## What's in the box

- **Playable multiplayer** — public matchmaking, private tables with 5-letter codes, practice vs bots.
- **The full hybrid ruleset** — UNO deck + Blazing 8s cards (Giddy Up, Wrong Way, Quick Draw, Wild Eight, Oscar's Swap).
- **Host-configurable table rules** — stacking modes, jump-ins, swap-anytime, seven-zero, draw-until-playable, turn timer, seats, starting hand.
- **Accounts and guests** — scrypt password hashing, opaque httpOnly session cookies, rate limits, guest sessions that can be upgraded.
- **Progression** — XP, levels, coins, match rewards, achievements.
- **Cosmetics** — card backs, table felts, avatars, name effects and win effects, visible to everyone at the table.
- **A table that talks back** — opponents' hands are fanned card backs with live counts, cards fly to the discard, the draw deck breathes, seats glow on their turn, and every play/draw/skip lands with a readable action banner.
- **Built to look alive** — CSS cards and a focused set of Motion animations; no bitmap payloads, no canvas, and an optional low-power/reduce-motion escape hatch.
- **Synthesised audio** — tiny WebAudio blips instead of downloaded sound files.
- **Authoritative server** — hands are masked per player, actions are validated by the engine, timers and bots run server-side.

---

## Stack

| | |
|---|---|
| Client | React 19, Vite 7, Tailwind CSS v4, Plum UI, Motion, Wouter |
| Server | Node 22+, Fastify 5, `ws`, Drizzle ORM, `postgres.js` |
| Database | PostgreSQL 17 (managed on InfraFlow) |
| Shared | Pure TypeScript game engine + protocol types |

---

## Repo layout

```
apps/
  web/        Vite SPA (Plum UI components live in src/components/ui)
  server/     Fastify API + WebSocket + game rooms + auth + persistence
packages/
  shared/     Cards, rules, engine, bots, progression, cosmetics, wire types
Dockerfile    Multi-stage production build
docker-compose.yml   Optional local stack (Postgres + app)
```

The engine in `packages/shared/src/game.ts` is pure and deterministic: the server owns the RNG,
the client only renders state. It is covered by unit tests in `packages/shared/test`.

---

## Local development

Requirements: Node 22.12+ and a PostgreSQL 17 instance.

```bash
npm install
cp .env.example .env        # then edit DATABASE_URL
npm run db:migrate          # applies apps/server/drizzle/*.sql
npm run dev                 # shared watcher + API on :8080 + Vite on :5173
```

Open <http://localhost:5173>. Vite proxies `/api` and `/ws` to the server.

Useful scripts:

```bash
npm run dev            # everything
npm run dev:web        # Vite only
npm run dev:server     # API only (expects shared built + DB running)
npm run build          # shared → web → server
npm start              # production server (serves apps/web/dist)
npm test               # engine unit tests (vitest)
npm run typecheck      # all workspaces
npm run db:generate    # generate a migration after editing schema.ts
npm run db:migrate     # apply migrations
```

### Local Postgres without Docker

Any Postgres 17 works. A quick throwaway cluster:

```bash
initdb -D .pgdata -U stacked --auth=trust
pg_ctl -D .pgdata -o "-p 55432" start
createdb -h 127.0.0.1 -p 55432 -U stacked stacked
# DATABASE_URL=postgres://stacked@127.0.0.1:55432/stacked
```

Or use the compose stack:

```bash
docker compose up --build
# http://localhost:8080
```

---

## Deploying on InfraFlow

InfraFlow runs services from a repository (Dockerfile or detected language) and gives each
resource a hostname. You need two resources: a **PostgreSQL database** and the **Stacked service**.

1. **Create the database.** Dashboard → your project → *Add database* → PostgreSQL 17.
   Keep it private. Copy the **pooler** connection string; it is the right one for a web service
   (`postgres://…@…/…?sslmode=require` or the platform's equivalent).
2. **Create the service.** *Add service* → GitHub → pick this repository. Root is the repository
   root; the included `Dockerfile` is used. Port: **8080**.
3. **Variables.**

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the pooler URL from step 1 (or reference the DB variable in the dashboard) |
   | `APP_ORIGIN` | `https://<your-service>.production.infraflow.app` (or your custom domain) |
   | `COOKIE_SECURE` | `true` |
   | `COOKIE_SECRET` | 32+ random characters |
   | `NODE_ENV` | `production` |
   | `MIGRATE_ON_START` | `true` |
   | `WEB_DIST` | `apps/web/dist` |
   | `PORT` | `8080` |

4. **Deploy.** The container runs `node apps/server/dist/index.js`, applies pending migrations,
   then serves the SPA, `/api/*` and `/ws` from the same origin.
5. **Health check:** `GET /api/health` returns `{ "ok": true, "db": "up" }`.
6. **WebSockets:** the client connects to `/ws` on the same origin. InfraFlow's edge and service
   proxy pass WebSocket upgrades; no separate port or service is needed.
7. **Custom domain:** add it in InfraFlow, wait for the certificate, then set `APP_ORIGIN` to that
   exact origin and redeploy.

The database uses `prepare: false` in `postgres.js` so it is compatible with transaction-mode
poolers out of the box.

### Notes for operations

- One Node process holds live rooms in memory. That is deliberate: it is fast and simple. If you
  scale to multiple instances, routes need sticky sessions (or a Redis room layer) — not required
  for a single InfraFlow service.
- Finished matches, accounts, sessions and cosmetics are persisted. Live rooms are not.
- `MIGRATE_ON_START` uses Drizzle's migrator and is idempotent; safe on every boot.
- Sessions are opaque 32-byte tokens; only their SHA-256 is stored. Cookies are `httpOnly`,
  `SameSite=Lax`, `Secure` in production. Mutating API calls reject cross-origin `Origin`s.
- Auth endpoints are rate limited in-memory per IP. Put the platform firewall in front if you
  expect abuse.

---

## Rules in one screen

- **Turn:** play a card matching the table's colour, number or action; or draw one and play it if
  possible. Wilds ignore colour and ask for a new one.
- **Giddy Up (skip)** removes the next player's turn. **Wrong Way (reverse)** flips direction
  (with two players it acts as a skip).
- **Quick Draw (+2)** and **Wild Draw Four** add to a stack. Hosts choose: same card only, mixed
  (+2/+4), or no stacking. The player facing the stack may stack or take it all.
- **Jump in:** for 5 seconds after a card lands, anyone holding the exact same card (same colour,
  same number/action) can play it out of turn.
- **Oscar's Swap:** pick a player and a colour, take their hand. With *swap anytime* enabled it is
  also legal out of turn inside the jump window.
- **Seven-zero (optional):** a 7 swaps hands with the next player; a 0 rotates every hand one seat.
- **Draw until playable (optional):** keep drawing until you find a legal card.
- **Win:** empty your hand. Rewards are paid, the host can deal again instantly.

Guests can play everything, but only accounts keep coins, XP, levels and cosmetics.

---

## API surface

| Route | Purpose |
|---|---|
| `GET /api/session` | current user or guest |
| `POST /api/auth/guest` | start a named guest session |
| `POST /api/auth/register` / `login` / `logout` | accounts |
| `GET /api/me/profile` | user + owned cosmetics + achievements |
| `POST /api/me/cosmetics/buy` / `equip` | shop and loadout |
| `PATCH /api/me` | display name |
| `GET /api/leaderboard` | top 50 by XP |
| `GET /api/rooms` | joinable public lobbies |
| `GET /api/stats` | public counters |
| `GET /api/health` | readiness + DB check |
| `WS /ws` | rooms, actions, emotes |

The WebSocket sends a full, per-player-masked room snapshot on change and nothing in between.
Turn timers are computed from a server deadline on the client, so there is no 10 Hz state spam.
Hands and the drawn card are masked per player; the draw-pile count is public.

---

## Motion & performance

The table is deliberately expressive: Motion springs for layout, a shared-layout flight from
hand to discard, flying card backs for opponent draws, animated seat rings, a turn spotlight and
a readable action banner. It is still a light DOM app:

- Cards are DOM elements styled with CSS; one tree, no canvas, no sprite sheets.
- No background images or video. Fonts are self-hosted Geist with unicode-range subsets, so only
  Latin loads for Latin copy.
- Route-level code splitting: the table (the heaviest screen) is a separate chunk.
- Server broadcasts only on state changes. Turn timers are computed from a deadline field.
- Animations use `motion/react` with shared spring presets; no per-frame loops in application code.
- An in-app **Reduce motion** toggle (Profile ? Performance) turns off springs and flights.
  **Low-power mode** is optional, not auto-forced.
- Audio is synthesised on demand, never downloaded.

---

## Tests

```bash
npm test
```

The suite covers deck construction, matching, wilds, draw stacking, jump-in windows, Oscar's Swap,
turn timeouts, bot legality and rules normalisation. The engine is pure, so more scenarios are
easy to add in `packages/shared/test/game.test.ts`.

---

## Roadmap ideas

- Spectator seats and queueing for the next round.
- Friend lists / persistent parties.
- Daily challenges and a seasonal ladder.
- Replays from stored action logs.
- More cosmetic slots (card faces, table props, emote packs).
- Optional Redis room layer for horizontal scaling.
