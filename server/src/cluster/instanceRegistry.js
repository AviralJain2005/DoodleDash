/** [SCALING] Advertises this process, refreshes owned-room directory TTLs, and drains gracefully. */
import RoomStore from "../store/RoomStore.js";
import { nodeId, redis, updateNodeLoad } from "./redis.js";

const ROOM_TTL_SECONDS = 60;
const HEARTBEAT_MS = 5000;
const ROOM_REFRESH_MS = 20000;
let heartbeatTimer;
let refreshTimer;
let draining = false;

const logFailure = (label) => (error) => console.error(`[cluster] ${label}:`, error);

export const startInstanceRegistry = (url) => {
  if (!redis) return;
  const heartbeat = async () => {
    try {
      await redis.set(`node:${nodeId}`, JSON.stringify({ url }), "EX", 15);
      await updateNodeLoad(RoomStore.rooms.size);
    } catch (error) {
      logFailure("heartbeat failed")(error);
    }
  };
  const refreshRooms = async () => {
    for (const code of RoomStore.rooms.keys()) {
      redis.expire(`room:${code}`, ROOM_TTL_SECONDS).catch(logFailure(`TTL refresh failed for ${code}`));
    }
  };
  heartbeat();
  refreshRooms();
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  refreshTimer = setInterval(refreshRooms, ROOM_REFRESH_MS);
};

export const deregisterInstance = async () => {
  if (!redis || draining) return;
  draining = true;
  clearInterval(heartbeatTimer);
  clearInterval(refreshTimer);
  await redis.del(`node:${nodeId}`);
  await redis.zrem("nodes:load", nodeId);
};

export const drainInstance = async (server, io, timeoutMs = 5 * 60 * 1000) => {
  await deregisterInstance();
  const deadline = Date.now() + timeoutMs;
  while (RoomStore.rooms.size && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 250));
  server.close();
  io.close();
  if (redis) await redis.quit().catch(logFailure("Redis close failed"));
};
