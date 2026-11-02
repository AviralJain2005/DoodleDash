/** Socket.IO bootstrap: wires room, game, and drawing handlers to each connected socket. */
import registerRoomHandlers from "./room.js";
import registerGameHandlers from "./game.js";
import registerDrawingHandlers from "./drawing.js";

// Attach a connection callback and register each group of event handlers for every client.
const initializeSocket = (io) => {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Room membership/lifecycle, game rules, and drawing events live in separate modules.
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerDrawingHandlers(io, socket);

    // Log transport disconnects; room.js separately handles player cleanup and reconnection grace periods.
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

export default initializeSocket;
