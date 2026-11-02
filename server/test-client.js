/** Manual Socket.IO test harness for simulating players and inspecting server events from a terminal. */
import { io } from "socket.io-client";

// Read test-client arguments: display name, action, and (for join) room code.
const username = process.argv[2];
const action = process.argv[3];
const roomCode = process.argv[4];

// Print usage and stop early when the required command-line arguments are missing.
if (!username || !action) {
  console.log("Usage:");
  console.log("  node test-client.js Alice create");
  console.log("  node test-client.js Bob join ABC123");
  console.log("  node test-client.js Alice start ABC123");
  process.exit(1);
}

// Connect this terminal process to the local Socket.IO server as a simulated browser client.
const socket = io("http://localhost:3000");

// Once connected, perform the requested initial action (create, join, or start).
socket.on("connect", () => {
  console.log(`${username} connected: ${socket.id}`);

  if (action === "create") {
    socket.emit("room:create", {
      username,
    });
  }

  if (action === "join") {
    socket.emit("room:join", {
      roomCode,
      username,
    });
  }

  if (action === "start") {
    socket.emit("game:start");
  }
});

socket.on("room:created", (data) => {
  console.log("ROOM CREATED:", data);
});

socket.on("room:joined", (data) => {
  console.log("ROOM JOINED:", data);
});

socket.on("room:state", (data) => {
  console.log("ROOM STATE:", data);
});

socket.on("game:started", (data) => {
  console.log("GAME STARTED:", data);
});

socket.on("room:error", (data) => {
  console.log("ROOM ERROR:", data);
});

socket.on("game:error", (data) => {
  console.log("GAME ERROR:", data);
});

socket.on("game:word", (data) => {
  console.log("GAME WORD:", data);
});

socket.on("game:draw", (data) => {
  console.log("GAME DRAW:", data);
});

socket.on("game:clear", () => {
  console.log("GAME CLEAR");
});

socket.on("game:guess", (data) => {
  console.log("GAME GUESS:", data);
});

socket.on("game:correct_guess", (data) => {
  console.log("CORRECT GUESS:", data);
});

socket.on("game:round_ended", (data) => {
  console.log("ROUND ENDED:", data);
});

socket.on("game:finished", (data) => {
  console.log("GAME FINISHED:", data);
});

// Allow additional commands to be typed into the terminal while the test socket is connected.
process.stdin.on("data", (input) => {
  const command = input.toString().trim();

  if (command === "start") {
    socket.emit("game:start");
  }

  if (command === "leave") {
    socket.emit("room:leave");
  }

  if (command === "draw") {
    socket.emit("game:draw", { x: 100, y: 100, prevX: 50, prevY: 50 });
  }

  if (command === "clear") {
    socket.emit("game:clear");
  }

  if (command.startsWith("guess ")) {
    socket.emit("game:guess", { guess: command.slice(6) });
  }
});
