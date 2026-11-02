/** [SCALING] End-to-end room-affinity check: launches local cluster processes and verifies allocation, play, and liveness. */
import { spawn } from "node:child_process";
import { io } from "socket.io-client";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const serverDir = fileURLToPath(new URL(".", import.meta.url));
const children = [];
const sockets = [];
const ports = [3001, 3002, 3003];
const gateway = "http://localhost:4000";
const launch = (file, env = {}) => {
  const child = spawn(process.execPath, [file], {
    cwd: serverDir,
    env: { ...process.env, REDIS_URL: redisUrl, ...env },
    stdio: "inherit",
  });
  children.push(child);
  return child;
};
const waitHealth = async (url) => {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
};
const connect = async (url) => {
  const socket = io(url, { timeout: 5000, reconnection: false });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out connecting to ${url}`)), 8000);
    socket.once("connect", () => { clearTimeout(timer); resolve(); });
    socket.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
  });
  return socket;
};
const nextEvent = (socket, event, timeout = 10000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, receive);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    const receive = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(event, receive);
  });
const emitAndWait = (socket, event, payload, response) => {
  const result = nextEvent(socket, response);
  socket.emit(event, payload);
  return result;
};

try {
  launch("src/gateway/index.js", { GATEWAY_PORT: "4000" });
  ports.forEach((port) => launch("src/index.js", {
    NODE_ID: `cluster-test-${port}`,
    PORT: String(port),
    PUBLIC_URL: `http://localhost:${port}`,
  }));
  await Promise.all([waitHealth(gateway), ...ports.map((port) => waitHealth(`http://localhost:${port}`))]);
  await delay(1000);

  const created = [];
  for (let index = 0; index < 3; index++) {
    const allocation = await fetch(`${gateway}/assign`, { method: "POST" });
    if (!allocation.ok) throw new Error(`Assignment failed: ${allocation.status}`);
    const { nodeId, url } = await allocation.json();
    const client = await connect(url);
    const roomCreated = nextEvent(client, "room:created");
    client.emit("room:create", { username: `Creator${index}` });
    const result = await roomCreated;
    created.push({ ...result, nodeId, url, client });
  }
  if (new Set(created.map((entry) => entry.nodeId)).size !== 3)
    throw new Error("Expected room reservations to spread across all three nodes");

  const gameRoom = created.find((entry) => entry.nodeId !== "cluster-test-3001");
  if (!gameRoom) throw new Error("No room was allocated to a non-first node");
  const routeResponse = await fetch(`${gateway}/route/${gameRoom.roomCode.toLowerCase()}`);
  const route = await routeResponse.json();
  if (!routeResponse.ok || route.nodeId !== gameRoom.nodeId)
    throw new Error("Room route did not resolve to its owner");
  const second = await connect(route.url);
  const bothPlayers = nextEvent(second, "room:state");
  second.emit("room:join", { roomCode: gameRoom.roomCode, username: "Joiner" });
  const state = await bothPlayers;
  if (state.players.length !== 2) throw new Error("Joiner did not receive state with both players");

  const drawer = state.players.find((player) => player.id === gameRoom.client.id) ? gameRoom.client : second;
  const guesser = drawer === second ? gameRoom.client : second;
  const started = nextEvent(gameRoom.client, "game:started");
  const choicesReady = nextEvent(drawer, "game:word_choices");
  gameRoom.client.emit("game:start");
  await started;
  const choices = await choicesReady;
  const chosenWord = choices.choices[0];
  const roundStarted = nextEvent(drawer, "game:round_started");
  drawer.emit("game:choose_word", { word: chosenWord });
  await roundStarted;
  const correct = nextEvent(guesser, "game:correct_guess");
  guesser.emit("game:guess", { guess: chosenWord });
  await correct;

  const ownerChild = children[1 + ports.indexOf(Number(new URL(gameRoom.url).port))];
  ownerChild.kill("SIGKILL");
  const routeUntil = Date.now() + 25000;
  let missing = false;
  while (Date.now() < routeUntil) {
    const response = await fetch(`${gateway}/route/${gameRoom.roomCode}`).catch(() => null);
    if (response?.status === 404) { missing = true; break; }
    await delay(500);
  }
  if (!missing) throw new Error("Killed node remained routable after liveness expiry");
  console.log("Cluster test passed: spread, owner routing, game flow, and dead-node cleanup.");
} finally {
  sockets.forEach((socket) => socket.disconnect());
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.all(children.map(async (child) => {
    if (child.exitCode !== null) return;
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(1000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }));
}
