/** [SCALING] Separate directory gateway: atomically reserves the least-loaded live owner and resolves room codes. */
import express from "express";
import cors from "cors";
import Redis from "ioredis";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
const PORT = Number(process.env.GATEWAY_PORT || 4000);

// [SCALING] One Lua transaction chooses a live least-loaded node, removes dead entries, and reserves one slot.
const assignScript = `
local candidates = redis.call('ZRANGE', 'nodes:load', 0, 0)
while #candidates > 0 do
  local id = candidates[1]
  local metadata = redis.call('GET', 'node:' .. id)
  if metadata then
    redis.call('ZINCRBY', 'nodes:load', 1, id)
    return {id, metadata}
  end
  redis.call('ZREM', 'nodes:load', id)
  candidates = redis.call('ZRANGE', 'nodes:load', 0, 0)
end
return nil
`;

app.post("/assign", async (req, res) => {
  if (!redis) return res.status(503).json({ error: "No live nodes" });
  try {
    const result = await redis.eval(assignScript, 0);
    if (!result) return res.status(503).json({ error: "No live nodes" });
    const [nodeId, metadata] = result;
    return res.json({ nodeId, url: JSON.parse(metadata).url });
  } catch (error) {
    console.error("[gateway] assignment failed:", error);
    return res.status(503).json({ error: "No live nodes" });
  }
});
app.get("/route/:code", async (req, res) => {
  if (!redis) return res.status(404).json({ error: "Room not found" });
  try {
    const owner = await redis.get(`room:${req.params.code.toUpperCase()}`);
    if (!owner) return res.status(404).json({ error: "Room not found" });
    const metadata = await redis.get(`node:${owner}`);
    if (!metadata) return res.status(404).json({ error: "Room not found" });
    return res.json({ nodeId: owner, url: JSON.parse(metadata).url });
  } catch (error) {
    console.error("[gateway] route lookup failed:", error);
    return res.status(404).json({ error: "Room not found" });
  }
});
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`DoodleDash gateway running on http://localhost:${PORT}`));
