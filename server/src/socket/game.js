/** Game controller: checks permissions, computes scores, and coordinates timed game phases. */
import RoomStore from "../store/RoomStore.js";
import { getWordChoices } from "../game/words.js";

const WORD_CHOICE_DURATION_MS = 10000;
const ROUND_PAUSE_MS = 2500;
const phaseTimers = new Map();
// Make guesses case-insensitive and ignore leading/trailing or repeated whitespace.
const normalizeGuess = (guess) =>
  guess.toLowerCase().trim().replace(/\s+/g, " ");
const publicGameState = (room) => room.getState().gameState;
// Cancel and remove the phase timer so an old callback cannot advance the game later.
const clearPhaseTimer = (roomCode) => {
  const timer = phaseTimers.get(roomCode);
  if (timer) clearTimeout(timer);
  phaseTimers.delete(roomCode);
};
const emitState = (io, room) =>
  io.to(room.roomCode).emit("room:state", room.getState());

// Cancel pending phase work, finalize the Room model, and publish the finished state.
const finishGame = (io, room) => {
  clearPhaseTimer(room.roomCode);
  room.finishGame();
  io.to(room.roomCode).emit("game:finished", {
    gameState: publicGameState(room),
  });
  emitState(io, room);
};

// Start the next turn, clear the canvas, publish state, privately send choices to the drawer,
// and auto-select the first choice if the drawer misses the deadline.
const beginNextTurn = (io, room) => {
  if (
    !room ||
    !room.canContinueGame() ||
    !room.beginNextTurn(getWordChoices(3))
  )
    return finishGame(io, room);
  io.to(room.roomCode).emit("game:clear");
  emitState(io, room);
  const choices = [...room.gameState.wordChoices];
  io.to(room.gameState.drawerId).emit("game:word_choices", {
    choices,
    endsAt: room.gameState.wordChoiceEndsAt,
  });
  clearPhaseTimer(room.roomCode);
  phaseTimers.set(
    room.roomCode,
    setTimeout(
      () => chooseWord(io, room, room.gameState.drawerId, choices[0]),
      WORD_CHOICE_DURATION_MS
    )
  );
};

// Validate the drawer selection, switch to DRAWING, reveal the word only to the drawer,
// publish public state, and schedule the drawing deadline.
const chooseWord = (io, room, playerId, word) => {
  if (!room || !room.chooseWord(playerId, word)) return;
  clearPhaseTimer(room.roomCode);
  io.to(room.roomCode).emit("game:round_started", {
    gameState: publicGameState(room),
  });
  io.to(playerId).emit("game:word", { word });
  emitState(io, room);
  phaseTimers.set(
    room.roomCode,
    setTimeout(
      () => endRound(io, room, "time"),
      room.gameState.drawTimeSeconds * 1000
    )
  );
};

// End the active phase, reveal the answer to the room, publish state, and schedule the next turn.
const endRound = (io, room, reason) => {
  if (!room) return;
  clearPhaseTimer(room.roomCode);
  const word = room.endRound();
  if (word === null && room.gameState.phase !== "ROUND_END") return;
  io.to(room.roomCode).emit("game:round_ended", { word, reason });
  emitState(io, room);
  phaseTimers.set(
    room.roomCode,
    setTimeout(() => beginNextTurn(io, room), ROUND_PAUSE_MS)
  );
};

// Finish if too few players remain, or end the current turn if the drawer departed.
export const handlePlayerDeparture = (io, room, wasDrawer) => {
  if (!room || room.gameState.status !== "playing") return;
  if (room.connectedCount < 2) return finishGame(io, room);
  if (wasDrawer) {
    clearPhaseTimer(room.roomCode);
    endRound(io, room, "drawer_left");
  }
};

// Register start-game, word-choice, and guess events for the connected player.
const registerGameHandlers = (io, socket) => {
  // Only the host may start; Room rules verify that enough connected players are present.
  socket.on("game:start", () => {
    const room = RoomStore.getRoom(socket.data.roomCode);
    if (!room)
      return socket.emit("game:error", { message: "You are not in a room" });
    if (room.hostId !== socket.id)
      return socket.emit("game:error", {
        message: "Only the host can start the game",
      });
    if (!room.canStartGame())
      return socket.emit("game:error", {
        message: "At least 2 players are required to start",
      });
    room.startGame();
    io.to(room.roomCode).emit("game:started", {
      gameState: publicGameState(room),
    });
    beginNextTurn(io, room);
  });

  // Forward the submitted choice; Room validates drawer ownership and the offered choice.
  socket.on("game:choose_word", ({ word } = {}) => {
    const room = RoomStore.getRoom(socket.data.roomCode);
    if (!room || typeof word !== "string") return;
    chooseWord(io, room, socket.id, word);
  });

  // Validate the guesser and round, broadcast wrong guesses, or award points for a match.
  socket.on("game:guess", ({ guess } = {}) => {
    const room = RoomStore.getRoom(socket.data.roomCode);
    const text = typeof guess === "string" ? guess.trim() : "";
    if (!room || room.gameState.phase !== "DRAWING")
      return socket.emit("game:error", {
        message: "There is no active drawing turn",
      });
    if (!text)
      return socket.emit("game:error", { message: "Enter a guess first" });
    if (socket.id === room.gameState.drawerId)
      return socket.emit("game:error", { message: "The drawer cannot guess" });
    if (room.gameState.guessedPlayerIds.includes(socket.id))
      return socket.emit("game:error", {
        message: "You already guessed correctly this round",
      });
    const player = room.getPlayer(socket.id);
    if (!player) return;
    if (normalizeGuess(text) !== normalizeGuess(room.gameState.word || "")) {
      return io
        .to(room.roomCode)
        .emit("game:guess", {
          playerId: player.id,
          username: player.username,
          guess: text.slice(0, 80),
          correct: false,
        });
    }
    room.markCorrectGuess(socket.id);
    // Faster correct guesses earn a base award plus a time-proportional bonus.
    const timeRemaining =
      Math.max(0, room.gameState.roundEndsAt - Date.now()) / 1000;
    const points =
      50 + Math.round((timeRemaining / room.gameState.drawTimeSeconds) * 250);
    player.score += points;
    const drawer = room.getPlayer(room.gameState.drawerId);
    if (drawer) drawer.score += 25;
    io.to(room.roomCode).emit("game:correct_guess", {
      playerId: player.id,
      username: player.username,
      points,
    });
    emitState(io, room);
    const guessers = room
      .getPlayers()
      .filter((candidate) => candidate.id !== room.gameState.drawerId);
    if (
      guessers.length &&
      guessers.every((candidate) =>
        room.gameState.guessedPlayerIds.includes(candidate.id)
      )
    )
      endRound(io, room, "all_guessed");
  });
};

export default registerGameHandlers;
