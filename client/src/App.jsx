/** App controller: owns shared state, Socket.IO listeners, and user action handlers. */
import { useEffect, useState } from "react";
import { socket, connectForCreate, connectForJoin } from "./socket.js"; // [SCALING] Resolve room affinity before the existing create/join events.
import { blankRoom } from "./constants.js";
import JoinScreen from "./components/JoinScreen.jsx";
import RoomLobby from "./components/RoomLobby.jsx";
import GameScreen from "./components/GameScreen.jsx";

export default function App() {
  const inviteParams = new URLSearchParams(window.location.search);
  const [username, setUsername] = useState(""),
    [roomCode, setRoomCode] = useState(inviteParams.get("room") || ""),
    [spectate, setSpectate] = useState(inviteParams.get("spectate") === "1"),
    [shareMessage, setShareMessage] = useState(""),
    [room, setRoom] = useState(blankRoom),
    [me, setMe] = useState(""),
    [word, setWord] = useState(""),
    [choices, setChoices] = useState([]),
    [guess, setGuess] = useState(""),
    [feed, setFeed] = useState([]),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now()),
    [settings, setSettings] = useState({ rounds: 3, drawTimeSeconds: 60 });
  // Install Socket.IO listeners once, map server events to React state, and clean up on unmount.
  // The interval refreshes the countdown display; the server remains authoritative for deadlines.
  useEffect(() => {
    const addFeed = (message) => setFeed((old) => [...old.slice(-7), message]);
    socket.on("connect", () => setMe(socket.id));
    socket.on("room:state", setRoom);
    socket.on("room:created", ({ roomCode: code }) => setRoomCode(code));
    socket.on("room:joined", ({ roomCode: code }) => setRoomCode(code));
    socket.on("game:word", ({ word: secret }) => setWord(secret));
    socket.on("game:word_choices", ({ choices: options }) => {
      setWord("");
      setChoices(options);
    });
    socket.on("game:round_started", () => {
      setChoices([]);
      setFeed([]);
    });
    socket.on("game:round_ended", ({ word: answer }) => {
      setChoices([]);
      setWord("");
      addFeed(`Round over — the word was “${answer || "not chosen"}”.`);
    });
    socket.on("game:guess", ({ username: name, guess: text }) =>
      addFeed(`${name}: ${text}`),
    );
    socket.on("game:correct_guess", ({ username: name, points }) =>
      addFeed(`${name} got it! +${points}`),
    );
    socket.on("game:error", ({ message }) => setError(message));
    socket.on("room:error", ({ message }) => setError(message));

    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => {
      socket.off();
      clearInterval(timer);
    };
  }, []);
  const game = room.gameState || blankRoom.gameState,
    inRoom = Boolean(room.roomCode),
    drawer = game.drawerId === me,
    canDraw = drawer && game.phase === "DRAWING";
  const endsAt =
    game.phase === "CHOOSING" ? game.wordChoiceEndsAt : game.roundEndsAt;
  const seconds = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  // Validate the nickname locally, then ask the server to create a room with selected settings.
  // [SCALING] Await gateway assignment before emitting the unchanged room:create payload.
  const submit = async (event) => {
    event.preventDefault();
    if (!username.trim()) return setError("Choose a nickname first");
    try {
      await connectForCreate();
      socket.emit("room:create", { username, settings });
    } catch {}
  };
  // Validate nickname and room code locally, then request a player or spectator join.
  // [SCALING] Await room-owner routing before emitting the unchanged room:join payload.
  const join = async (event) => {
    event.preventDefault();
    if (!username.trim() || !roomCode.trim())
      return setError("Enter a nickname and room code");
    try {
      await connectForJoin(roomCode.trim());
      socket.emit("room:join", { username, roomCode, spectate });
    } catch {}
  };
  const spectator = inRoom && !room.players.some((player) => player.id === me);
  // Build a shareable room URL (optionally spectator-only) and copy it to the clipboard.
  const copyInvite = async (watch = false) => {
    const url =
      window.location.origin +
      window.location.pathname +
      "?room=" +
      room.roomCode +
      (watch ? "\&spectate=1" : "");
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage(watch ? "Spectator link copied" : "Invite link copied");
    } catch {
      setShareMessage("Could not copy link");
    }
  };
  // Render the create/join screen until a room snapshot identifies the current room.
  if (!inRoom)
    return (
      <JoinScreen
        username={username}
        setUsername={setUsername}
        roomCode={roomCode}
        setRoomCode={setRoomCode}
        spectate={spectate}
        setSpectate={setSpectate}
        settings={settings}
        setSettings={setSettings}
        error={error}
        submit={submit}
        join={join}
      />
    );

  // Keep lobby and finished-game controls separate from the active drawing layout.
  if (game.phase === "LOBBY" || game.phase === "GAME_END")
    return (
      <RoomLobby
        room={room}
        game={game}
        me={me}
        copyInvite={copyInvite}
        shareMessage={shareMessage}
      />
    );

  // Derive the current drawer label, then pass state to the active-game presentation.
  const drawerName =
    room.players.find((p) => p.id === game.drawerId)?.username || "Someone";
  return (
    <GameScreen
      room={room}
      game={game}
      drawer={drawer}
      canDraw={canDraw}
      spectator={spectator}
      drawerName={drawerName}
      seconds={seconds}
      word={word}
      choices={choices}
      guess={guess}
      setGuess={setGuess}
      feed={feed}
    />
  );
}
