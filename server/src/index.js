/** Backend entry point: creates the HTTP/Express server, configures Socket.IO, and starts listening. */
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import initializeSocket from "./socket/index.js";
import { redis, nodeId } from "./cluster/redis.js"; // [SCALING] Select standalone versus registered cluster behavior.
import { drainInstance, startInstanceRegistry } from "./cluster/instanceRegistry.js"; // [SCALING] Advertise ownership and drain on shutdown.

// Create the Express app and underlying HTTP server; Socket.IO attaches to this same server.
const app = express();
const server = http.createServer(app);

// Allow browser requests to reach the HTTP endpoints.
app.use(cors());

// Configure Socket.IO, including browser-origin access and temporary connection recovery.
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", // [SCALING] Allow per-deployment browser origins.
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 20000,
    skipMiddlewares: true,
  },
});

// Lightweight health endpoint for checking whether the server process responds.
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Register the application connection and game-event handlers.
initializeSocket(io);

// Use the deployment-provided port when available; otherwise use the local development port.
const PORT = Number(process.env.PORT || 3000);

// [SCALING] Register ownership only when Redis is configured; standalone behavior remains unchanged.
server.listen(PORT, () => {
  console.log(`DoodleDash server running on http://localhost:${PORT}`);
  if (redis) startInstanceRegistry(process.env.PUBLIC_URL || `http://localhost:${PORT}`);
});

// [SCALING] Stop new assignments first, then let local rooms drain for up to five minutes.
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[cluster] ${signal} received; draining ${nodeId}`);
  if (redis) await drainInstance(server, io);
  else {
    server.close();
    io.close();
  }
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
