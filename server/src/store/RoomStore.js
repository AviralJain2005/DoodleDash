/** RoomStore is exported as a singleton so all backend modules share one in-memory room map. */
import Room from "../game/Room.js";
import generateRoomCode from "../utils/roomCode.js";
import { nodeId, redis, updateNodeLoad } from "../cluster/redis.js"; // [SCALING] Redis directory reserves globally unique codes and tracks local load.

// Process-local registry mapping room codes to live Room objects.
class RoomStore {
  // Map gives fast lookup by room code; contents are lost when this process restarts.
  constructor() {
    this.rooms = new Map();
  }
  // [SCALING] Reserve globally unique codes through Redis before creating the process-local Room.
  async createRoom(settings) {
    let roomCode;
    if (redis) {
      do {
        roomCode = generateRoomCode();
      } while (!(await redis.set(`room:${roomCode}`, nodeId, "NX", "EX", 60)));
    } else {
      do {
        roomCode = generateRoomCode();
      } while (this.rooms.has(roomCode));
    }
    const room = new Room(roomCode, settings);
    this.rooms.set(roomCode, room);
    if (redis) await updateNodeLoad(this.rooms.size);
    return room;
  }
  // Retrieve a room or undefined when that code is not currently active.
  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }
  // [SCALING] Remove locally synchronously; clean Redis directory and absolute load asynchronously.
  deleteRoom(roomCode) {
    this.rooms.delete(roomCode);
    if (redis) {
      redis.del(`room:${roomCode}`).then(() => updateNodeLoad(this.rooms.size)).catch((error) => console.error("[cluster] room cleanup failed:", error));
    }
  }
  // Check whether a room code is currently registered.
  hasRoom(roomCode) {
    return this.rooms.has(roomCode);
  }
}
export default new RoomStore();
