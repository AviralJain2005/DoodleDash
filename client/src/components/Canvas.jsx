/** Canvas component: draws locally for responsiveness and synchronizes stroke operations through Socket.IO.
 * It also replays history after resize/reconnect and delegates flood-fill work to a Web Worker.
 */
import { useEffect, useRef, useState } from "react";
import { socket } from "../socket.js";
import { DRAW_COLORS } from "../constants.js";

export default function Canvas({ drawer, onDraw, clearSignal }) {
  const canvasRef = useRef(null),
    drawing = useRef(false),
    previous = useRef(null),
    strokeId = useRef(null),
    history = useRef([]),
    worker = useRef(null),
    jobId = useRef(0);
  const [color, setColor] = useState("#172033");
  const [tool, setTool] = useState("brush");
  // Convert a CSS hex color to RGBA bytes expected by ImageData and the flood-fill worker.
  const hexColor = (value) => {
    const raw = value.slice(1);
    return [
      parseInt(raw.slice(0, 2), 16),
      parseInt(raw.slice(2, 4), 16),
      parseInt(raw.slice(4, 6), 16),
      255,
    ];
  };
  // Capture the canvas pixels and send a fill request to the worker with a unique job ID.
  const fill = (ctx, stroke) => {
    if (!worker.current) return;
    const canvas = ctx.canvas,
      x = Math.round(stroke.x * (canvas.width - 1)),
      y = Math.round(stroke.y * (canvas.height - 1)),
      image = ctx.getImageData(0, 0, canvas.width, canvas.height),
      currentJob = ++jobId.current;
    worker.current.postMessage(
      {
        pixels: image.data.buffer,
        width: canvas.width,
        height: canvas.height,
        x,
        y,
        color: hexColor(stroke.color),
        jobId: currentJob,
      },
      [image.data.buffer],
    );
  };
  // Render one recorded operation: flood fill for fill strokes, or a line for brush/eraser strokes.
  const paint = (stroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (stroke.tool === "fill") return fill(ctx, stroke);
    ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
    ctx.lineWidth = stroke.lineWidth * canvas.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(stroke.prevX * canvas.width, stroke.prevY * canvas.height);
    ctx.lineTo(stroke.x * canvas.width, stroke.y * canvas.height);
    ctx.stroke();
  };
  // Rebuild the visible canvas from the authoritative local stroke history.
  const repaint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    history.current.forEach(paint);
  };
  // Create the flood-fill worker once, ignore stale results, and terminate it when Canvas unmounts.
  useEffect(() => {
    const floodWorker = new Worker(
      new URL("../workers/floodFill.worker.js", import.meta.url),
      { type: "module" },
    );
    worker.current = floodWorker;
    floodWorker.onmessage = ({ data }) => {
      if (!data.ok || data.jobId !== jobId.current || !canvasRef.current)
        return;
      const canvas = canvasRef.current,
        ctx = canvas.getContext("2d");
      ctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(data.pixels),
          canvas.width,
          canvas.height,
        ),
        0,
        0,
      );
    };
    return () => {
      floodWorker.terminate();
      worker.current = null;
    };
  }, []);
  // Subscribe to remote draw/clear/undo/catch-up events and mirror them in local history.
  useEffect(() => {
    const receiveStroke = (stroke) => {
      history.current.push(stroke);
      paint(stroke);
    };
    const clear = () => {
      history.current = [];
      repaint();
    };
    const undo = ({ id }) => {
      history.current = history.current.filter((stroke) => stroke.id !== id);
      repaint();
    };
    const catchup = (strokes) => {
      history.current = strokes;
      repaint();
    };
    socket.on("game:draw", receiveStroke);
    socket.on("game:clear", clear);
    socket.on("game:undo", undo);
    socket.on("game:catchup", catchup);
    return () => {
      socket.off("game:draw", receiveStroke);
      socket.off("game:clear", clear);
      socket.off("game:undo", undo);
      socket.off("game:catchup", catchup);
    };
  }, []);
  // Size the backing canvas for the display pixel ratio and repaint after every resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      repaint();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  // Convert pointer coordinates into normalized 0-to-1 values so canvases of different sizes agree.
  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };
  // Apply a stroke immediately for local responsiveness, then send it to the server for validation/relay.
  const emitStroke = (stroke) => {
    history.current.push(stroke);
    paint(stroke);
    onDraw(stroke);
  };
  // While a drawing gesture is active, emit a line segment from the previous pointer point to the next.
  const move = (event) => {
    if (!drawer || !drawing.current || tool === "fill") return;
    const next = point(event);
    const stroke = {
      id: strokeId.current,
      tool,
      ...next,
      prevX: previous.current.x,
      prevY: previous.current.y,
      color,
      lineWidth: 0.006,
    };
    emitStroke(stroke);
    previous.current = next;
  };
  // Begin a new stroke, generate its ID, and either fill immediately or capture pointer movement.
  const start = (event) => {
    if (!drawer) return;
    const startPoint = point(event);
    strokeId.current =
      crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    if (tool === "fill")
      return emitStroke({
        id: strokeId.current,
        tool,
        ...startPoint,
        color,
        lineWidth: 0,
      });
    drawing.current = true;
    previous.current = startPoint;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  return (
    <div className="overflow-hidden rounded-3xl border-4 border-slate-900 bg-white shadow-[8px_8px_0_#fbbf24]">
      <canvas
        ref={canvasRef}
        className={
          drawer
            ? "h-[390px] w-full touch-none cursor-crosshair"
            : "h-[390px] w-full"
        }
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => {
          drawing.current = false;
          strokeId.current = null;
        }}
        onPointerLeave={() => {
          drawing.current = false;
          strokeId.current = null;
        }}
      />
      {drawer && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-slate-900 bg-amber-50 px-4 py-2 text-sm">
          <label>
            Ink{" "}
            <input
              aria-label="Ink color"
              className="ml-2 h-7 w-10 align-middle"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <div className="flex gap-1">
            {DRAW_COLORS.map((preset) => (
              <button
                key={preset}
                aria-label="Use preset color"
                onClick={() => setColor(preset)}
                className="h-5 w-5 rounded-full border-2 border-white shadow"
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTool("brush")}
              className={
                tool === "brush"
                  ? "rounded-lg bg-slate-900 px-3 py-1 font-bold text-white"
                  : "rounded-lg bg-white px-3 py-1 font-bold"
              }
            >
              Brush
            </button>
            <button
              onClick={() => setTool("eraser")}
              className={
                tool === "eraser"
                  ? "rounded-lg bg-slate-900 px-3 py-1 font-bold text-white"
                  : "rounded-lg bg-white px-3 py-1 font-bold"
              }
            >
              Eraser
            </button>
            <button
              onClick={() => setTool("fill")}
              className={
                tool === "fill"
                  ? "rounded-lg bg-slate-900 px-3 py-1 font-bold text-white"
                  : "rounded-lg bg-white px-3 py-1 font-bold"
              }
            >
              Fill
            </button>
            <button
              onClick={() => socket.emit("game:undo", {})}
              className="rounded-lg bg-white px-3 py-1 font-bold"
            >
              Undo
            </button>
            <button
              onClick={clearSignal}
              className="rounded-lg bg-slate-900 px-3 py-1 font-bold text-white"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
