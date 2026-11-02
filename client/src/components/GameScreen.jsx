/** Active game layout: drawing canvas, word choices, guessing, feed, and scoreboard. */
import Canvas from "./Canvas.jsx";
import { socket } from "../socket.js";

export default function GameScreen({
  room,
  game,
  drawer,
  canDraw,
  spectator,
  drawerName,
  seconds,
  word,
  choices,
  guess,
  setGuess,
  feed,
}) {
  return (
    <main className="mx-auto max-w-6xl p-4 md:p-7">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">DoodleDash</h1>
          <p className="font-bold text-slate-600">
            Round {game.currentRound}/{game.totalRounds} ·{" "}
            {game.phase === "ROUND_END" ? "next turn soon" : `${seconds}s left`}
          </p>
        </div>
        <div className="rounded-full bg-amber-300 px-5 py-2 font-bold">
          {spectator
            ? "Spectating — watch the drawing unfold"
            : game.phase === "CHOOSING"
              ? drawerName + " is choosing a word"
              : canDraw
                ? "Your word: " + (word || "…")
                : drawerName + " is drawing"}
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section>
          {game.phase === "CHOOSING" && drawer && (
            <div className="mb-4 rounded-2xl border-2 border-slate-900 bg-pink-100 p-4">
              <b>Choose a word ({seconds}s)</b>
              <div className="mt-3 flex flex-wrap gap-2">
                {choices.map((choice) => (
                  <button
                    key={choice}
                    onClick={() =>
                      socket.emit("game:choose_word", { word: choice })
                    }
                    className="rounded-xl bg-white px-4 py-2 font-bold shadow"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Canvas
            drawer={canDraw}
            onDraw={(stroke) => socket.emit("game:draw", stroke)}
            clearSignal={() => socket.emit("game:clear")}
          />
          {game.phase === "DRAWING" && !drawer && !spectator && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                socket.emit("game:guess", { guess });
                setGuess("");
              }}
              className="mt-5 flex gap-2"
            >
              <input
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Type a guess…"
                className="min-w-0 flex-1 rounded-xl border-2 border-slate-900 p-3"
              />
              <button className="rounded-xl bg-pink-400 px-5 font-black">
                Guess
              </button>
            </form>
          )}
          <div className="mt-4 min-h-24 rounded-xl bg-slate-100 p-3 text-sm">
            {feed.map((message, index) => (
              <p key={index}>{message}</p>
            ))}
          </div>
        </section>
        <aside className="rounded-3xl border-2 border-slate-900 bg-white p-5">
          <h2 className="font-display text-2xl font-black">Scoreboard</h2>
          <ul className="mt-4 space-y-3">
            {[...room.players]
              .sort((a, b) => b.score - a.score)
              .map((player) => (
                <li key={player.id} className="flex justify-between">
                  <span>
                    {player.username}
                    {player.id === game.drawerId ? " ✏️" : ""}
                  </span>
                  <b>{player.score}</b>
                </li>
              ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
