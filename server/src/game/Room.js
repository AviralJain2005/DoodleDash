/** Room model: centralizes game data and state-changing rules; socket handlers coordinate events and timers. */
// Domain model for one game: owns players, settings, phase, scores, turn order, and stroke history.
class Room {
  // Initialize room collections and clamp configurable settings to supported ranges.
  constructor(roomCode, settings = {}) {
    this.roomCode = roomCode;
    this.hostId = null;
    this.players = new Map();
    this.spectators = new Map();
    this.settings = {
      rounds: Math.min(10, Math.max(1, Number(settings.rounds) || 3)),
      drawTimeSeconds: Math.min(
        180,
        Math.max(20, Number(settings.drawTimeSeconds) || 60)
      ),
    };
    this.maxPlayers = 8;
    this.gameState = {
      status: "waiting",
      phase: "LOBBY",
      currentRound: 0,
      totalRounds: this.settings.rounds,
      drawTimeSeconds: this.settings.drawTimeSeconds,
      drawerId: null,
      word: null,
      wordChoices: [],
      wordChoiceEndsAt: null,
      roundEndsAt: null,
      winner: null,
      guessedPlayerIds: [],
    };
    this.turnOrder = [];
    this.drawerIndex = -1;
    this.strokes = [];
  }
  get playerCount() {
    return this.players.size;
  }
  get connectedCount() {
    return [...this.players.values()].filter((player) => player.connected)
      .length;
  }
  get spectatorCount() {
    return this.spectators.size;
  }
  isEmpty() {
    return this.players.size === 0 && this.spectators.size === 0;
  }
  // Build the public snapshot sent to clients; hide the secret word and word choices.
  getState() {
    return {
      roomCode: this.roomCode,
      hostId: this.hostId,
      players: this.getPlayers(),
      spectatorCount: this.spectatorCount,
      gameState: { ...this.gameState, word: null, wordChoices: [] },
    };
  }
  // Add a player, enforce capacity, mark them connected, and assign the first player as host.
  addPlayer(player) {
    if (this.players.size >= this.maxPlayers) throw new Error("Room is full");
    player.connected = true;
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
  }
  // Register a read-only spectator with a display name capped at 24 characters.
  addSpectator(id, username) {
    this.spectators.set(id, {
      id,
      username: username.slice(0, 24) || "Spectator",
    });
  }
  removeSpectator(id) {
    return this.spectators.delete(id);
  }
  isSpectator(id) {
    return this.spectators.has(id);
  }
  // Restore a temporarily disconnected player if their existing ID is still in the room.
  reconnectPlayer(id) {
    const player = this.players.get(id);
    if (!player) return false;
    player.connected = true;
    return true;
  }
  // Mark a player disconnected without deleting their score during the grace period.
  disconnectPlayer(id) {
    const player = this.players.get(id);
    if (!player) return false;
    player.connected = false;
    return this.gameState.drawerId === id;
  }
  // Remove a player, repair turn order/guess tracking, and transfer host if needed.
  removePlayer(playerId) {
    const wasDrawer = this.gameState.drawerId === playerId,
      removedIndex = this.turnOrder.indexOf(playerId);
    this.players.delete(playerId);
    if (removedIndex !== -1 && removedIndex <= this.drawerIndex)
      this.drawerIndex -= 1;
    this.turnOrder = this.turnOrder.filter((id) => id !== playerId);
    this.gameState.guessedPlayerIds = this.gameState.guessedPlayerIds.filter(
      (id) => id !== playerId
    );
    if (this.hostId === playerId)
      this.hostId =
        [...this.players.values()].find((player) => player.connected)?.id ||
        this.players.values().next().value?.id ||
        null;
    return wasDrawer;
  }
  getPlayer(playerId) {
    return this.players.get(playerId);
  }
  getPlayers() {
    return Array.from(this.players.values());
  }
  // A game needs two connected players and must be in the lobby or game-end phase.
  canStartGame() {
    return (
      ["LOBBY", "GAME_END"].includes(this.gameState.phase) &&
      this.connectedCount >= 2
    );
  }
  // Reset game state and scores, then prepare the order in which players will draw.
  startGame() {
    if (!this.canStartGame()) throw new Error("Game cannot be started");
    Object.assign(this.gameState, {
      status: "playing",
      phase: "LOBBY",
      currentRound: 0,
      drawerId: null,
      word: null,
      wordChoices: [],
      wordChoiceEndsAt: null,
      roundEndsAt: null,
      winner: null,
      guessedPlayerIds: [],
    });
    this.getPlayers().forEach((player) => {
      player.score = 0;
    });
    this.turnOrder = Array.from(this.players.keys());
    this.drawerIndex = -1;
    this.strokes = [];
  }
  // Advance turn order, skip disconnected players, and initialize the next word-choice phase.
  // Return false when rounds are complete or no eligible drawer remains.
  beginNextTurn(wordChoices) {
    if (this.gameState.status !== "playing" || this.turnOrder.length === 0)
      return false;
    let attempts = 0;
    while (attempts < this.turnOrder.length) {
      this.drawerIndex += 1;
      if (this.drawerIndex >= this.turnOrder.length) {
        this.drawerIndex = 0;
        this.gameState.currentRound += 1;
      }
      if (this.gameState.currentRound === 0) this.gameState.currentRound = 1;
      if (this.gameState.currentRound > this.gameState.totalRounds)
        return false;
      const player = this.players.get(this.turnOrder[this.drawerIndex]);
      if (player?.connected) {
        Object.assign(this.gameState, {
          phase: "CHOOSING",
          drawerId: player.id,
          word: null,
          wordChoices,
          wordChoiceEndsAt: Date.now() + 10000,
          roundEndsAt: null,
          guessedPlayerIds: [],
        });
        this.strokes = [];
        return true;
      }
      attempts += 1;
    }
    return false;
  }
  // Accept a choice only from the current drawer and only if it was offered for this turn.
  chooseWord(playerId, word) {
    if (
      this.gameState.phase !== "CHOOSING" ||
      this.gameState.drawerId !== playerId ||
      !this.gameState.wordChoices.includes(word)
    )
      return false;
    Object.assign(this.gameState, {
      phase: "DRAWING",
      word,
      wordChoices: [],
      wordChoiceEndsAt: null,
      roundEndsAt: Date.now() + this.gameState.drawTimeSeconds * 1000,
    });
    return true;
  }
  // Move an active phase to ROUND_END and return the word for the reveal.
  endRound() {
    if (!["CHOOSING", "DRAWING"].includes(this.gameState.phase)) return null;
    const word = this.gameState.word;
    Object.assign(this.gameState, {
      phase: "ROUND_END",
      wordChoices: [],
      wordChoiceEndsAt: null,
      roundEndsAt: null,
    });
    return word;
  }
  canContinueGame() {
    return (
      this.gameState.status === "playing" &&
      this.connectedCount >= 2 &&
      this.gameState.currentRound <= this.gameState.totalRounds
    );
  }
  // Record a correct guess once per player per round; reject duplicate scoring attempts.
  markCorrectGuess(playerId) {
    if (this.gameState.guessedPlayerIds.includes(playerId)) return false;
    this.gameState.guessedPlayerIds.push(playerId);
    return true;
  }
  // Store a stroke only from the connected active drawer during drawing, with a per-turn cap.
  addStroke(playerId, stroke) {
    if (
      this.gameState.phase !== "DRAWING" ||
      playerId !== this.gameState.drawerId ||
      !this.players.get(playerId)?.connected ||
      this.strokes.length >= 2000
    )
      return false;
    this.strokes.push(stroke);
    return true;
  }
  // Clear recorded stroke history only when the current drawer requests it during drawing.
  clearCanvas(playerId) {
    if (
      this.gameState.phase !== "DRAWING" ||
      playerId !== this.gameState.drawerId
    )
      return false;
    this.strokes = [];
    return true;
  }
  // Remove a requested stroke, or the most recent stroke when no ID is supplied.
  undoStroke(playerId, strokeId) {
    if (
      this.gameState.phase !== "DRAWING" ||
      playerId !== this.gameState.drawerId
    )
      return null;
    const targetId = strokeId || this.strokes.at(-1)?.id;
    if (!targetId || !this.strokes.some((stroke) => stroke.id === targetId))
      return null;
    this.strokes = this.strokes.filter((stroke) => stroke.id !== targetId);
    return targetId;
  }
  // Send stroke history to a newly joined/recovered client so its canvas can catch up.
  sendCatchup(io, socketId) {
    if (this.strokes.length) io.to(socketId).emit("game:catchup", this.strokes);
  }
  // Sort players by score, store the winner summary, and clear drawing history.
  finishGame() {
    const players = this.getPlayers().sort((a, b) => b.score - a.score);
    Object.assign(this.gameState, {
      status: "finished",
      phase: "GAME_END",
      drawerId: null,
      word: null,
      wordChoices: [],
      wordChoiceEndsAt: null,
      roundEndsAt: null,
      winner: players[0]
        ? {
            id: players[0].id,
            username: players[0].username,
            score: players[0].score,
          }
        : null,
    });
    this.strokes = [];
  }
}
export default Room;
