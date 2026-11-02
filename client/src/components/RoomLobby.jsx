/** Waiting room and game-end screen: participants, invite links, and host controls. */
import { socket } from "../socket.js";

export default function RoomLobby({
  room,
  game,
  me,
  copyInvite,
  shareMessage,
}) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-4xl font-black">Room {room.roomCode}</h1>
      <p className="mt-2 text-slate-600">
        {game.phase === "GAME_END"
          ? "Game complete — the host can start another."
          : "Share this code, then wait for your drawing crew."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => copyInvite(false)}
          className="rounded-lg bg-sky-200 px-3 py-2 font-bold"
        >
          Copy invite link
        </button>
        <button
          onClick={() => copyInvite(true)}
          className="rounded-lg bg-violet-200 px-3 py-2 font-bold"
        >
          Copy spectator link
        </button>
        {shareMessage && (
          <span className="self-center text-sm text-slate-600">
            {shareMessage}
          </span>
        )}
      </div>
      <section className="mt-7 rounded-3xl border-3 border-slate-900 bg-white p-6 shadow-lg">
        <h2 className="font-bold">
          Players ({room.players.length}/8) · {room.spectatorCount || 0}{" "}
          spectators · {game.totalRounds} rounds · {game.drawTimeSeconds}s turns
        </h2>
        <ul className="mt-4 space-y-3">
          {room.players.map((player) => (
            <li
              key={player.id}
              className="flex justify-between rounded-xl bg-slate-100 p-3"
            >
              <span>
                {player.username} {player.id === me && "(you)"}
              </span>
              {player.id === room.hostId && <b>HOST</b>}
            </li>
          ))}
        </ul>
        {room.hostId === me ? (
          <button
            onClick={() => socket.emit("game:start")}
            className="mt-6 w-full rounded-xl bg-emerald-400 p-3 font-black shadow-[3px_3px_0_#172033]"
          >
            {game.phase === "GAME_END" ? "Play again" : "Start game"}
          </button>
        ) : (
          <p className="mt-6 text-center text-slate-500">
            Waiting for the host to start…
          </p>
        )}
      </section>
    </main>
  );
}
