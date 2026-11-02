/** Drawing event handlers: validate drawing actions and synchronize stroke history across clients. */
import RoomStore from "../store/RoomStore.js";
// Accept only finite normalized coordinates/widths in the expected 0-to-1 range.
const isUnit = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
// Validate stroke shape, tool, positions, and brush width before storing/broadcasting it.
const isValidStroke = (stroke) =>
  stroke &&
  typeof stroke.id === "string" &&
  stroke.id.length <= 80 &&
  ["brush", "eraser", "fill"].includes(stroke.tool) &&
  isUnit(stroke.x) &&
  isUnit(stroke.y) &&
  (stroke.tool === "fill" ||
    (isUnit(stroke.prevX) &&
      isUnit(stroke.prevY) &&
      Number.isFinite(stroke.lineWidth) &&
      stroke.lineWidth >= 0.001 &&
      stroke.lineWidth <= 0.1));
// Register draw, clear, and undo events for one client socket.
const registerDrawingHandlers = (io, socket) => {
  // Resolve the sender room and enforce that only the current drawer can edit the canvas.
  const activeRoom = () => {
    const room = RoomStore.getRoom(socket.data.roomCode);
    if (
      !room ||
      room.gameState.phase !== "DRAWING" ||
      room.gameState.drawerId !== socket.id
    ) {
      socket.emit("game:error", {
        message: "Only the current drawer can draw",
      });
      return null;
    }
    return room;
  };
  // Validate and sanitize each stroke, store it on the server, then relay it to other room members.
  socket.on("game:draw", (stroke) => {
    const room = activeRoom();
    if (!room) return;
    if (!isValidStroke(stroke))
      return socket.emit("game:error", { message: "Invalid drawing data" });
    // Rebuild the payload from approved fields; constrain color/width and normalize fill metadata.
    const safeStroke = {
      id: stroke.id,
      tool: stroke.tool,
      x: stroke.x,
      y: stroke.y,
      prevX: stroke.tool === "fill" ? stroke.x : stroke.prevX,
      prevY: stroke.tool === "fill" ? stroke.y : stroke.prevY,
      color:
        typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color)
          ? stroke.color
          : "#1f2937",
      lineWidth:
        stroke.tool === "fill"
          ? 0
          : Math.min(Math.max(stroke.lineWidth, 0.001), 0.1),
    };
    if (!room.addStroke(socket.id, safeStroke)) return;
    socket.to(room.roomCode).emit("game:draw", safeStroke);
  });
  // Clear authoritative stroke history, then notify every room member including the drawer.
  socket.on("game:clear", () => {
    const room = activeRoom();
    if (room?.clearCanvas(socket.id)) io.to(room.roomCode).emit("game:clear");
  });
  // Remove a stroke through the Room model and broadcast the exact stroke ID removed.
  socket.on("game:undo", ({ id } = {}) => {
    const room = activeRoom();
    if (!room) return;
    const undoneId = room.undoStroke(
      socket.id,
      typeof id === "string" ? id : undefined
    );
    if (undoneId) io.to(room.roomCode).emit("game:undo", { id: undoneId });
  });
};
export default registerDrawingHandlers;
