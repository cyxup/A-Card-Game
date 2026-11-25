/**
 * Live WebSocket smoke test. Requires the dev server and database to be up.
 * Run with: npm run test:e2e
 */
import assert from "node:assert/strict";
import WebSocket from "ws";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const PASSWORD = process.env.E2E_PASSWORD ?? "password123";
const USER_A = process.env.E2E_USER_A ?? "ownertest";
const USER_B = process.env.E2E_USER_B ?? "betauser";

async function login(username) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  assert.equal(response.status, 200, `login failed for ${username}`);
  const raw = response.headers.getSetCookie()[0];
  assert.ok(raw, `no session cookie for ${username}`);
  return raw.split(";")[0];
}

function connect(cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${BASE.replace(/^http/, "ws")}/ws`, { headers: { cookie } });
    const messages = [];
    socket.on("message", (data) => messages.push(JSON.parse(String(data))));
    socket.once("open", () => resolve({ socket, messages }));
    socket.once("error", reject);
  });
}

function waitFor(messages, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const found = messages.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - started > timeout) return reject(new Error("timed out waiting for a WebSocket message"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

const health = await fetch(`${BASE}/api/health`).then((response) => response.json());
assert.equal(health.ok, true);

const a = await connect(await login(USER_A));
const b = await connect(await login(USER_B));

a.socket.send(JSON.stringify({ t: "create", rules: { maxPlayers: 4 }, visibility: "private" }));
const created = await waitFor(a.messages, (message) => message.t === "room");
const code = created.room.code;
assert.equal(created.room.phase, "lobby");

b.socket.send(JSON.stringify({ t: "join", code }));
const joined = await waitFor(b.messages, (message) => message.t === "room" && message.room.players.length === 2);
assert.equal(joined.room.players.length, 2);

a.socket.send(JSON.stringify({ t: "chat", lineId: "essentials-nice-one" }));
await waitFor(b.messages, (message) => message.t === "chat" && message.lineId === "essentials-nice-one");

a.socket.send(JSON.stringify({ t: "start" }));
const playing = await waitFor(a.messages, (message) => message.t === "room" && message.room.phase === "playing");
assert.equal(playing.room.game?.phase, "playing");

a.socket.send(JSON.stringify({ t: "leave" }));
b.socket.send(JSON.stringify({ t: "leave" }));
a.socket.close();
b.socket.close();

console.log("E2E WebSocket smoke test passed");
