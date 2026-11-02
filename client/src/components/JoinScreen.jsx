/** Create/join screen, kept separate from socket lifecycle and game state. */
export default function JoinScreen({
  username,
  setUsername,
  roomCode,
  setRoomCode,
  spectate,
  setSpectate,
  settings,
  setSettings,
  error,
  submit,
  join,
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center p-6">
      <section className="w-full max-w-md rounded-[2rem] border-4 border-slate-900 bg-white p-8 shadow-[12px_12px_0_#f472b6]">
        <p className="mb-1 font-bold tracking-widest text-pink-600">
          MULTIPLAYER DRAWING GAME
        </p>
        <h1 className="font-display text-5xl font-black">DoodleDash</h1>
        <p className="mb-7 mt-3 text-slate-600">
          Draw wildly. Guess quickly. Win bragging rights.
        </p>
        {error && (
          <p className="mb-4 rounded-lg bg-red-100 p-3 text-red-800">{error}</p>
        )}
        <form onSubmit={submit} className="space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength="20"
            placeholder="Your nickname"
            className="w-full rounded-xl border-2 border-slate-900 p-3"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">
              Rounds
              <select
                value={settings.rounds}
                onChange={(e) =>
                  setSettings({ ...settings, rounds: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-lg border-2 border-slate-900 p-2"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
            <label className="text-sm font-bold">
              Draw time
              <select
                value={settings.drawTimeSeconds}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    drawTimeSeconds: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border-2 border-slate-900 p-2"
              >
                <option value="30">30 sec</option>
                <option value="60">60 sec</option>
                <option value="90">90 sec</option>
                <option value="120">120 sec</option>
              </select>
            </label>
          </div>
          <button className="w-full rounded-xl bg-amber-400 p-3 font-black shadow-[3px_3px_0_#172033]">
            Create a room
          </button>
        </form>
        <div className="my-6 border-t-2 border-dashed border-slate-300" />
        <form onSubmit={join} className="space-y-3">
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            className="w-full rounded-xl border-2 border-slate-900 p-3 uppercase"
          />
          <button className="w-full rounded-xl bg-sky-400 p-3 font-black shadow-[3px_3px_0_#172033]">
            Join room
          </button>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={spectate}
              onChange={(e) => setSpectate(e.target.checked)}
            />{" "}
            Join as spectator
          </label>
        </form>
      </section>
    </main>
  );
}
