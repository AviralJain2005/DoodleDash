/** Room socket handlers: manage room membership, host assignment, spectators, and reconnection grace periods. */
import RoomStore from "../store/RoomStore.js";
import Player from "../game/Player.js";
import { handlePlayerDeparture } from "./game.js";

const reconnectTimers = new Map();
const RECONNECT_GRACE_MS = 20000;
// Send a sanitized snapshot of the room state to every socket in that Socket.IO room.
const broadcastRoomState = (io, room) =>
  io.to(room.roomCode).emit("room:state", room.getState());

// Remove a socket from its room and update the domain model; delete the room if it becomes empty.
const permanentlyLeave = (io, socket) => {
  const roomCode = socket.data.roomCode;
  if (!roomCode) return;
  const room = RoomStore.getRoom(roomCode);
  socket.leave(roomCode);
  socket.data.roomCode = null;
  if (!room) return;
  if (room.isSpectator(socket.id)) room.removeSpectator(socket.id);
  else {
    const wasDrawer = room.removePlayer(socket.id);
    handlePlayerDeparture(io, room, wasDrawer);
  }
  if (room.isEmpty()) return RoomStore.deleteRoom(roomCode);
  broadcastRoomState(io, room);
};

// Convert incoming settings to numbers when possible; Room applies the final supported bounds/defaults.
const validSettings = (value) => ({
  rounds: Number.isFinite(Number(value?.rounds))
    ? Number(value.rounds)
    : undefined,
  drawTimeSeconds: Number.isFinite(Number(value?.drawTimeSeconds))
    ? Number(value.drawTimeSeconds)
    : undefined,
});

// Register room creation/join/leave handlers and disconnect/recovery lifecycle behavior.
const registerRoomHandlers = (io, socket) => {
  // On successful Socket.IO recovery, restore the existing player and send missed canvas/state data.
  if (socket.recovered && socket.data.roomCode) {
    clearTimeout(reconnectTimers.get(socket.id));
    reconnectTimers.delete(socket.id);
    const room = RoomStore.getRoom(socket.data.roomCode);
    if (room?.reconnectPlayer(socket.id)) {
      socket.join(room.roomCode);
      room.sendCatchup(io, socket.id);
      broadcastRoomState(io, room);
    }
  }
  // Validate the nickname, leave any previous room, create a room, add its host, and acknowledge it.
  // [SCALING] Await Redis-backed room reservation and report allocation failures over the existing UI event.
  socket.on("room:create", async ({ username, settings } = {}) => {
    if (!username || !username.trim())
      return socket.emit("room:error", { message: "Username is required" });
    try {
      permanentlyLeave(io, socket);
      const room = await RoomStore.createRoom(validSettings(settings));
      const player = new Player(socket.id, username.trim());
      room.addPlayer(player);
      socket.join(room.roomCode);
      socket.data.roomCode = room.roomCode;
      socket.emit("room:created", { roomCode: room.roomCode, player });
      broadcastRoomState(io, room);
    } catch (error) {
      console.error("[cluster] room creation failed:", error);
      socket.emit("room:error", { message: "Could not create room. Please try again." });
    }
  });
  // Validate room details/capacity, leave any previous room, join as player or spectator, and sync state.
  socket.on("room:join", ({ roomCode, username, spectate = false } = {}) => {
    if (!roomCode || !username || !username.trim())
      return socket.emit("room:error", {
        message: "Room code and username are required",
      });
    const room = RoomStore.getRoom(roomCode.toUpperCase());
    if (!room) return socket.emit("room:error", { message: "Room not found" });
    if (!spectate && room.playerCount >= room.maxPlayers)
      return socket.emit("room:error", {
        message: "Room is full; use a spectator link to watch",
      });
    permanentlyLeave(io, socket);
    socket.join(room.roomCode);
    socket.data.roomCode = room.roomCode;
    if (spectate) room.addSpectator(socket.id, username.trim());
    else room.addPlayer(new Player(socket.id, username.trim()));
    socket.emit("room:joined", {
      roomCode: room.roomCode,
      spectate: Boolean(spectate),
    });
    room.sendCatchup(io, socket.id);
    broadcastRoomState(io, room);
  });
  // Explicit leave cancels the reconnect grace timer and removes the participant immediately.
  socket.on("room:leave", () => {
    clearTimeout(reconnectTimers.get(socket.id));
    reconnectTimers.delete(socket.id);
    permanentlyLeave(io, socket);
  });
  // Keep players temporarily in the room for recovery; spectators are removed immediately.
  // After the grace period, permanently remove a player only if they have not reconnected.
  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode,
      room = RoomStore.getRoom(roomCode);
    if (!room) return;
    if (room.isSpectator(socket.id)) return permanentlyLeave(io, socket);
    const wasDrawer = room.disconnectPlayer(socket.id);
    handlePlayerDeparture(io, room, wasDrawer);
    broadcastRoomState(io, room);
    const timer = setTimeout(() => {
      reconnectTimers.delete(socket.id);
      const current = RoomStore.getRoom(roomCode);
      if (current?.getPlayer(socket.id)?.connected === false) {
        const drawerLeft = current.removePlayer(socket.id);
        handlePlayerDeparture(io, current, drawerLeft);
        if (current.isEmpty()) RoomStore.deleteRoom(roomCode);
        else broadcastRoomState(io, current);
      }
    }, RECONNECT_GRACE_MS);
    reconnectTimers.set(socket.id, timer);
  });
};
export default registerRoomHandlers;
