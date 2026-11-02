/** [SCALING] Shared Redis connection and room/load directory helpers; absent REDIS_URL keeps standalone mode a no-op. */
import Redis from "ioredis";

export const redisEnabled = Boolean(process.env.REDIS_URL);
export const redis = redisEnabled ? new Redis(process.env.REDIS_URL) : null;
export const nodeId = process.env.NODE_ID || `node-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

export const updateNodeLoad = async (count) => {
  if (!redis) return;
  await redis.zadd("nodes:load", count, nodeId);
};
