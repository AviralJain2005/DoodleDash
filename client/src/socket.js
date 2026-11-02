// One shared Socket.IO connection used by the app and its UI components.
import { io } from "socket.io-client";

const gatewayUrl = import.meta.env.VITE_GATEWAY_URL; // [SCALING] Enables owner routing only when configured.
export const socket = io(
  import.meta.env.VITE_SERVER_URL || "http://localhost:3000",
  { autoConnect: !gatewayUrl }, // [SCALING] Preserve eager standalone connection and wait for explicit routing in cluster mode.
);

// [SCALING] Resolve a room owner before using the same shared socket; errors reuse the UI's room:error path.
// [SCALING] Resolve a room owner using the required HTTP method.
const connectViaGateway = async (path, method = "GET") => {
  if (!gatewayUrl) return;
  try {
    const response = await fetch(
      `${gatewayUrl.replace(/\/$/, "")}${path}`,
      { method }
    );
    const route = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(route.error || "Could not route to room server");
    const target = route.url.replace(/\/$/, "");
    if (socket.connected && socket.io.uri === target) return;
    if (socket.connected) socket.disconnect();
    socket.io.uri = target;
    await new Promise((resolve, reject) => {
      const onConnect = () => { cleanup(); resolve(); };
      const onError = (error) => { cleanup(); reject(error); };
      const cleanup = () => {
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
      };
      socket.once("connect", onConnect);
      socket.once("connect_error", onError);
      socket.connect();
    });
  } catch (error) {
    socket.emitReserved("room:error", { message: error.message || "Could not connect to room server" }); // [SCALING] Dispatch locally through App's existing room:error listener.
    throw error;
  }
};

// [SCALING] Room allocation requires POST.
export const connectForCreate = () =>
  connectViaGateway("/assign", "POST");

// [SCALING] Room lookup requires GET.
export const connectForJoin = (code) =>
  connectViaGateway(`/route/${encodeURIComponent(code)}`, "GET");
