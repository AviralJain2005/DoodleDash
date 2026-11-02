// Safe initial state until the server sends the first authoritative room snapshot.
export const blankRoom = {
  players: [],
  spectatorCount: 0,
  gameState: {
    status: "waiting",
    phase: "LOBBY",
    currentRound: 0,
    totalRounds: 3,
    drawTimeSeconds: 60,
  },
};

// Preset colors shown in the drawing toolbar.
export const DRAW_COLORS = [
  "#172033",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];
